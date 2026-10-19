"use client";

// The contract's own totals, a booking looked up by its id, and the newest bookings with what is
// happening in each.

import { useRouter } from "next/navigation";
import * as React from "react";

import { Sticker } from "@/components/button";
import { BookingRow } from "@/components/booking-row";
import { Placeholder, ReadError, readEach } from "@/components/read-state";
import { Suggest } from "@/components/suggest";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { bookingPath, isMock, readBooking, readStats } from "@/lib/chain";
import { gen } from "@/lib/format";
import { rowSummary } from "@/lib/guide";
import { parseBookingId } from "@/lib/rules";
import { lookupChips } from "@/lib/suggestions";
import type { Booking } from "@/lib/types";

/** How many of the newest bookings the ledger reads: Studio allows 30 reads a minute. */
const NEWEST = 8;

function Tally({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[12px] border-2 border-dashed border-line-strong bg-card px-3 py-2.5">
      <span className="text-[0.72rem] font-extrabold tracking-[0.08em] text-ink-3 uppercase">{label}</span>
      <span className="mono text-[1.25rem] font-semibold text-plum-deep">{value}</span>
      {note && <span className="text-[0.75rem] text-ink-3">{note}</span>}
    </div>
  );
}

export default function LedgerPage() {
  const router = useRouter();
  const now = useNow();
  const stats = useRead(() => readStats(), []);
  const count = stats.data?.bookings ?? 0;
  const newest = useRead(
    async () => {
      const ids = Array.from({ length: Math.min(NEWEST, count) }, (_, i) => "B" + (count - i));
      const out = await readEach(ids, async (id) => (await readBooking(id)).data);
      return { data: out.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])) as Booking[], source: isMock ? ("mock" as const) : ("chain" as const) };
    },
    [count],
    { enabled: count > 0 },
  );
  const refresh = React.useCallback(async () => {
    await stats.refresh();
  }, [stats]);
  useAfterTx(refresh);
  const [lookup, setLookup] = React.useState("");
  const id = parseBookingId(lookup);
  const s = stats.data;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-2">
        <p className="kicker text-sage-ink">The back pages</p>
        <h1>Ledger</h1>
        <p className="text-ink-2">The contract&apos;s own totals, as stats() returns them. The contract always holds exactly the escrow of the offered and active bookings plus every credit.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2>Totals</h2>
        {stats.loading ? (
          <Placeholder lines={4} />
        ) : stats.error ? (
          <ReadError detail={stats.error} onRetry={stats.retry} />
        ) : s ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <Tally label="Bookings" value={s.bookings} note={`${s.offered} offered · ${s.active} active · ${s.finished} finished`} />
            <Tally label="Never began" value={s.declined + s.withdrawn} note={`${s.declined} declined · ${s.withdrawn} withdrawn`} />
            <Tally label="Reports read" value={s.reports} note={`${s.clear} clear · ${s.unclear} unclear · ${s.rereports} re-reports`} />
            <Tally label="Days" value={s.daysPaid + s.daysClosed} note={`${s.daysPaid} paid · ${s.daysClosed} closed · ${s.endedEarly} bookings ended early`} />
            <Tally label="Held now" value={gen(s.heldAtto)} note={`of ${gen(s.takenAtto)} ever booked`} />
            <Tally label="To sitters" value={gen(s.toSittersAtto)} />
            <Tally label="Back to owners" value={gen(s.toOwnersAtto)} note={`plus ${gen(s.feesToOwnersAtto)} in report fees`} />
            <Tally label="Report credit" value={gen(s.creditAtto)} note={`${gen(s.depositedAtto)} deposited · ${gen(s.creditWithdrawnAtto)} withdrawn`} />
            <Tally label="Refused payments" value={s.refusedPayments} note={`${gen(s.returnedAtto)} returned in the same transaction`} />
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2>Look up a booking</h2>
        <form
          className="flex max-w-md flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (id) router.push(bookingPath(id));
          }}
        >
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="lookup">
              Booking id
            </label>
            <input id="lookup" className="field mono" placeholder="B1" value={lookup} onChange={(e) => setLookup(e.target.value)} />
          </div>
          <Sticker size="sm" type="submit" disabled={!id}>
            Open
          </Sticker>
        </form>
        <Suggest label="Recent ids" chips={lookupChips(count)} onPick={(v) => router.push(bookingPath(v))} />
      </section>

      <section className="flex flex-col gap-2">
        <h2>The newest bookings</h2>
        {count === 0 ? (
          <p className="text-ink-2">{stats.loading ? "Reading…" : "No booking yet."}</p>
        ) : newest.loading ? (
          <Placeholder lines={4} />
        ) : newest.error ? (
          <ReadError detail={newest.error} onRetry={newest.retry} />
        ) : (
          <ul className="flex flex-col gap-2">
            {(newest.data ?? []).map((b) => (
              <BookingRow key={b.id} b={b} line={rowSummary(b, "visitor", now)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
