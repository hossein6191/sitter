// The demo sitter, server side only (imported by app/api/demo/*). It holds a throwaway Studio test key
// from the DEMO_SITTER_KEY environment variable and signs exactly three kinds of call with it: accept()
// on a booking made to it with one of the three demo care plans word for word, report() with one of
// that plan's FIXED reports (lib/demo-sitter.ts), and deposit() of its own credit for report fees. The
// instructions only pick the script; nothing a visitor types is ever signed. The key is never logged,
// never returned and never written anywhere; an answer names the demo sitter's public address at most.

import { createAccount, createClient } from "genlayer-js";
import { getAddress, type Address } from "viem";

import { balanceOf, contractAddress, isMock, readBooking, readCredit, readDays, studio } from "./chain";
import { cleanKey, keyProblem } from "./demo-key";
import { DEMO_LIMITS, createLimiter } from "./demo-limit";
import { demoAcceptProblem, demoDayFor, demoReportProblem, isScriptKey, scriptFor, type DemoBooking } from "./demo-sitter";
import { REPORT_FEE } from "./rules";
import { FINAL_STATUSES, rpc, sleep, statusName, type RawTx } from "./rpc";
import type { DemoStatus } from "./types";

type Account = ReturnType<typeof createAccount>;
let account: { key: string; value: Account } | null = null;

/** The demo sitter's account, or null when no usable key is configured. */
function demoAccount(): Account | null {
  const raw = process.env.DEMO_SITTER_KEY;
  if (keyProblem(raw)) return null;
  const key = cleanKey(raw);
  if (!account || account.key !== key) account = { key, value: createAccount(key as `0x${string}`) };
  return account.value;
}

export const NO_CONTRACT_REASON = "the contract is not deployed yet";
export const RPC_DOWN = "Studio's RPC did not answer; try again in a minute";
export const NO_BALANCE = "the demo sitter's account holds no GEN and Studio's faucet did not top it up";
export const NO_CREDIT = "the demo sitter's credit for report fees is being topped up (a deposit is on its way); try again in a minute";

/** Below this many report fees of credit the demo sitter deposits more; the top-up buys TOP_UP_REPORTS. */
const LOW_REPORTS = 3n;
const TOP_UP = REPORT_FEE * 50n;

/** The demo key signs from its own balance; Studio's faucet refills it when it holds less than a GEN. */
async function ensureBalance(sitter: string): Promise<boolean> {
  const have = await balanceOf(sitter);
  if (have >= 10n ** 18n) return true;
  try {
    await rpc("sim_fundAccount", { account_address: getAddress(sitter), amount: 20e18 });
  } catch {
    return have > 0n;
  }
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    try {
      if ((await balanceOf(sitter)) > have) return true;
    } catch {
      /* one dropped read; ask again */
    }
  }
  return have > 0n;
}

// One signature at a time: two calls signed at once would ask for the same nonce.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Signs one call with the demo key and returns its hash. */
async function sign(functionName: string, args: (string | number)[], value = 0n): Promise<string> {
  const a = demoAccount()!;
  const hash = await serial(async () => {
    const client = createClient({ chain: studio, account: a });
    return client.writeContract({ address: contractAddress() as Address, functionName, args, value });
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("no hash");
  return hash;
}

// The last top-up the demo sitter sent, so a second status read does not send another while it lands.
let topUp: { hash: string; at: number } | null = null;

/** Sends a deposit when the credit is low and none is on its way. */
async function topUpCredit(): Promise<void> {
  if (topUp && Date.now() - topUp.at < 120_000) return;
  try {
    topUp = { hash: await sign("deposit", [], TOP_UP), at: Date.now() };
  } catch {
    /* the next status read tries again */
  }
}

/** Whether the demo sitter can act now, and exactly why not. */
export async function demoStatusNow(): Promise<DemoStatus> {
  if (isMock) return { online: false, sitter: "", reason: "in the demo build the demo sitter answers in the browser", reports: 0 };
  const problem = keyProblem(process.env.DEMO_SITTER_KEY);
  if (problem) return { online: false, sitter: "", reason: problem, reports: 0 };
  const sitter = demoAccount()!.address.toLowerCase();
  if (!contractAddress()) return { online: false, sitter, reason: NO_CONTRACT_REASON, reports: 0 };
  let funded = false;
  try {
    funded = await ensureBalance(sitter);
  } catch {
    return { online: false, sitter, reason: RPC_DOWN, reports: 0 };
  }
  if (!funded) return { online: false, sitter, reason: NO_BALANCE, reports: 0 };
  let reports = 0;
  try {
    reports = (await readCredit(sitter, { fresh: true })).data.reports;
  } catch {
    return { online: false, sitter, reason: RPC_DOWN, reports: 0 };
  }
  if (BigInt(reports) < LOW_REPORTS) await topUpCredit();
  if (reports < 1) return { online: false, sitter, reason: NO_CREDIT, reports };
  return { online: true, sitter, reason: "", reports };
}

const limiter = createLimiter(DEMO_LIMITS);

// One call at a time per booking: the hash of the last one, until it is final.
const inflight = new Map<string, { hash: string; at: number }>();

/** True while the demo sitter's last call on `booking` is still going through. */
async function stillMoving(booking: string): Promise<boolean> {
  const last = inflight.get(booking);
  if (!last) return false;
  if (Date.now() - last.at > DEMO_LIMITS.sentHoldMs) {
    inflight.delete(booking);
    return false;
  }
  try {
    const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [last.hash]);
    if (tx && FINAL_STATUSES.has(statusName(tx.status))) {
      inflight.delete(booking);
      return false;
    }
  } catch {
    /* not readable now: still moving, as far as anyone can tell */
  }
  return true;
}

export type ServerAnswer = { status: number; body: { ok: true; hash: string; day?: number } | { ok: false; reason: string; retryAfter?: number } };

/** The checks every demo call shares: online, not asked a moment ago, not still busy on this booking. */
async function gate(booking: string): Promise<ServerAnswer | null> {
  const s = await demoStatusNow();
  if (!s.online) return { status: 503, body: { ok: false, reason: "the demo sitter is offline: " + s.reason } };
  const turn = limiter.attempt(booking, Date.now());
  if (!turn.ok) return { status: 429, body: { ok: false, reason: `the demo sitter was asked about ${booking} a moment ago; try again in ${turn.retryAfter} s`, retryAfter: turn.retryAfter } };
  if (await stillMoving(booking)) return { status: 409, body: { ok: false, reason: `the demo sitter is still waiting for its last call on ${booking} to be final; try again once it is` } };
  return null;
}

/** The booking as the demo checks need it, read fresh; null when there is none. */
async function demoBooking(booking: string): Promise<DemoBooking | null> {
  const b = (await readBooking(booking, { fresh: true })).data;
  return b ? { id: b.id, sitter: b.sitter, status: b.status, instructions: b.instructions, startAt: b.startAt, daySeconds: b.daySeconds, days: b.days } : null;
}

const UNREADABLE: ServerAnswer = { status: 502, body: { ok: false, reason: "could not read the booking from Studio; try again in a minute" } };
// Nothing of a signing error goes out: it is the network's, and it is not the visitor's business.
const NOT_TAKEN: ServerAnswer = { status: 502, body: { ok: false, reason: "Studio did not take the demo sitter's call; try again in a minute" } };

/** The demo sitter accepts a booking made to it with a demo care plan word for word. */
export async function sendDemoAccept(booking: string): Promise<ServerAnswer> {
  const stop = await gate(booking);
  if (stop) return stop;
  let b: DemoBooking | null;
  try {
    b = await demoBooking(booking);
  } catch {
    return UNREADABLE;
  }
  const problem = demoAcceptProblem(b, demoAccount()!.address, Math.floor(Date.now() / 1000));
  if (problem) return { status: b ? 409 : 404, body: { ok: false, reason: problem } };
  try {
    const hash = await sign("accept", [booking]);
    inflight.set(booking, { hash, at: Date.now() });
    return { status: 200, body: { ok: true, hash } };
  } catch {
    return NOT_TAKEN;
  }
}

/**
 * The demo sitter files ONE of its plan's fixed reports on a booking made to it: on the day asked for,
 * or else the day running now, or else the earliest day still open for a report.
 */
export async function sendDemoReport(booking: string, script: string, asked = 0): Promise<ServerAnswer> {
  if (!isScriptKey(script)) return { status: 400, body: { ok: false, reason: "the demo sitter files only the reports its buttons name" } };
  const stop = await gate(booking);
  if (stop) return stop;
  let b: DemoBooking | null;
  let day = 0;
  try {
    b = await demoBooking(booking);
    if (b) {
      const days = (await readDays(booking, { fresh: true })).data.rows.map((d) => ({ day: d.day, state: d.state, tries: d.tries }));
      day = demoDayFor(b, days, Math.floor(Date.now() / 1000), asked);
    }
  } catch {
    return UNREADABLE;
  }
  const problem = demoReportProblem(b, demoAccount()!.address, script, day, asked);
  if (problem) return { status: b ? 409 : 404, body: { ok: false, reason: problem } };
  // The plan picks which fixed report this key names; the report's own words are what is signed.
  const text = scriptFor(b!.instructions, script)!.text;
  try {
    const hash = await sign("report", [booking, day, text]);
    inflight.set(booking, { hash, at: Date.now() });
    return { status: 200, body: { ok: true, hash, day } };
  } catch {
    return NOT_TAKEN;
  }
}
