"use client";

// One transaction while it goes through: the explorer link from the first second, the stages (sent,
// propose, commit, reveal, accept, final) as a row of dots in a habit tracker that fill in one by one,
// and, for a report, the validators' votes. FINALIZED does not mean the state changed: a round whose
// validators split finalizes too, with nothing stored. The rail reads the tally, not only the status,
// and says so.

import * as React from "react";

import { IconExternal } from "@/components/icons";
import { useWallet } from "@/components/wallet";
import { failureOf, invalidateReads, isMock, movesMoney, txStatus, txUrl } from "@/lib/chain";
import { cx } from "@/lib/cx";
import { STAGES } from "@/lib/rpc";
import type { TxStatus, Votes } from "@/lib/types";

/** The in-memory contract of mock mode answers at once, so its rail moves faster. */
const POLL_MS = isMock ? 700 : 3000;

export const isFinal = (s: TxStatus) => s.undetermined || s.status === "FINALIZED" || s.status === "CANCELED" || s.status === "UNDETERMINED";

/** Polls txStatus(hash) until it is final. The status is kept with its hash, so a new hash never shows an old result. */
export function useTxStatus(hash: string | null): TxStatus | null {
  const [latest, setLatest] = React.useState<{ hash: string; status: TxStatus } | null>(null);
  React.useEffect(() => {
    if (!hash) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = await txStatus(hash);
        if (stopped) return;
        setLatest({ hash, status: s });
        if (isFinal(s)) return;
      } catch {
        /* a dropped poll is not a failed transaction; the next one may answer */
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [hash]);
  return latest && latest.hash === hash ? latest.status : null;
}

const STAGE_WORD: Record<string, string> = {
  PENDING: "Sent",
  PROPOSING: "Propose",
  COMMITTING: "Commit",
  REVEALING: "Reveal",
  ACCEPTED: "Accept",
  FINALIZED: "Final",
};

/** Five (or more) validator marks: agree, disagree, idle, or still waiting. */
export function VoteMarks({ votes }: { votes: Votes }) {
  const total = votes.agree + votes.disagree + votes.idle;
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Validator votes">
        {Array.from({ length: Math.max(5, total) }, (_, i) => {
          const kind = i < votes.agree ? "agree" : i < votes.agree + votes.disagree ? "disagree" : total ? "idle" : "waiting";
          return (
            <li
              key={i}
              title={kind}
              className={cx(
                "flex h-8 min-w-[4.2rem] items-center justify-center rounded-full border-2 px-2 text-[0.7rem] font-extrabold tracking-wide uppercase",
                kind === "agree" && "border-sage-deep bg-sage-wash text-sage-ink",
                kind === "disagree" && "border-brick bg-brick-wash text-brick-ink",
                kind === "idle" && "border-grey bg-grey-wash text-grey-ink",
                kind === "waiting" && "border-dashed border-line-strong bg-card text-ink-3",
              )}
            >
              {kind === "waiting" ? "…" : kind}
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-ink-3">
        {total === 0 ? "Waiting for the validators' votes…" : `${votes.agree} agree · ${votes.disagree} disagree · ${votes.idle} idle (did not vote this round)`}
      </p>
    </div>
  );
}

export function TxRail({
  hash,
  label,
  judged,
  onDone,
  className,
}: {
  hash: string;
  /** what the tx does, e.g. "Booking the demo sitter" */
  label: string;
  /** true for a report: the validators ask their models and their votes are shown */
  judged?: boolean;
  /** called once when the tx is final, with its final status */
  onDone?: (status: TxStatus) => void;
  className?: string;
}) {
  const status = useTxStatus(hash);
  const wallet = useWallet();
  const doneFor = React.useRef<string | null>(null);
  const onDoneRef = React.useRef(onDone);
  const refreshRef = React.useRef(wallet.refreshBalance);
  const watchRef = React.useRef(wallet.watchBalance);
  React.useEffect(() => {
    onDoneRef.current = onDone;
    refreshRef.current = wallet.refreshBalance;
    watchRef.current = wallet.watchBalance;
  }, [onDone, wallet.refreshBalance, wallet.watchBalance]);

  React.useEffect(() => {
    if (!status || !isFinal(status) || doneFor.current === hash) return;
    doneFor.current = hash;
    // The cached views are stale the moment the chain moved: drop them before the page re-reads.
    invalidateReads();
    // A transfer lands a few seconds after FINALIZED: when this call moves GEN, the balance is
    // re-read until it changes.
    if (movesMoney(status)) watchRef.current();
    else void refreshRef.current();
    onDoneRef.current?.(status);
  }, [status, hash]);

  const stageIndex = status ? STAGES.indexOf(status.status) : -1;
  const final = status ? isFinal(status) : false;
  const canceled = status?.status === "CANCELED";
  const split = !!status?.undetermined;
  const failure = status && final ? failureOf(status) : "";
  const ok = final && !failure;

  return (
    <div className={cx("sheet px-3.5 py-3 text-sm", className)} data-tx={hash}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 font-extrabold">{label}</p>
        <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="mono link inline-flex items-center gap-1 text-xs break-all text-ink-2">
          {isMock ? "demo tx " : "explorer "}
          {hash.slice(0, 10)}…{hash.slice(-6)}
          <IconExternal size={12} />
        </a>
      </div>

      <ol className="relative mt-3 grid grid-cols-6 gap-1" aria-label="Consensus stages">
        <span aria-hidden="true" className="absolute top-[9px] right-[8%] left-[8%] border-t-2 border-dotted border-line-strong" />
        {STAGES.map((stage, i) => {
          const reached = split ? i < 4 : final && !canceled ? true : i <= stageIndex;
          const current = !final && i === stageIndex;
          return (
            <li key={stage} aria-current={current ? "step" : undefined} className="relative flex min-w-0 flex-col items-center">
              <span
                aria-hidden="true"
                className={cx(
                  "block size-[20px] rounded-full border-2",
                  reached ? (split || canceled ? "border-amber bg-amber" : "border-plum bg-plum") : current ? "dot-now border-plum bg-plum-wash" : "border-line-strong bg-card",
                )}
              />
              <span className={cx("mt-1 block max-w-full truncate text-[0.66rem] font-extrabold uppercase", reached ? "text-ink-2" : current ? "text-plum" : "text-ink-3")}>{STAGE_WORD[stage]}</span>
            </li>
          );
        })}
      </ol>

      {judged && (
        <div className="mt-3">
          <VoteMarks votes={status?.votes ?? { agree: 0, disagree: 0, idle: 0 }} />
        </div>
      )}

      <div className="mt-2" role="status" aria-live="polite">
        {!status && <p className="text-ink-2">Sent. Waiting for the network to list it…</p>}
        {status && !final && (
          <p className="text-ink-2">
            {status.status === "UNKNOWN"
              ? "The network has not listed this transaction yet. It usually appears within a few seconds."
              : judged
                ? "Every validator reads the report itself and asks its model four questions; the contract stores one value only if they agree on it exactly. The page moves on by itself."
                : "The validators are checking the call. This usually takes under a minute; the page moves on by itself."}
          </p>
        )}
        {split && !canceled && (
          <p className="text-amber-ink">
            <strong>Nothing was stored.</strong> {failure}
          </p>
        )}
        {canceled && <p className="text-brick-ink">The network cancelled this transaction. Nothing was stored.</p>}
        {final && !split && !canceled && failure && (
          <p className="text-brick-ink">
            <strong>Final, and refused:</strong> {failure}
            {status?.result && "returned" in status.result ? " What was sent came back in the same transaction." : ""}
          </p>
        )}
        {ok && !split && (
          <p className="text-sage-ink">
            <strong>Final.</strong> The validators agreed and the result is stored.
            {status && movesMoney(status) ? " Money moved by this call lands a few seconds after it is final." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
