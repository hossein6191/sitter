"use client";

// One write, from the wallet prompt to the final line, in one place: while the wallet asks, the sign
// note; while the transaction goes through, the page's own waiting note (lib/guide.ts) above the rail
// with its explorer link; once it is final, the rail's last line; and a wallet error in words a person
// can act on. Every page that sends anything renders its writes through this.

import { TxRail } from "@/components/tx-rail";
import type { TxRun } from "@/components/use-tx";
import { WaitNote, waitOf } from "@/components/wait-note";
import type { Guide } from "@/lib/guide";

export function TxStage({
  tx,
  sign,
  sending,
  label,
  judged,
  hideFinal,
  className,
}: {
  tx: TxRun;
  /** the wallet-prompt guide for this call */
  sign: Guide;
  /** the guide while it goes through */
  sending: Guide;
  /** what the rail calls it */
  label: string;
  judged?: boolean;
  /** the page shows the outcome itself: the rail's final line is not needed */
  hideFinal?: boolean;
  className?: string;
}) {
  if (tx.sending)
    return (
      <div className={className}>
        <WaitNote wait={waitOf(sign)} />
      </div>
    );
  if (tx.error)
    return (
      <p role="alert" className={`rounded-xl border-2 border-brick bg-brick-wash px-3 py-2 text-sm text-brick-ink ${className ?? ""}`}>
        {tx.error}
      </p>
    );
  if (!tx.hash) return null;
  if (tx.final && hideFinal) return null;
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {!tx.final && <WaitNote wait={waitOf(sending, { since: tx.at || undefined })} />}
      <TxRail hash={tx.hash} label={label} judged={judged} onDone={tx.onDone} />
    </div>
  );
}
