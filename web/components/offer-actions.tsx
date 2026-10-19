"use client";

// A sitter's answer to an offer, in a list: accept before day 1 starts, or decline, with the one write
// stage every page uses.

import * as React from "react";

import { Sticker } from "@/components/button";
import { TxStage } from "@/components/tx-stage";
import { useTx } from "@/components/use-tx";
import { calls, isMock } from "@/lib/chain";
import { gen } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { rememberTx } from "@/lib/tx-memory";
import type { Booking, Call } from "@/lib/types";

export function OfferActions({ b, now, onDone }: { b: Booking; now: number; onDone?: () => void }) {
  const [doing, setDoing] = React.useState<{ call: Call; label: string; amount: string } | null>(null);
  const tx = useTx((_s, hash) => {
    rememberTx(b.id, hash, doing?.label ?? "Answered");
    onDone?.();
  });
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const total = (BigInt(b.dayRateAtto) * BigInt(b.days)).toString();
  const go = (call: Call, label: string, amount: string) => {
    setDoing({ call, label, amount });
    void tx.start(call);
  };
  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex flex-wrap gap-2">
        {now < b.startAt && (
          <Sticker size="sm" disabled={busy} onClick={() => go(calls.accept(b.id), `Accepting ${b.id}`, "0")}>
            Accept {b.id}
          </Sticker>
        )}
        <Sticker size="sm" variant="paper" disabled={busy} onClick={() => go(calls.decline(b.id), `Declining ${b.id}`, total)}>
          Decline: {gen(total)} back to the owner
        </Sticker>
      </div>
      {doing && (
        <TxStage
          tx={tx}
          sign={signGuide({ fn: doing.call.fn, label: doing.label, amountAtto: doing.amount, role: "sitter", mock: isMock })}
          sending={sendingGuide({ fn: doing.call.fn, label: doing.label, id: b.id, amountAtto: doing.amount, role: "sitter", mock: isMock })}
          label={doing.label}
        />
      )}
    </div>
  );
}
