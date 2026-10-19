// A stand-in for the contract, in memory, for NEXT_PUBLIC_MOCK=1. lib/chain.ts delegates here.
//
// It follows contracts/sitter.py on everything deterministic: who may call what and when, the order of
// the checks and their refusal sentences word for word, the report windows, the one re-report after an
// unclear reading, where every atto goes, the counters, and every view answered in the contract's own
// JSON shape, so the mappers in lib/chain.ts run on the same rows in both modes. The one thing it
// cannot do is ask a model: a report is read as SCRIPTED, from the demo sitter's fixed reports for its
// three care plans and the report chips the sitting page offers for any list (any other report lands
// unclear here), and the demo bar says so on every page.
//
// The visitor acts as one of a few demo accounts. The demo sitter accepts bookings made to it with a
// demo care plan and files its fixed reports when its buttons are pressed (demoAccept and demoReport,
// the in-memory twins of POST /api/demo/accept and /api/demo/report). A few bookings are seeded so the
// ledger, the sitting page and the diary have something to show, and the clock can be moved on so a
// day can be seen opening and closing. State lasts as long as the tab.

import type { Call, DemoAnswer, DemoStatus, TxStatus, WriteFn } from "./types.ts";
import { notify } from "./browser-store.ts";
import { demoAcceptProblem, demoDayFor, demoReportProblem, planOf, scriptFor, scriptedReading, type DemoDay } from "./demo-sitter.ts";
import {
  ADDRESS_CHARS,
  ATTO,
  ID_CHARS,
  MAX_ANSWER,
  MAX_DAY_SECONDS,
  MAX_DAYS,
  MAX_INSTRUCTION,
  MAX_INSTRUCTIONS,
  MAX_INSTRUCTIONS_JSON,
  MAX_LEAD,
  MAX_RATE,
  MAX_REPORT,
  MAX_REPORTS,
  MIN_DAY_SECONDS,
  MIN_DAYS,
  MIN_INSTRUCTION,
  MIN_INSTRUCTIONS,
  MIN_LEAD,
  MIN_RATE,
  MIN_REPORT,
  PAGE,
  QUESTION_DONE,
  QUESTION_NOT_DONE,
  READING,
  REPORT_FEE,
  REPORT_GRACE,
  RETURN_LIST,
  UNCLEAR,
  ZERO_ADDRESS,
  addressText,
  canReport,
  instructionsOf,
  numberArg,
  pyStrip,
  started,
  textProblem,
  windowOf,
  type BookingStatus,
  type DayState,
  type StoredDay,
} from "./rules.ts";
import { reportChips } from "./suggestions.ts";

const GEN = ATTO;
export const MOCK_CONTRACT = "0x0000000000000000000000000000000000517e2a";

const inBrowser = typeof window !== "undefined";
const delay = (ms: number) => (inBrowser ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

// ---- the clock -----------------------------------------------------------------------------------

let clockOffset = 0;
/** The mock's message clock, in seconds: the browser's clock plus however far the visitor moved it on. */
export const mockNow = (): number => Math.floor(Date.now() / 1000) + clockOffset;
/** How far the clock has been moved on, in seconds: a stable snapshot for useSyncExternalStore. */
export const mockClockOffset = (): number => clockOffset;
/** Moves the mock clock on, so a day can be seen opening and its window closing. */
export function advanceClock(seconds: number): void {
  clockOffset += Math.max(0, Math.floor(seconds));
  notify();
}

// ---- who the visitor is acting as -----------------------------------------------------------------

export type Persona = { address: string; name: string; note: string };

export const VISITOR = "0x5e1a3c9b07d24f68a1e3c5b7d9f0a2c4e6b8d0f1";
export const MY_SITTER = "0x7a2c4e6f81b3d5a7c9e0f2a4b6d8c0e1f3a5b7c9";
export const DEMO_SITTER = "0xd3e5f7a9b1c2d4e6f8a0b2c4d6e8f0a1b3c5d7e9";
export const EARLIER_OWNER = "0xb4d6f8a0c2e4a6b8d0f2c4e6a8b0d2f4c6e8a0b2";
export const PASSER_BY = "0x91c3e5a7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9";

/** The accounts a visitor can act as in mock mode. The first is a newcomer with test GEN. */
export const PERSONAS: Persona[] = [
  { address: VISITOR, name: "You, an owner", note: "book the demo sitter and watch the diary fill" },
  { address: MY_SITTER, name: "You, a sitter", note: "B2 waits for you to accept; day 1 of B3 is open for your report" },
  { address: EARLIER_OWNER, name: "An earlier owner", note: "Biscuit's finished week, and the others" },
  { address: PASSER_BY, name: "A passer-by", note: "may read everything and close a day whose window ended (B4)" },
  { address: DEMO_SITTER, name: "The demo sitter", note: "sat Biscuit in B1; accepts and reports when its buttons are pressed" },
];

let persona = VISITOR;
/** The address the mock treats as the connected wallet. */
export const mockAddress = (): string => persona;
export function setMockPersona(address: string): void {
  if (PERSONAS.some((p) => p.address === address)) persona = address;
  notify();
}

// ---- balances -------------------------------------------------------------------------------------

const balances = new Map<string, bigint>([
  [VISITOR, 20n * GEN],
  [MY_SITTER, 6n * GEN],
  [DEMO_SITTER, 30n * GEN],
  [EARLIER_OWNER, 25n * GEN],
  [PASSER_BY, 3n * GEN],
]);
const balance = (a: string) => balances.get(a.toLowerCase()) ?? 0n;
const addTo = (a: string, v: bigint) => {
  balances.set(a.toLowerCase(), balance(a) + v);
  notify();
};
/** The balance as a decimal string: a stable snapshot for useSyncExternalStore. */
export const mockBalanceText = (address: string): string => balance(address).toString();
/** The contract's own balance: every escrow held for a booking offered or active, plus every credit. */
let contractBalance = 0n;
export const mockContractBalance = (): bigint => contractBalance;

// ---- the contract's state -----------------------------------------------------------------------

type BookingRec = {
  owner: string;
  sitter: string;
  n_instructions: number;
  day_rate: bigint;
  days: number;
  day_seconds: number;
  start_at: number;
  status: BookingStatus;
  booked_at: number;
  accepted_at: number;
  closed_at: number;
  ended_at: number;
  last_day: number;
  settled: number;
  held: bigint;
  to_sitter: bigint;
  to_owner: bigint;
  fees_to_owner: bigint;
  n_reports: number;
  n_unclear: number;
  n_done: number;
  n_judged: number;
};

type DayRec = {
  booking_id: string;
  n: number;
  status: StoredDay;
  tries: number;
  report_1: string;
  mask_1: string;
  at_1: number;
  report_2: string;
  mask_2: string;
  at_2: number;
  mask: string;
  done: number;
  to_sitter: bigint;
  to_owner: bigint;
  fees_to_owner: bigint;
  settled_at: number;
};

const bookingRows = new Map<string, BookingRec>();
const dayRows = new Map<string, DayRec>();
const instructionRows = new Map<string, string>();
const creditRows = new Map<string, bigint>();
const lists = new Map<string, string[]>();
const n = {
  booking_count: 0,
  held_total: 0n,
  taken_total: 0n,
  credit_total: 0n,
  deposited: 0n,
  credit_out: 0n,
  to_sitters: 0n,
  to_owners: 0n,
  fees_to_owners: 0n,
  returned: 0n,
  n_refused: 0,
  n_offered: 0,
  n_active: 0,
  n_finished: 0,
  n_declined: 0,
  n_withdrawn: 0,
  n_ended: 0,
  n_reports: 0,
  n_clear: 0,
  n_unclear: 0,
  n_rereports: 0,
  n_days_paid: 0,
  n_days_closed: 0,
};

/** A refusal that raises: nothing is stored, and the receipt carries the sentence. */
class Refused extends Error {}
const fail = (message: string): never => {
  throw new Refused("[EXPECTED] " + message);
};

type Ctx = { sender: string; value: bigint; now: number };
type Row = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";

const clock = (c: Ctx): number => {
  if (c.now < 0) fail("no readable clock on this transaction; no day can be placed");
  return c.now;
};

function idArg(raw: unknown): string {
  if (!isStr(raw)) fail("the booking id is a string");
  return pyStrip(raw as string);
}
function bookingOf(bid: string): BookingRec {
  const b = bookingRows.get(bid);
  if (!b) return fail("no booking " + bid.slice(0, ID_CHARS));
  return b;
}
function dayArg(b: BookingRec, bid: string, raw: unknown): number {
  const d = Number(numberArg(raw));
  if (d < 1 || d > b.days) fail("a day of " + bid + " is 1 to " + b.days);
  if (d > b.last_day) fail("day " + d + " of " + bid + " was ended early by the owner and refunded");
  return d;
}
const creditOf = (who: string): bigint => creditRows.get(who) ?? 0n;
const instructionsOfBooking = (bid: string, count: number): string[] => {
  const out: string[] = [];
  for (let k = 1; k <= Math.min(count, MAX_INSTRUCTIONS); k++) out.push(instructionRows.get(bid + ":" + k) ?? "");
  return out;
};
const push = (key: string, id: string) => lists.set(key, [...(lists.get(key) ?? []), id]);
const clocked = (b: BookingRec) => ({ startAt: b.start_at, daySeconds: b.day_seconds, days: b.days });

function send(to: string, value: bigint): void {
  if (value <= 0n) return;
  contractBalance -= value;
  addTo(to, value);
}

function refuse(sender: string, value: bigint, reason: string): Row {
  n.n_refused += 1;
  n.returned += value;
  send(sender, value);
  return { ok: false, reason, returned: value.toString() };
}

function finish(b: BookingRec, now: number): void {
  b.status = "finished";
  b.closed_at = now;
  n.n_active -= 1;
  n.n_finished += 1;
}

function closeOffer(b: BookingRec, status: BookingStatus, now: number): bigint {
  const held = b.held;
  b.held = 0n;
  b.to_owner += held;
  b.status = status;
  b.closed_at = now;
  n.held_total -= held;
  n.to_owners += held;
  n.n_offered -= 1;
  if (status === "declined") n.n_declined += 1;
  else n.n_withdrawn += 1;
  send(b.owner, held);
  return held;
}

function settleDay(b: BookingRec, row: DayRec, status: StoredDay, toSitterRaw: bigint, now: number): void {
  const rate = b.day_rate;
  const toSitter = toSitterRaw < 0n ? 0n : toSitterRaw > rate ? rate : toSitterRaw;
  const toOwner = rate - toSitter;
  row.status = status;
  row.to_sitter = toSitter;
  row.to_owner = toOwner;
  row.settled_at = now;
  b.held -= rate;
  b.to_sitter += toSitter;
  b.to_owner += toOwner;
  b.settled += 1;
  n.held_total -= rate;
  n.to_sitters += toSitter;
  n.to_owners += toOwner;
  if (status === "paid") n.n_days_paid += 1;
  else n.n_days_closed += 1;
  if (b.settled >= b.last_day) finish(b, now);
  send(b.sitter, toSitter);
  send(b.owner, toOwner);
}

const blankDay = (bid: string, d: number): DayRec => ({
  booking_id: bid, n: d, status: "unclear", tries: 0, report_1: "", mask_1: "", at_1: 0, report_2: "", mask_2: "", at_2: 0, mask: "", done: 0,
  to_sitter: 0n, to_owner: 0n, fees_to_owner: 0n, settled_at: 0,
});

/**
 * The mock's reading of a report: what the demo sitter's fixed reports and the sitting page's report
 * chips are written to be read as. Anything else is unclear here; on chain every validator reads it.
 */
export function mockReading(items: string[], text: string): string {
  const scripted = scriptedReading(items, text);
  if (scripted) return scripted;
  const chip = reportChips(items).find((c) => c.value === text);
  return chip ? chip.expect : UNCLEAR;
}

// ---- the writes -----------------------------------------------------------------------------------

function book(c: Ctx, args: unknown[]): Row {
  const [sitter, instructionsJson, dayRate, days, daySeconds, startAt] = args;
  const value = c.value;
  const sender = c.sender;
  const who = sender.toLowerCase();
  const mate = addressText(sitter);
  let { items, problem } = instructionsOf(instructionsJson);
  const rate = numberArg(dayRate);
  const nDays = numberArg(days);
  const seconds = numberArg(daySeconds);
  const start = numberArg(startAt);
  const now = BigInt(c.now);
  if (mate === "") problem = "the sitter is an address: 0x and 40 hex characters";
  else if (mate === ZERO_ADDRESS) problem = "the sitter is not the zero address";
  else if (mate === who) problem = "the owner may not book itself as the sitter";
  else if (problem) {
    /* the instructions' own reason */
  } else if (rate < MIN_RATE || rate > MAX_RATE) problem = "the day rate is a whole number of atto from " + MIN_RATE + " (0.05 GEN) to " + MAX_RATE + " (20 GEN)";
  else if (nDays < BigInt(MIN_DAYS) || nDays > BigInt(MAX_DAYS)) problem = "a booking is " + MIN_DAYS + " to " + MAX_DAYS + " days";
  else if (seconds < BigInt(MIN_DAY_SECONDS) || seconds > BigInt(MAX_DAY_SECONDS)) problem = "a day is " + MIN_DAY_SECONDS + " to " + MAX_DAY_SECONDS + " seconds";
  else if (now < 0n) problem = "no readable clock on this transaction; no day can be placed";
  else if (start < now + BigInt(MIN_LEAD) || start > now + BigInt(MAX_LEAD))
    problem = "the first day starts " + MIN_LEAD + " to " + MAX_LEAD + " seconds after the booking, so the sitter has time to accept; this one starts " + (start - now) + " seconds from now";
  else if (value !== rate * nDays) problem = "send exactly the day rate times the days, " + rate * nDays + " atto; this one sent " + value;
  if (problem) return refuse(sender, value, problem);
  items = items.slice(0, MAX_INSTRUCTIONS);
  n.booking_count += 1;
  const bid = "B" + n.booking_count;
  bookingRows.set(bid, {
    owner: who, sitter: mate, n_instructions: items.length, day_rate: rate, days: Number(nDays), day_seconds: Number(seconds), start_at: Number(start),
    status: "offered", booked_at: c.now, accepted_at: 0, closed_at: 0, ended_at: 0, last_day: Number(nDays), settled: 0, held: value, to_sitter: 0n,
    to_owner: 0n, fees_to_owner: 0n, n_reports: 0, n_unclear: 0, n_done: 0, n_judged: 0,
  });
  items.forEach((item, k) => instructionRows.set(bid + ":" + (k + 1), item));
  n.held_total += value;
  n.taken_total += value;
  n.n_offered += 1;
  push("party:" + who, bid);
  push("party:" + mate, bid);
  return {
    ok: true, booking: bid, owner: who, sitter: mate, instructions: items, day_rate: rate.toString(), days: Number(nDays), day_seconds: Number(seconds),
    start_at: Number(start), held: value.toString(), status: "offered", booked_at: c.now,
  };
}

function withdrawBooking(c: Ctx, raw: unknown): Row {
  const bid = idArg(raw);
  const b = bookingOf(bid);
  if (c.sender.toLowerCase() !== b.owner) fail("only the owner of " + bid + " may withdraw it");
  if (b.status !== "offered") fail(bid + " is " + b.status + "; only an offer the sitter has not accepted can be withdrawn");
  const now = clock(c);
  const refund = closeOffer(b, "withdrawn", now);
  return { ok: true, booking: bid, status: "withdrawn", to_owner: refund.toString() };
}

function decline(c: Ctx, raw: unknown): Row {
  const bid = idArg(raw);
  const b = bookingOf(bid);
  if (c.sender.toLowerCase() !== b.sitter) fail("only the sitter of " + bid + " may decline it");
  if (b.status !== "offered") fail(bid + " is " + b.status + "; only an offer not yet accepted can be declined");
  const now = clock(c);
  const refund = closeOffer(b, "declined", now);
  return { ok: true, booking: bid, status: "declined", to_owner: refund.toString() };
}

function accept(c: Ctx, raw: unknown): Row {
  const bid = idArg(raw);
  const b = bookingOf(bid);
  if (c.sender.toLowerCase() !== b.sitter) fail("only the sitter of " + bid + " may accept it");
  if (b.status !== "offered") fail(bid + " is " + b.status + "; only an offer can be accepted");
  const now = clock(c);
  if (now >= b.start_at)
    fail("the first day of " + bid + " started at " + b.start_at + "; an offer is accepted before its first day, and now only the owner can withdraw it or the sitter decline it");
  b.status = "active";
  b.accepted_at = now;
  n.n_offered -= 1;
  n.n_active += 1;
  return { ok: true, booking: bid, status: "active", start_at: b.start_at, accepted_at: now };
}

function deposit(c: Ctx): Row {
  const who = c.sender.toLowerCase();
  if (c.value <= 0n) return refuse(c.sender, c.value, "send the amount to deposit with the call; nothing was sent");
  const credit = creditOf(who) + c.value;
  creditRows.set(who, credit);
  n.credit_total += c.value;
  n.deposited += c.value;
  return { ok: true, address: who, deposited: c.value.toString(), credit: credit.toString() };
}

function withdraw(c: Ctx): Row {
  const who = c.sender.toLowerCase();
  const amount = creditOf(who);
  if (amount <= 0n) fail("there is no credit to withdraw for " + who);
  creditRows.set(who, 0n);
  n.credit_total -= amount;
  n.credit_out += amount;
  send(c.sender, amount);
  return { ok: true, address: who, withdrawn: amount.toString(), credit: "0" };
}

function report(c: Ctx, rawId: unknown, rawDay: unknown, rawText: unknown): Row {
  if (!isStr(rawId) || !isStr(rawText)) fail("the booking id and the report are strings");
  const bid = pyStrip(rawId as string);
  const text = pyStrip(rawText as string);
  const b = bookingOf(bid);
  const who = c.sender.toLowerCase();
  if (who !== b.sitter) fail("only the sitter of " + bid + " may report on it");
  if (b.status !== "active") fail(bid + " is " + b.status + "; reports are taken while it is active");
  const d = dayArg(b, bid, rawDay);
  const now = clock(c);
  const [opens, closes] = windowOf(clocked(b), d);
  if (now < opens) fail("day " + d + " of " + bid + " opens for its report at " + opens + ", in " + (opens - now) + " seconds");
  if (now >= closes) fail("the report window for day " + d + " of " + bid + " closed at " + closes + "; anyone may close the day now, and its rate goes back to the owner");
  const key = bid + "#" + d;
  let tries = 0;
  const existing = dayRows.get(key);
  if (existing) {
    if (existing.status !== "unclear") fail("day " + d + " of " + bid + " is already " + existing.status);
    tries = existing.tries;
  }
  if (tries >= MAX_REPORTS) fail("day " + d + " of " + bid + " has had its report and its one re-report; it is closed once its window ends at " + closes);
  const problem = textProblem(text, MIN_REPORT, MAX_REPORT, "a report");
  if (problem) fail(problem);
  let credit = creditOf(who);
  if (credit < REPORT_FEE) fail("a report takes a fee of " + REPORT_FEE + " atto from the sitter's credit, and the credit is " + credit + "; deposit first");
  const count = b.n_instructions;
  const mask = mockReading(instructionsOfBooking(bid, count), text);
  if (!dayRows.has(key)) dayRows.set(key, blankDay(bid, d));
  const row = dayRows.get(key)!;
  tries += 1;
  if (tries === 1) {
    row.report_1 = text;
    row.mask_1 = mask;
    row.at_1 = now;
  } else {
    row.report_2 = text;
    row.mask_2 = mask;
    row.at_2 = now;
    n.n_rereports += 1;
  }
  row.tries = tries;
  b.n_reports += 1;
  n.n_reports += 1;
  let fee = "kept";
  if (mask === UNCLEAR) {
    fee = "to_owner";
    credit -= REPORT_FEE;
    creditRows.set(who, credit);
    n.credit_total -= REPORT_FEE;
    n.fees_to_owners += REPORT_FEE;
    b.fees_to_owner += REPORT_FEE;
    row.fees_to_owner += REPORT_FEE;
    b.n_unclear += 1;
    n.n_unclear += 1;
    send(b.owner, REPORT_FEE);
  } else {
    const done = [...mask].filter((ch) => ch === "1").length;
    row.mask = mask;
    row.done = done;
    b.n_done += done;
    b.n_judged += count;
    n.n_clear += 1;
    settleDay(b, row, "paid", (b.day_rate * BigInt(done)) / BigInt(count), now);
  }
  return {
    ok: true, booking: bid, day: d, try: tries, mask, done: row.done, of: count, status: row.status, to_sitter: row.to_sitter.toString(),
    to_owner: row.to_owner.toString(), fee, credit: credit.toString(), booking_status: b.status, at: now,
  };
}

function closeDay(c: Ctx, rawId: unknown, rawDay: unknown): Row {
  const bid = idArg(rawId);
  const b = bookingOf(bid);
  if (b.status !== "active") fail(bid + " is " + b.status + "; days are closed while it is active");
  const d = dayArg(b, bid, rawDay);
  const now = clock(c);
  const [, closes] = windowOf(clocked(b), d);
  if (now < closes) fail("the report window for day " + d + " of " + bid + " closes at " + closes + ", in " + (closes - now) + " seconds; the day can be closed after that");
  const key = bid + "#" + d;
  const existing = dayRows.get(key);
  if (existing) {
    if (existing.status !== "unclear") fail("day " + d + " of " + bid + " is already " + existing.status);
  } else dayRows.set(key, blankDay(bid, d));
  const row = dayRows.get(key)!;
  settleDay(b, row, "closed", 0n, now);
  return { ok: true, booking: bid, day: d, status: "closed", to_owner: row.to_owner.toString(), booking_status: b.status, at: now };
}

function end(c: Ctx, raw: unknown): Row {
  const bid = idArg(raw);
  const b = bookingOf(bid);
  if (c.sender.toLowerCase() !== b.owner) fail("only the owner of " + bid + " may end it");
  if (b.status !== "active") fail(bid + " is " + b.status + "; only an active booking can be ended");
  const now = clock(c);
  const begun = started(clocked(b), now);
  const last = b.last_day;
  if (begun >= last) fail("every remaining day of " + bid + " has begun; nothing is left to end, and those days are reported or closed as usual");
  const refund = BigInt(last - begun) * b.day_rate;
  b.last_day = begun;
  b.ended_at = now;
  b.held -= refund;
  b.to_owner += refund;
  n.held_total -= refund;
  n.to_owners += refund;
  n.n_ended += 1;
  if (b.settled >= begun) finish(b, now);
  send(b.owner, refund);
  return { ok: true, booking: bid, last_day: begun, refunded: refund.toString(), status: b.status, at: now };
}

function run(fn: WriteFn, args: unknown[], c: Ctx): Row {
  switch (fn) {
    case "book":
      return book(c, args);
    case "withdraw_booking":
      return withdrawBooking(c, args[0]);
    case "decline":
      return decline(c, args[0]);
    case "accept":
      return accept(c, args[0]);
    case "deposit":
      return deposit(c);
    case "withdraw":
      return withdraw(c);
    case "report":
      return report(c, args[0], args[1], args[2]);
    case "close_day":
      return closeDay(c, args[0], args[1]);
    case "end":
      return end(c, args[0]);
  }
}

// ---- the views ------------------------------------------------------------------------------------

function bookingRow(bid: string): Row {
  const b = bookingRows.get(bid)!;
  return {
    booking: bid, owner: b.owner, sitter: b.sitter, instructions: instructionsOfBooking(bid, b.n_instructions), day_rate: b.day_rate.toString(), days: b.days,
    day_seconds: b.day_seconds, start_at: b.start_at, status: b.status, booked_at: b.booked_at, accepted_at: b.accepted_at, closed_at: b.closed_at,
    ended_at: b.ended_at, last_day: b.last_day, settled: b.settled, held: b.held.toString(), to_sitter: b.to_sitter.toString(), to_owner: b.to_owner.toString(),
    fees_to_owner: b.fees_to_owner.toString(), reports: b.n_reports, unclear: b.n_unclear, done: b.n_done, judged: b.n_judged, report_fee: REPORT_FEE.toString(),
    report_grace: REPORT_GRACE,
  };
}

function dayRow(bid: string, d: number, now: number): Row {
  const b = bookingRows.get(bid)!;
  const [opens, closes] = windowOf(clocked(b), d);
  const out: Row = {
    booking: bid, day: d, opens, closes, tries: 0, reports: [], mask: "", done: 0, of: b.n_instructions, to_sitter: "0", to_owner: "0", fees_to_owner: "0",
    settled_at: 0,
  };
  let stored = "";
  const row = dayRows.get(bid + "#" + d);
  if (row) {
    stored = row.status;
    const reports: Row[] = [];
    if (row.tries >= 1) reports.push({ text: row.report_1, mask: row.mask_1, at: row.at_1 });
    if (row.tries >= 2) reports.push({ text: row.report_2, mask: row.mask_2, at: row.at_2 });
    Object.assign(out, {
      tries: row.tries, reports, mask: row.mask, done: row.done, to_sitter: row.to_sitter.toString(), to_owner: row.to_owner.toString(),
      fees_to_owner: row.fees_to_owner.toString(), settled_at: row.settled_at,
    });
  }
  let state: DayState;
  if (stored === "paid" || stored === "closed") state = stored;
  else if (b.status === "declined" || b.status === "withdrawn") state = "void";
  else if (b.status === "offered") state = "offered";
  else if (d > b.last_day) state = "ended";
  else if (now < 0) state = "unknown";
  else if (now < opens) state = "upcoming";
  else if (now < closes) state = stored === "unclear" ? "unclear" : "open";
  else state = "closable";
  out.state = state;
  out.can_report = canReport(state, Number(out.tries));
  return out;
}

function pageOf(key: string, offset: unknown, limit: unknown): { total: number; start: number; size: number; ids: string[] } {
  const all = lists.get(key) ?? [];
  const off = numberArg(offset);
  const start = Number(off < 0n ? 0n : off);
  let size = Number(numberArg(limit));
  size = size < 1 || size > PAGE ? PAGE : size;
  return { total: all.length, start, size, ids: all.slice(start, Math.min(all.length, start + size)) };
}

/** rules(), as the contract publishes it. */
const RULES = {
  report: {
    value: '{"mask": "<one character per instruction, 1 shown done, 0 not>"} or {"mask": "unclear"}',
    askings: [
      "1, instructions as listed: " + QUESTION_DONE,
      "2, instructions reversed and renumbered: " + QUESTION_DONE,
      "3, instructions as listed: " + QUESTION_NOT_DONE,
      "4, instructions reversed and renumbered: " + QUESTION_NOT_DONE,
    ],
    rules: READING,
    answer: RETURN_LIST,
    numbering:
      "the instructions are numbered 1 to n by the contract; reversed, the line numbered k holds the instruction listed at n + 1 - k, and the answer is mapped back in code",
    reading_an_answer:
      "asked in JSON mode; the whole reply must be an object whose only key is answer, or a bare JSON list, at most " +
      MAX_ANSWER +
      " characters with at most one surrounding ``` fence removed; nothing is searched for inside prose; the list holds distinct whole numbers from 1 to n; anything else is unreadable",
    combine: {
      mask: "both DONE answers agree, both NOT_DONE answers agree, every instruction is in exactly one of the two lists, and at least one instruction is done",
      unclear: "anything else, an unreadable answer included",
    },
    outcome: {
      mask: "the day is paid: the sitter gets day_rate * done // instructions, the owner the rest",
      unclear: "nothing moves from the escrow; the report fee goes to the owner; the sitter may report once more inside the window",
    },
  },
  compared: "the whole value, by exact equality; every validator asks the four askings itself inside one consensus block, and never agrees with a leader that raised",
  window:
    "day d is reported from start_at + (d - 1) * day_seconds until start_at + d * day_seconds + " + REPORT_GRACE + " seconds; time comes from the transaction's own datetime",
  money: {
    book: "the owner pays exactly day_rate * days; it is held here",
    withdraw_booking: "before acceptance, the owner: everything back to the owner",
    decline: "before acceptance, the sitter: everything back to the owner",
    report_mask: "the sitter gets day_rate * done // instructions, rounded down; the owner gets the rest of that day's rate; the report fee stays in the sitter's credit",
    report_unclear: "nothing moves from the escrow; " + REPORT_FEE + " atto moves from the sitter's credit to the owner",
    close_day: "the day's rate back to the owner",
    end: "day_rate * (days not yet begun) back to the owner",
    deposit: "the value sent joins the sender's own credit",
    withdraw: "the sender's whole credit back to the sender",
    refusal: "a refused payable call returns everything sent, in the same transaction",
    balance: "the contract holds exactly the escrow of offered and active bookings plus every credit",
  },
  who: {
    book: "anyone; the sender is the owner; the sitter is another address",
    withdraw_booking: "the owner, while the offer is not accepted",
    decline: "the sitter, while the offer is not accepted",
    accept: "the sitter, before the first day starts",
    deposit: "anyone, into its own credit",
    withdraw: "anyone, its own credit",
    report: "the sitter, inside the day's window, once, and once more only after an unclear reading",
    close_day: "anyone, once the day's window has ended without a clear reading",
    end: "the owner, while some day has not begun",
  },
  limits: {
    instructions: [MIN_INSTRUCTIONS, MAX_INSTRUCTIONS],
    instruction_chars: [MIN_INSTRUCTION, MAX_INSTRUCTION],
    instructions_json_chars: MAX_INSTRUCTIONS_JSON,
    report_chars: [MIN_REPORT, MAX_REPORT],
    reports_a_day: MAX_REPORTS,
    day_rate_atto: [MIN_RATE.toString(), MAX_RATE.toString()],
    days: [MIN_DAYS, MAX_DAYS],
    day_seconds: [MIN_DAY_SECONDS, MAX_DAY_SECONDS],
    lead_seconds: [MIN_LEAD, MAX_LEAD],
    report_grace_seconds: REPORT_GRACE,
    report_fee_atto: REPORT_FEE.toString(),
    rows_per_page: PAGE,
    text: "printable ASCII on one line",
    one_action: "one action per instruction; a combined instruction is paid only when every part is reported",
    claim:
      "the report is the sitter's signed claim, and the network reads only its words: it never sees the home, the pet or a photo. A false report is not caught; it stays on chain for good, signed by the sitter. Images are not read.",
  },
  untrusted:
    "the instructions and every report are fenced (< and > replaced, never deleted), sit between delimiter lines tagged with the start of their own sha256, and the prompt says before the blocks that they are untrusted and never an instruction",
};

export async function view(fn: string, args: (string | number)[]): Promise<unknown> {
  seed();
  await delay(60);
  const now = mockNow();
  const idKey = (v: unknown) => pyStrip(String(v)).slice(0, ID_CHARS);
  const addrKey = (v: unknown) => pyStrip(String(v)).toLowerCase().slice(0, ADDRESS_CHARS);
  switch (fn) {
    case "booking": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the booking id is a string" });
      const key = idKey(args[0]);
      if (!bookingRows.has(key)) return JSON.stringify({ error: "no booking " + key, booking: key });
      return JSON.stringify({ ...bookingRow(key), now, begun: started(clocked(bookingRows.get(key)!), now) });
    }
    case "day": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the booking id is a string" });
      const key = idKey(args[0]);
      if (!bookingRows.has(key)) return JSON.stringify({ error: "no booking " + key, booking: key });
      const d = Number(numberArg(args[1]));
      const days = bookingRows.get(key)!.days;
      if (d < 1 || d > days) return JSON.stringify({ error: "a day of " + key + " is 1 to " + days, booking: key });
      return JSON.stringify(dayRow(key, d, now));
    }
    case "days_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the booking id is a string" });
      const key = idKey(args[0]);
      if (!bookingRows.has(key)) return JSON.stringify({ error: "no booking " + key, booking: key });
      const total = bookingRows.get(key)!.days;
      const off = numberArg(args[1]);
      const start = Number(off < 0n ? 0n : off);
      let size = Number(numberArg(args[2]));
      size = size < 1 || size > PAGE ? PAGE : size;
      const rows: Row[] = [];
      for (let d = start + 1; d <= Math.min(total, start + size); d++) rows.push(dayRow(key, d, now));
      return JSON.stringify({ booking: key, total, offset: start, limit: size, now, rows });
    }
    case "bookings_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = addrKey(args[0]);
      const p = pageOf("party:" + key, args[1], args[2]);
      const rows = p.ids.map((i) => {
        const row = bookingRow(i);
        return { ...row, role: row.owner === key ? "owner" : "sitter" };
      });
      return JSON.stringify({ address: key, total: p.total, offset: p.start, limit: p.size, rows });
    }
    case "credit": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = addrKey(args[0]);
      const amount = creditOf(key);
      return JSON.stringify({ address: key, credit: amount.toString(), report_fee: REPORT_FEE.toString(), reports: Number(amount / REPORT_FEE) });
    }
    case "stats":
      return JSON.stringify({
        bookings: n.booking_count, offered: n.n_offered, active: n.n_active, finished: n.n_finished, declined: n.n_declined, withdrawn: n.n_withdrawn,
        ended_early: n.n_ended, reports: n.n_reports, clear: n.n_clear, unclear: n.n_unclear, rereports: n.n_rereports, days_paid: n.n_days_paid,
        days_closed: n.n_days_closed, held: n.held_total.toString(), taken: n.taken_total.toString(), to_sitters: n.to_sitters.toString(),
        to_owners: n.to_owners.toString(), fees_to_owners: n.fees_to_owners.toString(), credit: n.credit_total.toString(), deposited: n.deposited.toString(),
        credit_withdrawn: n.credit_out.toString(), refused_payments: n.n_refused, returned: n.returned.toString(),
      });
    case "rules":
      return JSON.stringify(RULES);
    default:
      throw new Error("the mock has no view " + fn);
  }
}

// ---- transactions ---------------------------------------------------------------------------------

type Pending = { fn: string; polls: number; result: Row; error: string; judged: boolean };
const pending = new Map<string, Pending>();
let txCount = 0;
const fakeHash = () => "0x" + (++txCount).toString(16).padStart(8, "0") + "517e2a5c".repeat(7);

/** Runs one call as `sender` and records it as a transaction; the hash comes back at once. */
function sendTx(sender: string, fn: WriteFn, args: unknown[], value: bigint): string {
  if (value > balance(sender)) throw new Error("insufficient funds for this demo account");
  if (value > 0n) {
    addTo(sender, -value);
    contractBalance += value;
  }
  let result: Row = {};
  let error = "";
  try {
    result = run(fn, args, { sender: sender.toLowerCase(), value, now: mockNow() });
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    // A raised refusal changes nothing; no write that takes value raises, but the value goes back regardless.
    if (value > 0n) {
      contractBalance -= value;
      addTo(sender, value);
    }
    error = e.message;
  }
  const hash = fakeHash();
  pending.set(hash, { fn, polls: 0, result, error, judged: fn === "report" && !error });
  notify();
  return hash;
}

export async function write(call: Call): Promise<string> {
  seed();
  await delay(250);
  return sendTx(persona.toLowerCase(), call.fn, call.args, call.value ?? 0n);
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const NO_VOTES = { agree: 0, disagree: 0, idle: 0 };

export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(60);
  const p = pending.get(hash);
  if (!p) return { status: "UNKNOWN", votes: NO_VOTES, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  // A report asks every validator four questions, so it moves slower.
  const stages = p.judged ? Math.max(1, Math.floor(p.polls / 2)) : p.polls;
  const done = stages >= STAGES.length;
  // Studio assigns five validators and one is often idle in a round; the mock shows the same shape.
  const agree = done ? 4 : p.judged ? Math.min(Math.max(0, stages - 2), 4) : 0;
  return {
    status: STAGES[Math.min(stages - 1, STAGES.length - 1)],
    votes: { agree, disagree: 0, idle: done || agree ? 5 - agree : 0 },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? (p.error ? "ERROR" : "SUCCESS") : null,
    result: done && !p.error ? p.result : null,
    message: done ? p.error || JSON.stringify(p.result) : "",
  };
}

/** True once a transaction the mock knows has been polled to a final status (or it never existed). */
const isDone = (hash: string): boolean => {
  const p = pending.get(hash);
  if (!p) return true;
  return (p.judged ? Math.floor(p.polls / 2) : p.polls) >= STAGES.length;
};

export async function balanceOf(address: string): Promise<bigint> {
  await delay(40);
  return balance(address);
}

export async function faucet(address: string): Promise<bigint> {
  await delay(500);
  addTo(address, 10n * GEN);
  return balance(address);
}

// ---- the demo sitter -------------------------------------------------------------------------------

export function demoStatus(): DemoStatus {
  return { online: true, sitter: DEMO_SITTER, reason: "", reports: Number(creditOf(DEMO_SITTER) / REPORT_FEE) };
}

/** The demo sitter's last transaction per booking: it acts one call at a time. */
const lastDemoTx = new Map<string, string>();

function demoBooking(raw: string) {
  const id = pyStrip(String(raw ?? "")).slice(0, ID_CHARS);
  const b = bookingRows.get(id);
  return b ? { id, sitter: b.sitter, status: b.status, instructions: instructionsOfBooking(id, b.n_instructions), startAt: b.start_at, daySeconds: b.day_seconds, days: b.days } : null;
}

/** The in-memory twin of POST /api/demo/accept: the demo sitter accepts a booking made to it with a demo care plan. */
export async function demoAccept(raw: string): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const b = demoBooking(raw);
  const problem = demoAcceptProblem(b, DEMO_SITTER, mockNow());
  if (problem) return { ok: false, reason: problem };
  const last = lastDemoTx.get(b!.id);
  if (last && !isDone(last)) return { ok: false, reason: `the demo sitter is still waiting for its last call on ${b!.id} to be final; try again once it is` };
  const hash = sendTx(DEMO_SITTER, "accept", [b!.id], 0n);
  lastDemoTx.set(b!.id, hash);
  return { ok: true, hash };
}

/** The in-memory twin of POST /api/demo/report: the demo sitter files one of its plan's fixed reports on the current day. */
export async function demoReport(raw: string, script: string, asked = 0): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const b = demoBooking(raw);
  const now = mockNow();
  let day = 0;
  if (b) {
    const days: DemoDay[] = [];
    for (let d = 1; d <= b.days; d++) {
      const r = dayRow(b.id, d, now);
      days.push({ day: d, state: r.state as DayState, tries: Number(r.tries) });
    }
    day = demoDayFor(b, days, now, asked);
  }
  const problem = demoReportProblem(b, DEMO_SITTER, script, day, asked);
  if (problem) return { ok: false, reason: problem };
  const last = lastDemoTx.get(b!.id);
  if (last && !isDone(last)) return { ok: false, reason: `the demo sitter is still waiting for its last call on ${b!.id} to be final; try again once it is` };
  if (creditOf(DEMO_SITTER) < REPORT_FEE) sendTx(DEMO_SITTER, "deposit", [], GEN / 2n);
  const s = scriptFor(b!.instructions, script)!;
  const hash = sendTx(DEMO_SITTER, "report", [b!.id, day, s.text], 0n);
  lastDemoTx.set(b!.id, hash);
  return { ok: true, hash, day };
}

// ---- seeding ---------------------------------------------------------------------------------------

let seeded = false;

/** Runs a call at a given instant, outside the transaction log: the seeded past. */
function at(sender: string, now: number, fn: WriteFn, args: unknown[], value = 0n): Row {
  if (value > 0n) {
    addTo(sender, -value);
    contractBalance += value;
  }
  return run(fn, args, { sender, value, now });
}

/** A list of one's own, no demo plan's: the sitting page's report chips are what the mock reads on it. */
export const OWN_LIST = ["Feed the goldfish a pinch of flakes", "Water the tomato plants in the greenhouse", "Bring in the post from the mat"];

function seed(): void {
  if (seeded) return;
  seeded = true;
  const now = mockNow();
  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86400;
  const E = EARLIER_OWNER;
  const D = DEMO_SITTER;
  const biscuit = planOf("biscuit");
  const json = (items: string[]) => JSON.stringify(items);
  // B1: Biscuit's three short days with the demo sitter, the contract's own demonstration: everything
  // done, the pill forgotten, a vague note and its one re-report. Finished.
  let t = now - 3 * DAY;
  const rate1 = GEN / 2n;
  at(E, t, "book", [D, json(biscuit.instructions), rate1.toString(), 3, 600, t + 10 * MIN], rate1 * 3n);
  at(D, t + 2 * MIN, "accept", ["B1"]);
  at(D, t + 3 * MIN, "deposit", [], GEN / 2n);
  const s = (k: string) => biscuit.scripts.find((x) => x.key === k)!.text;
  at(D, t + 18 * MIN, "report", ["B1", 1, s("all")]);
  at(D, t + 28 * MIN, "report", ["B1", 2, s("one")]);
  at(D, t + 37 * MIN, "report", ["B1", 3, s("vague")]);
  at(D, t + 39 * MIN, "report", ["B1", 3, s("all")]);
  // B2: Pepper's two days offered to the "You, a sitter" persona, waiting for an answer.
  const pepper = planOf("pepper");
  at(E, now - 20 * MIN, "book", [MY_SITTER, json(pepper.instructions), (GEN / 4n).toString(), 2, HOUR, now + 2 * HOUR], GEN / 2n);
  // B3: a list of the owner's own, accepted by the "You, a sitter" persona; day 1 is running now.
  t = now - 2000;
  at(E, t, "book", [MY_SITTER, json(OWN_LIST), ((GEN * 3n) / 10n).toString(), 3, 1200, now - 700], (GEN * 9n) / 10n);
  at(MY_SITTER, t + MIN, "accept", ["B3"]);
  at(MY_SITTER, t + 2 * MIN, "deposit", [], GEN / 20n);
  // B4: Pepper's one short day with the demo sitter, never reported; its window has ended, so anyone may close it.
  t = now - 4000;
  at(E, t, "book", [D, json(pepper.instructions), (GEN / 10n).toString(), 1, 600, t + 7 * MIN], GEN / 10n);
  at(D, t + MIN, "accept", ["B4"]);
}

/** Test hook: the contract's held escrow plus every credit, and its own balance, which must be equal. */
export function mockHeld(): { held: bigint; credit: bigint; balance: bigint } {
  seed();
  return { held: n.held_total, credit: n.credit_total, balance: contractBalance };
}

/** Every account the mock knows, for the tests' conservation checks. */
export const ACCOUNTS = [VISITOR, MY_SITTER, DEMO_SITTER, EARLIER_OWNER, PASSER_BY];
