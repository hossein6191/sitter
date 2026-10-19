// The demo sitter, without a network: the forgiving reader of its key, the limiter, its three care plans
// (each list inside the contract's limits, its four fixed reports and the reading each should earn),
// when it accepts and which day it reports on (only on a demo plan, word for word), and the server's
// routes read as source: a fixed list of reports, no visitor text ever signed, the key never logged or
// returned, and a status that names exactly what is missing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BAD_KEY, NO_KEY, cleanKey, keyProblem } from "../../lib/demo-key.ts";
import { DEMO_LIMITS, createLimiter } from "../../lib/demo-limit.ts";
import * as d from "../../lib/demo-sitter.ts";
import * as rules from "../../lib/rules.ts";

const KEY = "0x" + "ab".repeat(32);
const SITTER = "0x" + "d".repeat(40);

test("the key is read forgivingly and its problem named without repeating it", () => {
  for (const pasted of [KEY, KEY.slice(2), ` "${KEY}" `, `'${KEY.slice(2)}'`, "0X" + KEY.slice(2), "`" + KEY + "`"]) {
    assert.equal(keyProblem(pasted), "", JSON.stringify(pasted));
    assert.equal(cleanKey(pasted), KEY);
  }
  assert.equal(keyProblem(undefined), NO_KEY);
  assert.equal(keyProblem("  "), NO_KEY);
  assert.equal(keyProblem("key"), BAD_KEY);
  assert.equal(keyProblem(KEY + "0"), BAD_KEY);
  assert.ok(!BAD_KEY.includes("ab"), "the problem never repeats the key");
});

test("the limiter allows one call per booking every twenty seconds and twelve a minute in all", () => {
  const l = createLimiter(DEMO_LIMITS);
  assert.equal(l.attempt("B1", 0).ok, true);
  const again = l.attempt("B1", 5_000);
  assert.equal(again.ok, false);
  assert.equal(again.retryAfter, 15);
  assert.equal(l.attempt("B1", 20_000).ok, true);
  for (let k = 2; k <= 11; k++) assert.equal(l.attempt("B" + k, 21_000).ok, true);
  assert.equal(l.attempt("B99", 21_000).ok, false, "twelve in a minute in all");
  l.hold("B50", 60_000, 100_000);
  assert.equal(l.attempt("B50", 120_000).ok, false, "a sent call holds its booking");
});

test("every demo plan is a list the contract takes, and every fixed report is one it takes", () => {
  assert.deepEqual(d.DEMO_PLANS.map((p) => p.key), d.PLAN_KEYS);
  for (const plan of d.DEMO_PLANS) {
    assert.equal(rules.instructionsOf(rules.instructionsJson(plan.instructions)).problem, "", plan.key);
    assert.deepEqual(plan.scripts.map((s) => s.key), d.SCRIPT_KEYS, `${plan.key}: the four reports in order`);
    const seen = new Set();
    for (const s of plan.scripts) {
      assert.equal(rules.reportProblem(s.text), "", `${plan.key}/${s.key}`);
      assert.equal(s.text, rules.pyStrip(rules.plain(s.text)), `${plan.key}/${s.key} is sent as written`);
      assert.ok(s.expect === rules.UNCLEAR || rules.isMask(s.expect, plan.instructions.length), `${plan.key}/${s.key}: ${s.expect}`);
      assert.ok(!seen.has(s.text), "four different reports");
      seen.add(s.text);
    }
    const [all, one, vague, two] = plan.scripts.map((s) => s.expect);
    const n = plan.instructions.length;
    assert.equal(all, "1".repeat(n), `${plan.key}: everything done`);
    assert.equal(rules.doneOf(one), n - 1, `${plan.key}: one missed`);
    assert.equal(vague, rules.UNCLEAR, `${plan.key}: the vague note names nothing`);
    assert.equal(rules.doneOf(two), n - 2, `${plan.key}: two missed`);
    for (const ins of plan.instructions) assert.ok(rules.textProblem(ins, rules.MIN_INSTRUCTION, rules.MAX_INSTRUCTION, "x") === "");
  }
  // The demonstration of contracts/sitter.py and its on-chain run is Biscuit's plan, word for word.
  const smoke = readFileSync(new URL("../../../tests/on_chain/smoke.mjs", import.meta.url), "utf8");
  for (const ins of d.planOf("biscuit").instructions) assert.ok(smoke.includes(JSON.stringify(ins)), ins);
  for (const key of ["all", "one", "vague"]) assert.ok(smoke.includes(JSON.stringify(d.planOf("biscuit").scripts.find((s) => s.key === key).text)), key);
});

test("a plan is matched word for word and in order, and only its own reports are offered", () => {
  const items = d.planOf("pepper").instructions;
  assert.equal(d.planOfInstructions(items)?.key, "pepper");
  assert.equal(d.planOfInstructions([...items].reverse()), null, "another order is another list");
  assert.equal(d.planOfInstructions(items.map((x) => x.toLowerCase())), null, "another spelling is another list");
  assert.equal(d.planOfInstructions(items.slice(1)), null);
  assert.equal(d.scriptFor(items, "one")?.text.includes("did not brush"), true);
  assert.equal(d.scriptFor(items, "free text"), null);
  assert.equal(d.scriptFor(["Feed the goldfish a pinch of flakes"], "all"), null);
  assert.equal(d.scriptedReading(items, d.scriptFor(items, "two").text), "0110");
  assert.equal(d.scriptedReading(items, "anything else"), "");
});

test("the demo sitter accepts only an offer made to it with a plan, before day 1", () => {
  const b = { id: "B4", sitter: SITTER, status: "offered", instructions: d.planOf("house").instructions, startAt: 2000, daySeconds: 600, days: 2 };
  assert.equal(d.demoAcceptProblem(b, SITTER, 1000), "");
  assert.equal(d.demoAcceptProblem(b, SITTER.toUpperCase().replace("0X", "0x"), 1000), "", "addresses compare without case");
  assert.match(d.demoAcceptProblem({ ...b, sitter: "0x" + "e".repeat(40) }, SITTER, 1000), /was not made to the demo sitter/);
  assert.match(d.demoAcceptProblem({ ...b, status: "active" }, SITTER, 1000), /B4 is active; the demo sitter accepts only an offer/);
  assert.match(d.demoAcceptProblem({ ...b, instructions: ["Feed the goldfish a pinch of flakes"] }, SITTER, 1000), /not one of the 3 demo care plans word for word/);
  assert.match(d.demoAcceptProblem(b, SITTER, 2000), /has already started/);
  assert.match(d.demoAcceptProblem(null, SITTER, 1000), /no such booking/);
  assert.match(d.demoAcceptProblem(b, "", 1000), /was not made to the demo sitter/, "no demo sitter, no acceptance");
});

test("the demo sitter reports on the day asked for, else the day running now, else the earliest open day", () => {
  const b = { id: "B4", sitter: SITTER, status: "active", instructions: d.planOf("biscuit").instructions, startAt: 10_000, daySeconds: 600, days: 3 };
  const days = [
    { day: 1, state: "unclear", tries: 1 },
    { day: 2, state: "open", tries: 0 },
    { day: 3, state: "upcoming", tries: 0 },
  ];
  assert.equal(d.demoDayFor(b, days, 10_700), 2, "day 2 is running");
  assert.equal(d.demoDayFor(b, days, 10_700, 1), 1, "day 1 asked for, still open");
  assert.equal(d.demoDayFor(b, days, 10_700, 3), 0, "day 3 is not open");
  assert.equal(d.demoDayFor(b, [{ day: 1, state: "unclear", tries: 1 }, { day: 2, state: "paid", tries: 1 }], 10_700), 1, "else the earliest open day");
  assert.equal(d.demoDayFor(b, [{ day: 1, state: "unclear", tries: 2 }], 10_100), 0, "no third report");
  assert.equal(d.demoReportProblem(b, SITTER, "all", 2), "");
  assert.match(d.demoReportProblem(b, SITTER, "whatever", 2), /only the reports its buttons name/);
  assert.match(d.demoReportProblem({ ...b, status: "finished" }, SITTER, "all", 2), /B4 is finished; reports are taken while it is active/);
  assert.match(d.demoReportProblem(b, SITTER, "all", 0), /no day of B4 is open for a report right now/);
  assert.match(d.demoReportProblem(b, SITTER, "all", 0, 3), /day 3 of B4 is not open for a report now/);
});

test("the server signs only the plan's own words with the key, and never logs or returns it", () => {
  const server = readFileSync(new URL("../../lib/demo-server.ts", import.meta.url), "utf8");
  const routes = ["status", "accept", "report"].map((r) => readFileSync(new URL(`../../app/api/demo/${r}/route.ts`, import.meta.url), "utf8"));
  for (const src of [server, ...routes]) {
    assert.doesNotMatch(src, /console\./, "nothing is logged");
    assert.doesNotMatch(src, /DEMO_SITTER_KEY[^;\n]*(body|json|reason)/i, "the key never goes into an answer");
  }
  const signed = [...server.matchAll(/sign\("(\w+)", \[([^\]]*)\]/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(signed.map((s) => s[0]).sort(), ["accept", "deposit", "report"], "three kinds of call, and nothing else");
  assert.match(server, /const text = scriptFor\(b!\.instructions, script\)!\.text;/, "the report's words are the plan's own");
  assert.deepEqual(signed.find((s) => s[0] === "report")[1].split(",").map((x) => x.trim()), ["booking", "day", "text"]);
  // The routes read only an id, a key from the fixed list and a small day number from the body.
  assert.match(routes[2], /SCRIPT_KEYS as string\[\]\)\.includes\(body\.script\)/);
  assert.match(routes[2], /text\.length > 200/);
  assert.doesNotMatch(routes[2], /body\.text/);
  for (const reason of ["NO_CONTRACT_REASON", "RPC_DOWN", "NO_BALANCE", "NO_CREDIT"]) assert.match(server, new RegExp(`return \\{ online: false, sitter, reason: ${reason}`), reason);
});
