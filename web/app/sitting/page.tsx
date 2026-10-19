"use client";

// For sitters: the credit that pays report fees, the offers waiting for an answer, and every day open for
// a report right now, with the report form and its suggestions under each.

import Link from "next/link";
import * as React from "react";

import { BookingRow } from "@/components/booking-row";
import { CreditCard } from "@/components/credit-card";
import { OfferActions } from "@/components/offer-actions";
import { Placeholder, ReadError, readEach } from "@/components/read-state";
import { ReportForm } from "@/components/report-form";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { WalletGate } from "@/components/wallet-gate";
import { bookingPath, failureOf, readBookingsOfWindow, readDays, reportOutcome } from "@/lib/chain";
import { liveDay } from "@/lib/days";
import { clockTime, gen } from "@/lib/format";
import { rowSummary } from "@/lib/guide";
import { REPORT_FEE } from "@/lib/rules";
import type { Booking, Day, TxStatus } from "@/lib/types";

/** The newest active bookings this page reads the days of: Studio allows 30 reads a minute. */
const MAX_ACTIVE = 5;

export default function SittingPage() {
  const me = useMe();
  const now = useNow();
  const list = useRead(() => readBookingsOfWindow(me.address), [me.address], { enabled: !!me.address });
  const sitting = (list.data?.rows ?? []).filter((b) => b.role === "sitter");
  const active = sitting.filter((b) => b.status === "active").slice(0, MAX_ACTIVE);
  const activeKey = active.map((b) => b.id).join(",");
  const days = useRead(
    async () => {
      const out = await readEach(active, async (b) => ({ b, days: (await readDays(b.id)).data.rows }));
      return { data: out.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])), source: "chain" as const };
    },
    [activeKey],
    { enabled: active.length > 0 },
  );
  const refresh = React.useCallback(async () => {
    await list.refresh();
    await days.refresh();
  }, [list, days]);
  useAfterTx(refresh);
  const offers = sitting.filter((b) => b.status === "offered");
  // What the reports sent from this page were read as: the form leaves once its day is settled.
  const [read, setRead] = React.useState<{ key: string; id: string; line: string }[]>([]);
  const onRead = (b: Booking, day: number) => (s: TxStatus) => {
    const r = reportOutcome(s);
    const line = r
      ? r.mask === "unclear"
        ? `Day ${day} of ${b.id} was read as unclear: ${gen(REPORT_FEE)} of your credit went to the owner${r.tryN < 2 ? ", and one re-report is left" : ""}.`
        : `Day ${day} of ${b.id} was read as ${r.mask}: ${gen(r.toSitterAtto)} paid to you, ${gen(r.toOwnerAtto)} back to the owner.`
      : `Day ${day} of ${b.id}: ${failureOf(s) || "the report was not stored."}`;
    setRead((xs) => [{ key: s.message + Date.now(), id: b.id, line }, ...xs].slice(0, 6));
    void refresh();
  };
  const open: { b: Booking; d: Day }[] = (days.data ?? []).flatMap(({ b, days: ds }) => ds.map((d) => liveDay(b, d, now)).filter((d) => d.canReport).map((d) => ({ b, d })));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-2">
        <p className="kicker text-sage-ink">For the one who looks after</p>
        <h1>Sitting</h1>
        <p className="text-ink-2">
          Accept the bookings made to your address before their first day, keep a little credit for report fees, and write each day&apos;s report naming the instructions you
          did. The network reads it against every instruction, and that day&apos;s share is paid to you in the same transaction.
        </p>
      </div>
      <WalletGate what="to sit">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex min-w-0 flex-col gap-6">
            {read.length > 0 && (
              <ul className="flex flex-col gap-1.5" aria-label="Reports just read">
                {read.map((r) => (
                  <li key={r.key} className="rounded-xl border-2 border-dashed border-sage bg-sage-wash px-3 py-2 text-[0.88rem] text-sage-ink">
                    {r.line}{" "}
                    <Link className="link" href={bookingPath(r.id)}>
                      Open the diary
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <section className="flex flex-col gap-2">
              <h2>Days open for your report</h2>
              {list.loading || days.loading ? (
                <Placeholder lines={4} />
              ) : list.error ? (
                <ReadError detail={list.error} onRetry={list.retry} />
              ) : days.error ? (
                <ReadError detail={days.error} onRetry={days.retry} />
              ) : open.length === 0 ? (
                <p className="text-ink-2">No day of a booking you sit is open for a report right now.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {open.map(({ b, d }) => (
                    <li key={b.id + "#" + d.day} className="sheet flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="hand text-[1.7rem] leading-none font-bold text-plum-deep">
                          <Link className="link" href={bookingPath(b.id)}>
                            {b.id}
                          </Link>
                          , day {d.day}
                        </p>
                        <p className="mono text-[0.78rem] text-ink-3">report until {clockTime(d.closes, now || undefined)}</p>
                      </div>
                      <ol className="ml-5 list-decimal text-[0.9rem] text-ink-2">
                        {b.instructions.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ol>
                      <ReportForm booking={b} day={d.day} again={d.tries > 0} sitter={me.address} onDone={onRead(b, d.day)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h2>Offers waiting for your answer</h2>
              {offers.length ? (
                <ul className="flex flex-col gap-3">
                  {offers.map((b) => (
                    <li key={b.id} className="flex flex-col gap-2">
                      <ul>
                        <BookingRow b={b} line={rowSummary(b, "sitter", now)} />
                      </ul>
                      <OfferActions b={b} now={now} onDone={() => void refresh()} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-2">No offer is waiting. An owner books you by your address on the Book page.</p>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h2>Everything you sit</h2>
              {sitting.length ? (
                <ul className="flex flex-col gap-2">
                  {sitting.map((b) => (
                    <BookingRow key={b.id} b={b} line={rowSummary(b, "sitter", now)} />
                  ))}
                </ul>
              ) : (
                <p className="text-ink-2">Nothing yet.</p>
              )}
            </section>
          </div>
          <aside className="flex flex-col gap-3">
            <CreditCard address={me.address} />
          </aside>
        </div>
      </WalletGate>
    </div>
  );
}
