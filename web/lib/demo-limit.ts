// The demo sitter's rate limit: one attempt per booking every twenty seconds, at most twelve
// attempts a minute in all, and a hold on a booking while the demo sitter's last call on it is
// still going through. Pure, so node runs it in tests/unit; the server keeps one limiter for as long
// as its process lives.

export type LimitAnswer = { ok: true } | { ok: false; retryAfter: number };

export type Limiter = {
  /** may `key` try now? Counts the attempt when it may. */
  attempt: (key: string, nowMs: number) => LimitAnswer;
  /** no attempt for `key` until `ms` from now (after a move was sent) */
  hold: (key: string, ms: number, nowMs: number) => void;
};

export function createLimiter(opts: { perKeyMs: number; globalMax: number; globalWindowMs: number }): Limiter {
  const nextFor = new Map<string, number>();
  let recent: number[] = [];
  return {
    attempt(key, nowMs) {
      const until = nextFor.get(key) ?? 0;
      if (until > nowMs) return { ok: false, retryAfter: Math.ceil((until - nowMs) / 1000) };
      recent = recent.filter((t) => nowMs - t < opts.globalWindowMs);
      if (recent.length >= opts.globalMax) return { ok: false, retryAfter: Math.ceil((opts.globalWindowMs - (nowMs - recent[0])) / 1000) };
      recent.push(nowMs);
      nextFor.set(key, nowMs + opts.perKeyMs);
      if (nextFor.size > 5000) {
        for (const [k, t] of nextFor) if (t <= nowMs) nextFor.delete(k);
      }
      return { ok: true };
    },
    hold(key, ms, nowMs) {
      nextFor.set(key, Math.max(nextFor.get(key) ?? 0, nowMs + ms));
    },
  };
}

/** sentHoldMs: how long a sent call holds its booking when its finality cannot be read. */
export const DEMO_LIMITS = { perKeyMs: 20_000, globalMax: 12, globalWindowMs: 60_000, sentHoldMs: 600_000 };
