"use client";

// The demo sitter's buttons in the diary of a booking made to it with a demo care plan: ask it to accept,
// and ask it to file one of the plan's four FIXED reports on a day. The button sends only the booking,
// the report's key and the day; the words signed are the plan's own.

import * as React from "react";

import { Sticker } from "@/components/button";
import { TxRail } from "@/components/tx-rail";
import { useTx } from "@/components/use-tx";
import { WaitNote, waitOf } from "@/components/wait-note";
import { calls, isMock, requestDemoAccept, requestDemoReport } from "@/lib/chain";
import { cx } from "@/lib/cx";
import type { DemoPlan, ScriptKey } from "@/lib/demo-sitter";
import { demoGuide } from "@/lib/guide";
import { rememberTx } from "@/lib/tx-memory";
import type { Booking, TxStatus } from "@/lib/types";

/** Asks the demo sitter to accept; `auto` asks once by itself as soon as it can. */
export function DemoAccept({ booking, auto, onDone }: { booking: Booking; auto?: boolean; onDone?: (s: TxStatus) => void }) {
  const tx = useTx((s, hash) => {
    rememberTx(booking.id, hash, "The demo sitter accepted");
    onDone?.(s);
  });
  const [asking, setAsking] = React.useState(false);
  const [why, setWhy] = React.useState("");
  const asked = React.useRef(false);
  const { track } = tx;
  const ask = React.useCallback(async () => {
    setAsking(true);
    setWhy("");
    const a = await requestDemoAccept(booking.id);
    setAsking(false);
    if (a.ok) track(a.hash, calls.accept(booking.id));
    else setWhy(a.reason);
  }, [booking.id, track]);
  React.useEffect(() => {
    if (!auto || asked.current) return;
    // Marked as asked only when the ask really starts: a development double mount clears the first timer.
    const t = setTimeout(() => {
      if (asked.current) return;
      asked.current = true;
      void ask();
    }, 0);
    return () => clearTimeout(t);
  }, [auto, ask]);
  const busy = asking || (!!tx.hash && !tx.final);
  return (
    <div className="flex flex-col gap-2">
      <Sticker variant="sage" disabled={busy} onClick={() => void ask()}>
        {busy ? "The demo sitter is accepting…" : "Ask the demo sitter to accept"}
      </Sticker>
      {why && <p className="text-[0.85rem] text-brick-ink">{why}</p>}
      {tx.hash && !tx.final && <WaitNote wait={waitOf(demoGuide("accept", { id: booking.id, mock: isMock }), { since: tx.at })} />}
      {tx.hash && <TxRail hash={tx.hash} label={`The demo sitter accepts ${booking.id}`} onDone={tx.onDone} />}
    </div>
  );
}

const TAG_TONE: Record<string, string> = {
  done: "bg-sage-wash text-sage-ink",
  part: "bg-amber-wash text-amber-ink",
  unclear: "bg-grey-wash text-grey-ink",
};

/** The four fixed reports of the demo plan, as buttons for one day. */
export function DemoReports({
  open = true,
  booking,
  plan,
  day,
  again,
  onStart,
  onDone,
}: {
  /** false once the day can no longer be reported: only a report still on screen is shown */
  open?: boolean;
  booking: Booking;
  plan: DemoPlan;
  day: number;
  again?: boolean;
  onStart?: () => void;
  onDone?: (s: TxStatus) => void;
}) {
  const tx = useTx((s, hash) => {
    rememberTx(booking.id, hash, `The demo sitter's day ${day} report`);
    onDone?.(s);
  });
  const [asking, setAsking] = React.useState<ScriptKey | "">("");
  const [why, setWhy] = React.useState("");
  const busy = !!asking || (!!tx.hash && !tx.final);
  const ask = async (key: ScriptKey) => {
    onStart?.();
    setAsking(key);
    setWhy("");
    const a = await requestDemoReport(booking.id, key, day);
    setAsking("");
    const text = plan.scripts.find((s) => s.key === key)!.text;
    if (a.ok) tx.track(a.hash, calls.report(booking.id, a.day ?? day, text));
    else setWhy(a.reason);
  };
  const rail = (
    <>
      {tx.hash && !tx.final && <WaitNote wait={waitOf(demoGuide("report", { id: booking.id, day, mock: isMock, amountAtto: booking.dayRateAtto }), { since: tx.at })} />}
      {tx.hash && <TxRail hash={tx.hash} label={`The demo sitter's report on day ${day}`} judged onDone={tx.onDone} />}
    </>
  );
  if (!open) return tx.hash ? <div className="flex flex-col gap-2.5">{rail}</div> : null;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[0.9rem] text-ink-2">
        {again ? "One re-report is left on this day. " : ""}Press one and the demo sitter files that report, word for word, on day {day}; the validators read it against your {plan.instructions.length}{" "}
        instructions.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {plan.scripts.map((s) => {
          const kind = s.expect === "unclear" ? "unclear" : /^1+$/.test(s.expect) ? "done" : "part";
          return (
            <li key={s.key} className="flex min-w-0 flex-col gap-1.5 rounded-[12px] border-2 border-dashed border-line-strong bg-card p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Sticker size="sm" variant={kind === "done" ? "plum" : "sage"} disabled={busy} onClick={() => void ask(s.key)} aria-pressed={asking === s.key}>
                  {s.label}
                </Sticker>
                <span className={cx("mono rounded-full px-2 py-0.5 text-[0.72rem]", TAG_TONE[kind])}>expect {s.expect}</span>
              </div>
              <p className="hand text-[1.1rem] leading-snug text-ink">&ldquo;{s.text}&rdquo;</p>
              <p className="text-[0.75rem] text-ink-3">{s.why}</p>
            </li>
          );
        })}
      </ul>
      {why && <p className="text-[0.85rem] text-brick-ink">{why}</p>}
      {rail}
    </div>
  );
}
