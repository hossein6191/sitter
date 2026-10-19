// The pure helpers of lib/rpc.ts, run from node with no network and no browser:
//
//   node --test tests/unit/rpc.test.mjs
//
// These are the parts every read depends on and no page can show: what counts as rate limiting
// (the browser only ever sees a CORS TypeError for it), how long the cooldown then lasts, and the
// read cache that keeps a page inside Studio's 30 gen_call a minute. Node runs the TypeScript
// source directly; lib/rpc.ts imports nothing, which is what makes that possible.

import test from "node:test";
import assert from "node:assert/strict";

import {
  COOLDOWN_MS,
  ETH_COOLDOWN_MS,
  RATE_LIMIT_CODE,
  base64ToText,
  clearCooldown,
  cooldownRemainingMs,
  createReadCache,
  isMissingMethodError,
  isRateLimitError,
  noteFailure,
  retryAfterMs,
  startCooldown,
} from "../../lib/rpc.ts";

test("a rate-limited request is recognised in every shape Studio and the browser give it", () => {
  assert.equal(isRateLimitError({ code: RATE_LIMIT_CODE, message: "Rate limit exceeded" }), true);
  assert.equal(isRateLimitError({ status: 429 }), true);
  assert.equal(isRateLimitError(new Error("HTTP 429")), true);
  // A 429 carries no CORS header, so in the browser it arrives as a plain fetch TypeError.
  assert.equal(isRateLimitError(new TypeError("Failed to fetch")), true);
  assert.equal(isRateLimitError(new TypeError("Load failed")), true);
  assert.equal(isRateLimitError("Failed to fetch"), true);
  // viem wraps the transport error, so the cause chain is walked.
  assert.equal(isRateLimitError(new Error("read failed", { cause: { code: RATE_LIMIT_CODE } })), true);
  for (const other of [null, undefined, new Error("Contract not found"), { code: -32000 }, "execution failed"]) {
    assert.equal(isRateLimitError(other), false, String(other));
  }
});

test("retry_after is read when it is readable, and a silly one is capped", () => {
  assert.equal(retryAfterMs({ data: { retry_after_seconds: 3 } }), 3000);
  assert.equal(retryAfterMs({ data: { retry_after: "2.5" } }), 2500);
  assert.equal(retryAfterMs({ data: { retry_after_seconds: 86400 } }), 90000);
  assert.equal(retryAfterMs({ data: { retry_after_seconds: 0 } }), null);
  assert.equal(retryAfterMs(new Error("no data")), null);
});

test("the two buckets cool down apart, and only a rate limit starts one", () => {
  clearCooldown();
  const now = 1_000_000;
  assert.equal(noteFailure(new Error("Contract not found"), now, "gen"), false);
  assert.equal(cooldownRemainingMs(now, "gen"), 0);

  assert.equal(noteFailure({ code: RATE_LIMIT_CODE }, now, "gen"), true);
  assert.equal(cooldownRemainingMs(now, "gen"), COOLDOWN_MS);
  assert.equal(cooldownRemainingMs(now, "eth"), 0, "a gen_call 429 must not stall transaction polling");

  assert.equal(noteFailure({ status: 429 }, now, "eth"), true);
  assert.equal(cooldownRemainingMs(now, "eth"), ETH_COOLDOWN_MS);

  // A cooldown is extended, never shortened, and it runs out on its own.
  startCooldown(1000, now, "gen");
  assert.equal(cooldownRemainingMs(now, "gen"), COOLDOWN_MS);
  assert.equal(cooldownRemainingMs(now + COOLDOWN_MS, "gen"), 0);
  clearCooldown();
  assert.equal(cooldownRemainingMs(now, "gen"), 0);
});

test("a view the contract does not have is an answer, not flakiness", () => {
  assert.equal(isMissingMethodError(new Error("call to private method cards")), true);
  assert.equal(
    isMissingMethodError({ data: { receipt: { genvm_result: { stderr: "__handle_undefined_method__" } } } }),
    true,
  );
  assert.equal(isMissingMethodError(new Error("could not reach the network")), false);
});

test("the read cache answers twice from one request, expires, and forgets on demand", async () => {
  let clock = 0;
  let calls = 0;
  const cache = createReadCache(30_000, () => clock);
  const load = async () => {
    calls += 1;
    return `answer ${calls}`;
  };

  // Two callers at once share one request; a later caller inside the window shares the answer.
  const [a, b] = await Promise.all([cache.get("k", load), cache.get("k", load)]);
  assert.deepEqual([a, b, calls], ["answer 1", "answer 1", 1]);
  assert.equal(await cache.get("k", load), "answer 1");
  assert.equal(cache.size(), 1);

  clock = 30_000;
  assert.equal(await cache.get("k", load), "answer 2");

  cache.forget("k");
  assert.equal(cache.size(), 0);
  assert.equal(await cache.get("k", load), "answer 3");

  cache.clear();
  assert.equal(cache.size(), 0);
  assert.equal(await cache.get("k", load), "answer 4");

  // A failed read is never stored: the next caller asks the network again.
  await assert.rejects(cache.get("bad", async () => { throw new Error("could not reach the network"); }));
  assert.equal(await cache.get("bad", load), "answer 5");
});

test("a leader receipt decodes to its text, and nothing throws on rubbish", () => {
  assert.equal(base64ToText(Buffer.from("verdict: breaks", "utf8").toString("base64")), "verdict: breaks");
  assert.equal(base64ToText(Buffer.from("café ☕", "utf8").toString("base64")), "café ☕");
  assert.equal(base64ToText(""), "");
});
