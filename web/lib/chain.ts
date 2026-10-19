// Chain access for Sitter: the ONE file that knows the contract's interface.
//
// Every method name, argument order, view shape and outcome word of contracts/sitter.py that the site
// depends on is written here and nowhere else. Pages import typed reads, typed call builders and mapped
// outcomes from this module; when the contract's interface changes, this is the file to edit, with
// lib/chain-mock.ts, which stands in for the contract in mock mode and answers in the contract's own
// JSON so the mappers below run in both modes.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: eight tries over about
// forty seconds, because Studio answers "Contract not found" for a healthy contract for about a minute
// after a deploy. A failed read is never "no data" and never proof that a write failed. Studio allows 30
// gen_call a minute from one browser (the faucet shares them), so every view answer is cached for 30 s,
// two components asking for the same view share one request, and invalidateReads() drops the cache
// once a transaction is final. Every view here takes a short id, two small numbers or one address.

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { notify } from "./browser-store";
import { contractAddress } from "./config";
import { RATE_LIMITED, createReadCache, decodeTx, isMissingMethodError, noteFailure, rpc, sleep, waitForCooldown, withRetry, type RawTx } from "./rpc";
import { DAY_STATES, MAX_DAYS, PAGE, STATUSES, UNCLEAR, idNumber, sentence, type BookingStatus, type DayState } from "./rules";
import type { Arg, Booking, Call, Credit, Day, DayReport, DemoAnswer, DemoStatus, Paged, ReadResult, Rules, Stats, TxStatus, WriteFn } from "./types";
import { chainName, getChainId, getSigner } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs } from "./rpc";
export { contractAddress };

export const CHAIN_ID = 61999;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads while the site has no contract address. */
export const NO_CONTRACT = "the contract is not deployed yet";
/** What the faucet says when Studio refused sim_fundAccount three times. */
export const FAUCET_REFUSED = "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

/** True when this site has a contract to read: always in mock mode. */
export const hasContract = (): boolean => isMock || !!contractAddress();

/** The contract the explorer links point at. */
export const contractInUse = (): string => (isMock ? mock.MOCK_CONTRACT : contractAddress());

// ---- low-level view access ------------------------------------------------------------------------

// The SDK's studionet object carries another explorer URL; the RPC and explorer hosts are set here.
export const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

type Row = Record<string, unknown>;

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? BigInt(Math.trunc(v)).toString() : "0";
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s : "0";
};
const addr = (v: unknown): string => str(v).toLowerCase();
/** Seconds; the contract writes -1 or 0 when a call had no readable clock. */
const secs = (v: unknown): number => Math.max(0, num(v));
const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r)) : []);

/** A view returns a JSON string; parse it. Some decoders already hand back the object. */
function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** How long a view answer is reused. */
export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
const views = createReadCache<unknown>(onServer ? 0 : READ_TTL_MS);

let moved = 0;
/** How many times the chain has moved under this page (a final transaction, a faucet payment): a stable snapshot. */
export const chainVersion = (): number => moved;

/** Forget every cached view answer, and tell the lists on screen to read again. Called once a transaction is final or the faucet paid. */
export const invalidateReads = () => {
  views.clear();
  moved++;
  notify();
};

/**
 * One view call through the cache. Throws RATE_LIMITED when Studio is rate-limiting this browser,
 * NO_CONTRACT when no contract is set, and the plain network error when Studio never answered.
 */
async function view(fn: string, args: Arg[] = [], opts: { fresh?: boolean } = {}): Promise<unknown> {
  if (isMock) return parseView(await mock.view(fn, args));
  const address = contractAddress();
  if (!address) throw new Error(NO_CONTRACT);
  const key = `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;
  if (opts.fresh) views.forget(key);
  try {
    const raw = await views.get(key, () =>
      withRetry(() => reader().readContract({ address: address as Address, functionName: fn, args }), {
        bucket: "gen",
        giveUp: isMissingMethodError,
      }),
    );
    return parseView(raw);
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

/** The clock a page ticks with when a row is read: the mock's in mock mode, else the browser's. */
const browserNow = (): number => (isMock ? mock.mockNow() : Math.floor(Date.now() / 1000));

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });

// ---- row mappers (every missing field gets a default) -----------------------------------------------

const status = (v: unknown): BookingStatus => (STATUSES.includes(str(v) as BookingStatus) ? (str(v) as BookingStatus) : "offered");
const dayState = (v: unknown): DayState => (DAY_STATES.includes(str(v) as DayState) ? (str(v) as DayState) : "unknown");
const mask = (v: unknown): string => (/^[01]{1,6}$/.test(str(v)) || str(v) === UNCLEAR ? str(v) : "");

export function mapBooking(r: Row, id = ""): Booking {
  const role = str(r.role);
  return {
    id: str(r.booking ?? id),
    owner: addr(r.owner),
    sitter: addr(r.sitter),
    instructions: Array.isArray(r.instructions) ? r.instructions.map((x) => str(x)) : [],
    dayRateAtto: atto(r.day_rate),
    days: num(r.days),
    daySeconds: num(r.day_seconds, 600),
    startAt: secs(r.start_at),
    status: status(r.status),
    bookedAt: secs(r.booked_at),
    acceptedAt: secs(r.accepted_at),
    closedAt: secs(r.closed_at),
    endedAt: secs(r.ended_at),
    lastDay: num(r.last_day),
    settled: num(r.settled),
    heldAtto: atto(r.held),
    toSitterAtto: atto(r.to_sitter),
    toOwnerAtto: atto(r.to_owner),
    feesToOwnerAtto: atto(r.fees_to_owner),
    reports: num(r.reports),
    unclear: num(r.unclear),
    done: num(r.done),
    judged: num(r.judged),
    now: secs(r.now),
    readAt: 0,
    role: role === "owner" || role === "sitter" ? role : undefined,
  };
}

export function mapDay(r: Row): Day {
  const reports: DayReport[] = rowsOf(r.reports).map((x) => ({ text: str(x.text), mask: mask(x.mask), at: secs(x.at) }));
  return {
    booking: str(r.booking),
    day: num(r.day),
    opens: secs(r.opens),
    closes: secs(r.closes),
    tries: num(r.tries),
    reports,
    mask: mask(r.mask),
    done: num(r.done),
    of: num(r.of),
    toSitterAtto: atto(r.to_sitter),
    toOwnerAtto: atto(r.to_owner),
    feesToOwnerAtto: atto(r.fees_to_owner),
    settledAt: secs(r.settled_at),
    state: dayState(r.state),
    canReport: r.can_report === true,
  };
}

export function mapStats(r: Row): Stats {
  return {
    bookings: num(r.bookings),
    offered: num(r.offered),
    active: num(r.active),
    finished: num(r.finished),
    declined: num(r.declined),
    withdrawn: num(r.withdrawn),
    endedEarly: num(r.ended_early),
    reports: num(r.reports),
    clear: num(r.clear),
    unclear: num(r.unclear),
    rereports: num(r.rereports),
    daysPaid: num(r.days_paid),
    daysClosed: num(r.days_closed),
    heldAtto: atto(r.held),
    takenAtto: atto(r.taken),
    toSittersAtto: atto(r.to_sitters),
    toOwnersAtto: atto(r.to_owners),
    feesToOwnersAtto: atto(r.fees_to_owners),
    creditAtto: atto(r.credit),
    depositedAtto: atto(r.deposited),
    creditWithdrawnAtto: atto(r.credit_withdrawn),
    refusedPayments: num(r.refused_payments),
    returnedAtto: atto(r.returned),
  };
}

const paged = <T>(value: Row, map: (r: Row) => T): Paged<T> => {
  if (!Array.isArray(value.rows)) throw new Error(NETWORK_ERROR);
  return { total: num(value.total), offset: num(value.offset), limit: num(value.limit, PAGE), rows: rowsOf(value.rows).map(map) };
};

// ---- reads: one function per view ---------------------------------------------------------------------

type Fresh = { fresh?: boolean };
const pageArgs = (offset: number, limit: number): [number, number] => [Math.max(0, Math.trunc(offset)), Math.max(1, Math.min(PAGE, Math.trunc(limit)))];

/** booking(id): null when the contract holds no such booking. Its row carries the view's own clock. */
export async function readBooking(id: string, opts: Fresh = {}): Promise<ReadResult<Booking | null>> {
  const value = asRow(await view("booking", [id], opts));
  if ("error" in value || !value.owner) return result(null);
  return result({ ...mapBooking(value, id), readAt: browserNow() });
}

/** day(booking, n): one day, or null when the booking or the day does not exist. */
export async function readDay(id: string, n: number, opts: Fresh = {}): Promise<ReadResult<Day | null>> {
  const value = asRow(await view("day", [id, Math.max(0, Math.trunc(n))], opts));
  if ("error" in value) return result(null);
  return result(mapDay(value));
}

/** days_of(booking, 0, MAX_DAYS): every day of a booking in one read (a booking has at most 14 days, a page 20). */
export async function readDays(id: string, opts: Fresh = {}): Promise<ReadResult<Paged<Day>>> {
  const value = asRow(await view("days_of", [id, ...pageArgs(0, MAX_DAYS)], opts));
  if ("error" in value) return result({ total: 0, offset: 0, limit: PAGE, rows: [] });
  return result(paged(value, mapDay));
}

/** bookings_of(address, offset, limit): one page of the bookings an address is a party to, oldest first. */
export async function readBookingsOf(address: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Booking>>> {
  return result(paged(asRow(await view("bookings_of", [address.toLowerCase(), ...pageArgs(offset, limit)], opts)), (r) => mapBooking(r)));
}

/** The newest bookings of an address first: the first page says how many there are, then the newest pages down to `maxPages`. */
export async function readBookingsOfWindow(address: string, maxPages = 3, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: Booking[]; partial: boolean }>> {
  const first = (await readBookingsOf(address, 0, PAGE, opts)).data;
  const pages = Math.ceil(first.total / PAGE);
  const rows = [...first.rows];
  for (let p = pages - 1, k = 1; p >= 1 && k < maxPages; p--, k++) rows.push(...(await readBookingsOf(address, p * PAGE, PAGE, opts)).data.rows);
  const unique = new Map(rows.map((r) => [r.id, r]));
  return result({ total: first.total, rows: [...unique.values()].sort((a, b) => idNumber(b.id) - idNumber(a.id)), partial: pages > maxPages });
}

/** credit(address): the credit for report fees. */
export async function readCredit(address: string, opts: Fresh = {}): Promise<ReadResult<Credit>> {
  const r = asRow(await view("credit", [address.toLowerCase()], opts));
  return result({ address: addr(r.address), creditAtto: atto(r.credit), reportFeeAtto: atto(r.report_fee), reports: num(r.reports) });
}

/** stats(): the contract's totals. */
export async function readStats(opts: Fresh = {}): Promise<ReadResult<Stats>> {
  return result(mapStats(asRow(await view("stats", [], opts))));
}

/** rules(): the contract's own words for its askings, its windows, who may do what and where the money goes. */
export async function readRules(): Promise<ReadResult<Rules>> {
  return result(asRow(await view("rules", [])));
}

// ---- writes: one builder per method (lib/calls.ts) ------------------------------------------------------

export { calls } from "./calls";

/** True for the calls the validators judge with their models: the rail then shows their votes. */
export const isJudged = (fn: WriteFn) => fn === "report";

const WRONG_CHAIN = (chainId: number | null) => `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

/** Sends a call through the connected EIP-1193 provider. Resolves to the transaction hash. */
export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call);
  const address = contractAddress();
  if (!address) throw new Error("The contract is not deployed yet, so there is nothing to sign.");
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and the SDK skips its own chain check for it, so the refusal to sign on
  // another chain lives here, and it says which chain the wallet is on.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- outcomes: what a finished call's JSON return means ---------------------------------------------

/**
 * True when the leader's return is what the chain stored. A round with no majority, a cancelled tx or
 * one the validators did not accept still carries the leader's JSON, but nothing of it was kept.
 */
export const stored = (s: TxStatus | null): s is TxStatus => !!s && !s.undetermined && s.applied !== false && s.status !== "CANCELED";

/** The tag of a raised error: a rule ([EXPECTED]) or a model failure ([LLM_ERROR]). */
export function errorTag(s: TxStatus | null): "EXPECTED" | "LLM_ERROR" | "" {
  const m = /\[(EXPECTED|LLM_ERROR)\]/.exec(s?.message || "");
  return m ? (m[1] as "EXPECTED" | "LLM_ERROR") : "";
}

/** The sentence after a raised error's tag, as a sentence; "" when there is none. */
function raisedSentence(s: TxStatus): string {
  const m = /\[(?:EXPECTED|LLM_ERROR)\]\s*([^"}\n]+)/.exec(s.message || "");
  return m ? sentence(m[1]) : "";
}

/** The contract's reason for refusing a call, as a sentence; "" when the call was not refused. */
export function refusalReason(s: TxStatus | null): string {
  if (!s) return "";
  const r = s.result;
  if (r && r.ok === false) return sentence(str(r.reason));
  if (s.exec === "ERROR" && !s.undetermined) return raisedSentence(s) || sentence(s.message || "");
  return "";
}

/** True when the transaction finished and the contract did what was asked. */
export function succeeded(s: TxStatus | null): boolean {
  return !!s && s.status === "FINALIZED" && stored(s) && s.exec !== "ERROR" && s.result?.ok !== false;
}

/** A plain sentence for a tx that finished without doing what was asked; "" when it did. */
export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) {
    const why = errorTag(s) ? raisedSentence(s) : "";
    return why
      ? `${why} The validators did not agree on a reading, so nothing was stored and no fee was taken.`
      : "The validators did not reach a majority, so nothing was stored and no fee was taken. Sending the same report again is safe.";
  }
  if (s.status === "CANCELED") return "The network cancelled the transaction. Nothing was stored.";
  const reason = refusalReason(s);
  if (reason) return reason;
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}

const ok = (s: TxStatus | null): s is TxStatus & { result: Row } => stored(s) && s.result?.ok === true;

export type Paid = { kind: "done"; result: Row } | { kind: "refused"; reason: string; returnedAtto: string } | { kind: "unknown" };

/** book()'s or deposit()'s return: taken, or refused with what came back in the same transaction. */
export function paidOutcome(s: TxStatus | null): Paid {
  if (!stored(s) || !s.result) return { kind: "unknown" };
  if (s.result.ok === true) return { kind: "done", result: s.result };
  if (s.result.ok === false) return { kind: "refused", reason: sentence(str(s.result.reason)), returnedAtto: atto(s.result.returned) };
  return { kind: "unknown" };
}

/** book()'s return: the new booking's id, or "". */
export const bookedId = (s: TxStatus | null): string => {
  const p = paidOutcome(s);
  return p.kind === "done" && /^B\d+$/.test(str(p.result.booking)) ? str(p.result.booking) : "";
};

export type ReportResult = { day: number; tryN: number; mask: string; done: number; of: number; toSitterAtto: string; toOwnerAtto: string; feeToOwner: boolean; creditAtto: string; bookingStatus: BookingStatus };

/** report()'s return: the agreed mask (or unclear) and what moved. */
export function reportOutcome(s: TxStatus | null): ReportResult | null {
  if (!ok(s) || mask(s.result.mask) === "") return null;
  const r = s.result;
  return {
    day: num(r.day),
    tryN: num(r.try),
    mask: mask(r.mask),
    done: num(r.done),
    of: num(r.of),
    toSitterAtto: atto(r.to_sitter),
    toOwnerAtto: atto(r.to_owner),
    feeToOwner: str(r.fee) === "to_owner",
    creditAtto: atto(r.credit),
    bookingStatus: status(r.booking_status),
  };
}

/** True when GEN moves to or from somebody because of this call, so balances are watched afterwards. */
export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if (r.ok === false) return atto(r.returned) !== "0";
  if (r.ok !== true) return false;
  return ["to_sitter", "to_owner", "refunded", "withdrawn"].some((k) => atto(r[k]) !== "0") || str(r.fee) === "to_owner";
}

// ---- the demo sitter ------------------------------------------------------------------------------

let demoCache: { at: number; value: DemoStatus } | null = null;

/** Whether the demo sitter can act now, its address and why not. Asked of the site's own server; cached a minute. */
export async function readDemoStatus(): Promise<DemoStatus> {
  if (isMock) return mock.demoStatus();
  if (demoCache && Date.now() - demoCache.at < 60_000) return demoCache.value;
  try {
    const res = await fetch("/api/demo/status", { cache: "no-store" });
    const body = (await res.json()) as Partial<DemoStatus>;
    const value: DemoStatus = { online: body.online === true, sitter: /^0x[0-9a-f]{40}$/.test(addr(body.sitter)) ? addr(body.sitter) : "", reason: str(body.reason), reports: num(body.reports) };
    demoCache = { at: Date.now(), value };
    return value;
  } catch {
    return { online: false, sitter: "", reason: "the site's server did not answer", reports: 0 };
  }
}

async function askDemo(path: string, body: Record<string, string | number>): Promise<DemoAnswer> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const answer = (await res.json()) as Record<string, unknown>;
    if (answer.ok === true && typeof answer.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(answer.hash)) return { ok: true, hash: answer.hash, day: num(answer.day) || undefined };
    return { ok: false, reason: sentence(str(answer.reason, "the demo sitter did not answer")), retryAfter: num(answer.retryAfter) || undefined };
  } catch {
    return { ok: false, reason: "The site's server did not answer. Try again in a minute." };
  }
}

/** Asks the demo sitter to accept a booking made to it with a demo care plan. */
export async function requestDemoAccept(booking: string): Promise<DemoAnswer> {
  if (isMock) return mock.demoAccept(booking);
  return askDemo("/api/demo/accept", { booking });
}

/** Asks the demo sitter to file one of its plan's fixed reports, on `day` or the day open now. Nothing the visitor types goes with it. */
export async function requestDemoReport(booking: string, script: string, day = 0): Promise<DemoAnswer> {
  if (isMock) return mock.demoReport(booking, script, day);
  return askDemo("/api/demo/report", day ? { booking, script, day } : { booking, script });
}

// ---- transactions, balances, the faucet -------------------------------------------------------------

/** One poll of a transaction. Pages call this every 3 s until it is final. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway. eth_* has its own bucket and its own retry budget,
  // so neither a gen_call cooldown nor the gen_call retry loops ever stall the rail.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth", ownBudget: true });
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth", ownBudget: true });
  return BigInt(hex || "0x0");
}

const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
const FAUCET_WAIT_MS = 60_000;

/**
 * Faucet: sim_fundAccount with 10 GEN, up to three tries ten seconds apart, each after the gen_call
 * cooldown. Resolves when the balance moved. `stillWanted` is asked between balance polls: once it
 * says no (the wallet switched accounts) the wait ends with an error nobody shows.
 */
export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  // Studio credits only a checksummed address: the lowercase spelling is accepted and never paid.
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const bookingPath = (id: string) => `/booking/${id}`;
