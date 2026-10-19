"use client";

// The sitter's report on one day: written in the sitter's own words, one line of printable text, with
// suggestions built from the booking's instructions. The validators read it against every instruction
// in the same transaction, and the day settles on the mask they agree.

import * as React from "react";

import { Sticker } from "@/components/button";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, readCredit, reportOutcome } from "@/lib/chain";
import { gen } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { MAX_REPORT, MIN_REPORT, REPORT_FEE, plain, pyStrip, reportProblem } from "@/lib/rules";
import { reportChips } from "@/lib/suggestions";
import { rememberTx } from "@/lib/tx-memory";
import type { Booking, TxStatus } from "@/lib/types";

export function ReportForm({
  open = true,
  booking,
  day,
  again,
  sitter,
  onStart,
  onDone,
}: {
  /** false once the day can no longer be reported: only a transaction still on screen is shown */
  open?: boolean;
  booking: Booking;
  day: number;
  again?: boolean;
  sitter: string;
  onStart?: () => void;
  onDone?: (s: TxStatus) => void;
}) {
  const [text, setText] = React.useState("");
  const credit = useRead(() => readCredit(sitter), [sitter, booking.id, day], { enabled: !!sitter });
  const tx = useTx((s, hash) => {
    const r = reportOutcome(s);
    rememberTx(booking.id, hash, r ? `Day ${day} report: ${r.mask}` : `Day ${day} report`);
    if (r) setText("");
    onDone?.(s);
  });
  const sent = pyStrip(plain(text));
  const problem = sent ? reportProblem(sent) : "";
  const lowCredit = credit.data ? BigInt(credit.data.creditAtto) < REPORT_FEE : false;
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const label = `Reporting on day ${day} of ${booking.id}`;
  const chips = reportChips(booking.instructions);
  const stage = (
    <TxStage
      tx={tx}
      judged
      sign={signGuide({ fn: "report", label, mock: isMock })}
      sending={sendingGuide({ fn: "report", label, id: booking.id, day, amountAtto: booking.dayRateAtto, role: "sitter", mock: isMock })}
      label={label}
    />
  );
  if (!open) return tx.hash ? stage : null;
  return (
    <div className="flex flex-col gap-2">
      <label className="label" htmlFor={`report-${booking.id}-${day}`}>
        {again ? `Your one re-report on day ${day}` : `Your report on day ${day}`}
      </label>
      <textarea
        id={`report-${booking.id}-${day}`}
        rows={4}
        className="field-box"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Fed Biscuit her morning meal and her evening meal…"
      />
      <p className="flex flex-wrap justify-between gap-2 text-[0.78rem] text-ink-3">
        <span>Name each instruction you did, in plain words. One line, plain ASCII letters.</span>
        <span className="mono">
          {[...sent].length}/{MAX_REPORT} (at least {MIN_REPORT})
        </span>
      </p>
      <Suggest label="Report suggestions" chips={chips.map((c) => ({ label: c.label, value: c.value, tag: c.tag }))} onPick={setText} isOn={(v) => v === sent} />
      {problem && <p className="text-[0.82rem] text-brick-ink">{problem.charAt(0).toUpperCase() + problem.slice(1)}.</p>}
      {lowCredit && <p className="text-[0.82rem] text-amber-ink">Your credit holds less than {gen(REPORT_FEE)}: deposit some below before you report.</p>}
      <WalletGate what="to report">
        <Sticker disabled={busy || !sent || !!problem || lowCredit} onClick={() => {
            onStart?.();
            void tx.start(calls.report(booking.id, day, sent));
          }}
        >
          {busy ? "Being read…" : again ? `Send the re-report on day ${day}` : `Send the report on day ${day}`}
        </Sticker>
      </WalletGate>
      {stage}
    </div>
  );
}
