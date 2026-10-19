// JSON-RPC against GenLayer Studio, with the retry policy the network needs, plus the
// decoders every caller of eth_getTransactionByHash shares.
//
// Studio answers "Contract not found" / "execution failed" for a perfectly healthy contract
// for about a minute after a deploy or under load, and drops the odd request. A single
// attempt is a coin toss, four quick attempts fit inside the bad minute. Reads therefore
// retry eight times with a growing pause, about forty seconds in all, and only then fail.
// A failed read is never an answer: callers must say "could not reach the network", never
// "no data", and must never conclude a write failed from a read that failed.
//
// Studio also rate-limits, in two buckets per client: every gen_call (contract read) and
// sim_fundAccount share 30 requests a minute ("gen"), and eth_* reads have their own 300 a
// minute ("eth"). A 429 carries no Access-Control-Allow-Origin header, so in the browser it
// only surfaces as the CORS TypeError "Failed to fetch". Retrying that eight times is what
// empties the bucket for everyone else on the page, so a rate-limited request stops at once,
// starts its bucket's cooldown, and rejects with RATE_LIMITED; requests on that bucket that
// begin during the cooldown wait for it to end, then try. The other bucket keeps going: a
// gen_call 429 does not stop transaction polling or balance reads. The helpers here are pure:
// `npm run test:site` runs them from node, with no network and no browser
// (tests/unit/rpc.test.mjs).

export const RPC_URL = "https://studio.genlayer.com/api";

/** Pauses between the eight tries: 1+2+3+5+7+9+12 = 39 s in all. */
export const RETRY_SCHEDULE_MS = [1000, 2000, 3000, 5000, 7000, 9000, 12000];
export const RETRY_TRIES = RETRY_SCHEDULE_MS.length + 1;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RpcError extends Error {
  code: number | undefined;
  data: unknown;
  constructor(message: string, code?: number, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

// ---- rate limiting ----------------------------------------------------------

/** The error message a read rejects with while Studio is rate-limiting this browser. */
export const RATE_LIMITED = "studio is rate-limiting this browser";
/** Studio's JSON-RPC code for "Rate limit exceeded". */
export const RATE_LIMIT_CODE = -32029;
/** The gen_call cooldown when the answer did not say how long (a browser never sees the 429 itself). */
export const COOLDOWN_MS = 20_000;
/**
 * The eth_* cooldown when the answer did not say how long. That bucket is ten times larger,
 * so what trips it is nearly always one dropped request, and transaction polls must not stall.
 */
export const ETH_COOLDOWN_MS = 5_000;
/** Longest cooldown honoured from retry_after_seconds, so a bad header cannot park the site. */
const MAX_COOLDOWN_MS = 90_000;
/** How many reads may sit in their retry loop at once; the rest wait for a slot. */
export const MAX_RETRYING = 3;

/** Studio's two rate-limit buckets: gen_call + sim_fundAccount, and eth_*. */
export type Bucket = "gen" | "eth";
const DEFAULT_COOLDOWN_MS: Record<Bucket, number> = { gen: COOLDOWN_MS, eth: ETH_COOLDOWN_MS };

type Shape = { code?: unknown; message?: unknown; data?: unknown; details?: unknown; cause?: unknown; status?: unknown; name?: unknown };
const shape = (e: unknown): Shape | null => (e && typeof e === "object" ? (e as Shape) : null);

/** Walks an error and its `cause` chain (viem wraps the transport error) and yields each link. */
function* chain(e: unknown): Generator<Shape> {
  let cur = e;
  for (let depth = 0; depth < 6 && cur; depth++) {
    const s = shape(cur);
    if (!s) return;
    yield s;
    cur = s.cause;
  }
}

/** The browser's fetch TypeError: "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError…" (Firefox). */
const FETCH_FAILED = /failed to fetch|load failed|networkerror when attempting|network request failed/i;

/**
 * True when Studio (or the browser on its behalf) refused the request for rate limiting: a
 * JSON-RPC error -32029 / "Rate limit exceeded", an HTTP 429, or the CORS TypeError a 429
 * turns into in the browser.
 */
export function isRateLimitError(e: unknown): boolean {
  for (const s of chain(e)) {
    if (s.code === RATE_LIMIT_CODE || s.status === 429) return true;
    for (const text of [s.message, s.details]) {
      if (typeof text !== "string") continue;
      if (/rate limit/i.test(text) || /\b429\b/.test(text) || FETCH_FAILED.test(text)) return true;
    }
  }
  return typeof e === "string" && (FETCH_FAILED.test(e) || /rate limit/i.test(e));
}

/** `data.retry_after_seconds` (or `retry_after`) from a rate-limit error, in ms; null when unreadable. */
export function retryAfterMs(e: unknown): number | null {
  for (const s of chain(e)) {
    const d = shape(s.data);
    const raw = d ? (d as Record<string, unknown>).retry_after_seconds ?? (d as Record<string, unknown>).retry_after : undefined;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return Math.min(MAX_COOLDOWN_MS, Math.ceil(n * 1000));
  }
  return null;
}

/** The contract has no public method by that name: GenVM's runner refuses before running anything. */
const MISSING_METHOD = /call to private method|__handle_undefined_method__/i;

/**
 * True when a gen_call failed because the register has no such view (one deployed before the
 * view existed). That is an answer, not flakiness: retrying it only spends the 30/min bucket.
 * Studio puts the runner's traceback in the error's data.receipt.genvm_result.stderr.
 */
export function isMissingMethodError(e: unknown): boolean {
  for (const s of chain(e)) {
    for (const text of [s.message, s.details]) {
      if (typeof text === "string" && MISSING_METHOD.test(text)) return true;
    }
    const d = shape(s.data) as { receipt?: { genvm_result?: { stderr?: unknown } } } | null;
    const stderr = d?.receipt?.genvm_result?.stderr;
    if (typeof stderr === "string" && MISSING_METHOD.test(stderr)) return true;
  }
  return false;
}

const cooldownUntil: Record<Bucket, number> = { gen: 0, eth: 0 };
const cooldownWait: Record<Bucket, Promise<void> | null> = { gen: null, eth: null };

/** Milliseconds left on a bucket's cooldown (the gen_call one by default); 0 when none. */
export const cooldownRemainingMs = (now: number = Date.now(), bucket: Bucket = "gen"): number =>
  Math.max(0, cooldownUntil[bucket] - now);

/** Starts (or extends) a bucket's cooldown. Returns when it ends. */
export function startCooldown(ms?: number, now: number = Date.now(), bucket: Bucket = "gen"): number {
  const until = now + Math.max(0, ms ?? DEFAULT_COOLDOWN_MS[bucket]);
  if (until > cooldownUntil[bucket]) cooldownUntil[bucket] = until;
  return cooldownUntil[bucket];
}

/** Test hook: forget one bucket's cooldown, or both. */
export function clearCooldown(bucket?: Bucket): void {
  for (const b of bucket ? [bucket] : (["gen", "eth"] as const)) {
    cooldownUntil[b] = 0;
    cooldownWait[b] = null;
  }
}

/**
 * Resolves once the bucket's cooldown is over. Every waiter shares one timer; a cooldown
 * extended while they wait keeps them waiting (the timer re-arms) rather than releasing them early.
 */
export function waitForCooldown(bucket: Bucket = "gen"): Promise<void> {
  if (cooldownRemainingMs(Date.now(), bucket) === 0) return Promise.resolve();
  let wait = cooldownWait[bucket];
  if (!wait) {
    wait = (async () => {
      let left = cooldownRemainingMs(Date.now(), bucket);
      while (left > 0) {
        await sleep(left);
        left = cooldownRemainingMs(Date.now(), bucket);
      }
      cooldownWait[bucket] = null;
    })();
    cooldownWait[bucket] = wait;
  }
  return wait;
}

/**
 * Called with every failed request. A rate-limit failure starts that bucket's cooldown
 * (honouring a readable retry_after) and returns true; anything else returns false and
 * leaves it alone.
 */
export function noteFailure(e: unknown, now: number = Date.now(), bucket: Bucket = "gen"): boolean {
  if (!isRateLimitError(e)) return false;
  startCooldown(retryAfterMs(e) ?? DEFAULT_COOLDOWN_MS[bucket], now, bucket);
  return true;
}

// The retry fan-out cap: a page with twenty reads that all hit the flaky minute would
// otherwise run twenty retry loops side by side. Only MAX_RETRYING loops run at once.
let retrying = 0;
const retryQueue: Array<() => void> = [];
const acquireRetrySlot = (): Promise<void> => {
  if (retrying < MAX_RETRYING) {
    retrying++;
    return Promise.resolve();
  }
  return new Promise<void>((r) => retryQueue.push(r));
};
const releaseRetrySlot = () => {
  const next = retryQueue.shift();
  if (next) next();
  else retrying--;
};
/** Test hook: how many retry loops are running right now. */
export const retryingCount = () => retrying;

let nextId = 1;

/**
 * One JSON-RPC call. Throws RpcError on a JSON-RPC error (an HTTP 429 becomes the -32029
 * rate-limit error, with retry_after_seconds when the body or header carries it), Error on
 * transport failure.
 */
export async function rpc<T = unknown>(
  method: string,
  params: unknown = [],
  url: string = RPC_URL,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    cache: "no-store",
  });
  if (res.status === 429) throw await rateLimitErrorFrom(res);
  if (!res.ok) throw new Error(`rpc ${method}: HTTP ${res.status}`);
  const body = (await res.json()) as {
    result?: T;
    error?: { code?: number; message?: string; data?: unknown };
  };
  if (body.error) {
    throw new RpcError(
      body.error.message || `rpc ${method} failed`,
      body.error.code,
      body.error.data,
    );
  }
  return body.result as T;
}

/** The RpcError for a 429 answer: the JSON-RPC error in the body when there is one, else the Retry-After header. */
async function rateLimitErrorFrom(res: Response): Promise<RpcError> {
  let data: unknown;
  let message = "Rate limit exceeded";
  try {
    const body = (await res.json()) as { error?: { message?: string; data?: unknown } };
    if (body?.error) {
      message = body.error.message || message;
      data = body.error.data;
    }
  } catch {
    /* not JSON: the header is all there is */
  }
  const header = Number(res.headers.get("retry-after"));
  if (!retryAfterMs({ data }) && Number.isFinite(header) && header > 0) data = { retry_after_seconds: header };
  return new RpcError(message, RATE_LIMIT_CODE, data);
}

export type RetryOptions = {
  /** attempts in all; RETRY_TRIES (about 40 s) when left out */
  tries?: number;
  /** the rate-limit bucket the call spends: "gen" for gen_call and sim_fundAccount (the default), "eth" for eth_* */
  bucket?: Bucket;
  /** true: this call keeps its own retry budget and never queues for one of the MAX_RETRYING shared slots */
  ownBudget?: boolean;
  /** errors that are answers rather than flakiness (a view the register lacks): thrown at once */
  giveUp?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
};

/**
 * Runs `fn` up to `tries` times with the backoff schedule above. Every error is retried:
 * on Studio a read can fail for reasons that have nothing to do with the request.
 * Except rate limiting: that starts the bucket's cooldown and rejects at once with
 * RATE_LIMITED, and every attempt that begins during a cooldown first waits for it to end.
 * `opts` may be a plain number of tries (the older call shape).
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: number | RetryOptions = {},
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<T> {
  const o: RetryOptions = typeof opts === "number" ? { tries: opts, onRetry } : { onRetry, ...opts };
  const tries = Math.max(1, Math.trunc(o.tries ?? RETRY_TRIES) || 1);
  const bucket: Bucket = o.bucket ?? "gen";
  let last: unknown;
  let slot = false;
  try {
    for (let i = 0; i < tries; i++) {
      await waitForCooldown(bucket);
      try {
        return await fn(i);
      } catch (e) {
        if (noteFailure(e, Date.now(), bucket)) throw new Error(RATE_LIMITED);
        if (o.giveUp?.(e)) throw e;
        last = e;
        if (i === tries - 1) break;
        o.onRetry?.(i, e);
        if (!slot && !o.ownBudget) {
          await acquireRetrySlot();
          slot = true;
        }
        await sleep(RETRY_SCHEDULE_MS[Math.min(i, RETRY_SCHEDULE_MS.length - 1)]);
      }
    }
  } finally {
    if (slot) releaseRetrySlot();
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** JSON-RPC call with the retry policy (eth_* methods spend the "eth" bucket). */
export const rpcRetry = <T = unknown>(method: string, params: unknown = [], opts?: number | RetryOptions) => {
  const o: RetryOptions = typeof opts === "number" ? { tries: opts } : { ...opts };
  if (!o.bucket && method.startsWith("eth_")) o.bucket = "eth";
  return withRetry<T>(() => rpc<T>(method, params), o);
};

// ---- read cache --------------------------------------------------------------
// Two components asking for the same view share one request, and an answer is reused for
// `ttlMs`. Failures are never stored. lib/chain.ts keeps one of these for the views.

export type ReadCache<T> = {
  /** the cached or in-flight value for `key`, or a fresh call of `load` */
  get: (key: string, load: () => Promise<T>) => Promise<T>;
  /** forget everything stored (in-flight requests still complete and are then dropped) */
  clear: () => void;
  /**
   * forget one key: the next get() is a live request. A request for it already in flight
   * still answers its own callers but is not stored, since it may have left before the
   * chain moved.
   */
  forget: (key: string) => void;
  /** test hook: how many keys hold a value right now */
  size: () => number;
};

export function createReadCache<T>(ttlMs: number, now: () => number = Date.now): ReadCache<T> {
  const done = new Map<string, { value: T; at: number }>();
  const inflight = new Map<string, Promise<T>>();
  let generation = 0;
  return {
    get(key, load) {
      const hit = done.get(key);
      if (hit && ttlMs > 0 && now() - hit.at < ttlMs) return Promise.resolve(hit.value);
      if (hit) done.delete(key);
      const running = inflight.get(key);
      if (running) return running;
      const gen = generation;
      const p = load().then(
        (value) => {
          // Stored only while this request is still the one registered for the key: clear()
          // and forget() unregister it, so an answer that left before the chain moved is dropped.
          const current = inflight.get(key) === p;
          if (current) inflight.delete(key);
          if (current && gen === generation && ttlMs > 0) done.set(key, { value, at: now() });
          return value;
        },
        (e) => {
          if (inflight.get(key) === p) inflight.delete(key);
          throw e;
        },
      );
      inflight.set(key, p);
      return p;
    },
    clear() {
      generation++;
      done.clear();
      inflight.clear();
    },
    forget(key) {
      done.delete(key);
      inflight.delete(key);
    },
    size: () => done.size,
  };
}

// ---- decoding a transaction ----------------------------------------------

export type VoteTally = { agree: number; disagree: number; idle: number };

/** Decodes the base64 `leader_receipt.result` into text (browser and node). */
export function base64ToText(b64: string): string {
  if (!b64) return "";
  try {
    if (typeof atob === "function") {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** The contract's JSON return sits after a calldata prefix; take the first `{` onwards. */
export function jsonFromText(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const end = text.lastIndexOf("}");
  if (end < start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Non-printable bytes removed, so a decoded return can be shown as is. */
export const printable = (text: string) => text.replace(/[^\x20-\x7e\n]/g, " ").trim();

/** Tally of `consensus_data.votes` ({ address: "agree" | "disagree" | "idle" | ... }). */
export function tallyVotes(votes: unknown): VoteTally {
  const t: VoteTally = { agree: 0, disagree: 0, idle: 0 };
  if (!votes || typeof votes !== "object") return t;
  for (const v of Object.values(votes as Record<string, unknown>)) {
    const s = String(v).toLowerCase();
    if (s === "agree") t.agree++;
    else if (s === "disagree") t.disagree++;
    else t.idle++;
  }
  return t;
}

export const totalVotes = (t: VoteTally) => t.agree + t.disagree + t.idle;

/** A round applied its state only when a strict majority agreed. */
export const isApplied = (t: VoteTally) => t.agree * 2 > totalVotes(t);

/** Statuses after which nothing more happens to a transaction. */
export const FINAL_STATUSES = new Set(["FINALIZED", "CANCELED", "UNDETERMINED"]);

/** The stage names the rail shows, in order. */
export const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];

export type RawTx = {
  hash?: string;
  status?: string | number;
  consensus_data?: {
    votes?: Record<string, string>;
    leader_receipt?: LeaderReceipt | LeaderReceipt[];
  };
  consensus_history?: unknown;
  result?: unknown;
  [k: string]: unknown;
};

export type LeaderReceipt = {
  result?: string;
  execution_result?: string;
  [k: string]: unknown;
};

const STATUS_NAMES: Record<number, string> = {
  0: "PENDING",
  1: "CANCELED",
  2: "PROPOSING",
  3: "COMMITTING",
  4: "REVEALING",
  5: "ACCEPTED",
  6: "UNDETERMINED",
  7: "FINALIZED",
};

/** Studio returns the status by name; older nodes by number. Always a name. */
export function statusName(s: unknown): string {
  if (typeof s === "number") return STATUS_NAMES[s] ?? "UNKNOWN";
  if (typeof s === "string" && s) {
    const n = Number(s);
    if (!Number.isNaN(n) && /^\d+$/.test(s)) return STATUS_NAMES[n] ?? "UNKNOWN";
    return s.toUpperCase();
  }
  return "UNKNOWN";
}

export const leaderReceiptOf = (tx: RawTx): LeaderReceipt | null => {
  const lr = tx.consensus_data?.leader_receipt;
  if (!lr) return null;
  return Array.isArray(lr) ? (lr[0] ?? null) : lr;
};

/**
 * "Undetermined" = the transaction finished without a majority, so nothing was stored.
 * Seen either as the UNDETERMINED status, as a finished tx whose tally has no strict
 * majority, or as an "Undetermined" entry in consensus_history.
 */
export function isUndetermined(tx: RawTx, tally: VoteTally): boolean {
  const status = statusName(tx.status);
  if (status === "UNDETERMINED") return true;
  if (status === "FINALIZED" && totalVotes(tally) > 0 && !isApplied(tally)) return true;
  if (tx.consensus_history) {
    try {
      if (JSON.stringify(tx.consensus_history).includes("Undetermined")) return true;
    } catch {
      /* not serialisable: ignore */
    }
  }
  return false;
}

export type DecodedTx = {
  status: string;
  votes: VoteTally;
  applied: boolean | null;
  undetermined: boolean;
  exec: string | null;
  result: Record<string, unknown> | null;
  message: string;
};

/** Everything a page needs from one eth_getTransactionByHash answer. */
export function decodeTx(tx: RawTx | null | undefined): DecodedTx {
  if (!tx) {
    return {
      status: "UNKNOWN",
      votes: { agree: 0, disagree: 0, idle: 0 },
      applied: null,
      undetermined: false,
      exec: null,
      result: null,
      message: "",
    };
  }
  const status = statusName(tx.status);
  const votes = tallyVotes(tx.consensus_data?.votes);
  const receipt = leaderReceiptOf(tx);
  const text = receipt?.result ? base64ToText(receipt.result) : "";
  const result = jsonFromText(text);
  const exec = receipt?.execution_result ? String(receipt.execution_result).toUpperCase() : null;
  const undetermined = isUndetermined(tx, votes);
  const applied =
    status === "CANCELED" || undetermined
      ? false
      : totalVotes(votes) > 0
        ? isApplied(votes)
        : null;
  return {
    status,
    votes,
    applied,
    undetermined,
    exec,
    result,
    message: printable(text),
  };
}
