"use client";

// The three states every read shows: a still placeholder while it loads, the data, or "could not
// reach the network" with a retry. A failed read is never "no data". While Studio is rate-limiting
// this browser the page says so and retries by itself when the cooldown ends.

import * as React from "react";

import { IconRefresh } from "@/components/icons";
import { Sticker } from "@/components/button";
import { NETWORK_ERROR, NO_CONTRACT, RATE_LIMITED, cooldownRemainingMs, isMock } from "@/lib/chain";
import { cx } from "@/lib/cx";

/**
 * Runs `read` over `items` with at most `limit` in flight and returns every outcome in order. Studio
 * allows 30 reads a minute from one browser, so a page never sends one read per row in a burst.
 */
export async function readEach<T, R>(items: readonly T[], read: (item: T) => Promise<R>, limit = 2): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await read(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/** A still placeholder in the shape of what is coming: grey bars, no shimmer. */
export function Placeholder({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx("space-y-2.5", className)} aria-busy="true" aria-label="Reading from the chain">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3.5 rounded bg-paper-2" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
      <span className="sr-only">Reading from the chain…</span>
    </div>
  );
}

function useCooldownLeft(onDone: () => void): number {
  const [left, setLeft] = React.useState(() => Math.ceil(cooldownRemainingMs() / 1000));
  const doneRef = React.useRef(onDone);
  React.useEffect(() => {
    doneRef.current = onDone;
  });
  React.useEffect(() => {
    let fired = false;
    const timer = setInterval(() => {
      const ms = cooldownRemainingMs();
      setLeft(Math.ceil(ms / 1000));
      if (ms === 0 && !fired) {
        fired = true;
        clearInterval(timer);
        doneRef.current();
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);
  return left;
}

function RateLimited({ onRetry }: { onRetry: () => void }) {
  const left = useCooldownLeft(onRetry);
  return (
    <>
      <p className="font-semibold">Studio is rate-limiting this browser (30 reads a minute).</p>
      <p className="text-ink-2">This pane reads again by itself{left > 0 ? ` in ${left} s` : " in a moment"}. Nothing is wrong with the contract or your wallet.</p>
    </>
  );
}

/** What every page shows while the site has no contract address. */
export function NotDeployed({ className }: { className?: string }) {
  return (
    <div role="status" className={cx("rounded-xl border-2 border-dashed border-amber bg-amber-wash p-4 text-sm", className)}>
      <p className="font-semibold">The contract is not deployed yet.</p>
      <p className="mt-1 text-ink-2">
        This site has not been pointed at a deployed copy of Sitter, so there is nothing on chain to read. Everything else on the site works, and the demo build
        (NEXT_PUBLIC_MOCK=1) shows every page with an in-memory copy of the contract.
      </p>
    </div>
  );
}

export function ReadError({ detail, onRetry, className }: { detail?: string; onRetry: () => void; className?: string }) {
  if (detail === NO_CONTRACT && !isMock) return <NotDeployed className={className} />;
  return (
    <div role="alert" className={cx("sheet flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        {detail === RATE_LIMITED ? (
          <RateLimited onRetry={onRetry} />
        ) : (
          <>
            <p className="font-semibold">Could not reach the network.</p>
            <p className="text-ink-2">
              Studio did not answer after several tries. This says nothing about the booking or your money{detail && detail !== NETWORK_ERROR ? ` (${detail})` : ""}.
            </p>
          </>
        )}
      </div>
      <Sticker size="sm" icon={<IconRefresh size={15} />} onClick={onRetry} className="shrink-0">
        Read again
      </Sticker>
    </div>
  );
}
