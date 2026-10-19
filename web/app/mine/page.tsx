"use client";

// Every booking the connected address is a party to, newest first: the ones it booked as the owner and
// the ones it sits, each with what is happening now and where the money is.

import { StickerLink } from "@/components/button";
import { BookingRow } from "@/components/booking-row";
import { Placeholder, ReadError } from "@/components/read-state";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { WalletGate } from "@/components/wallet-gate";
import { readBookingsOfWindow } from "@/lib/chain";
import { rowSummary } from "@/lib/guide";
import type { Booking } from "@/lib/types";

function List({ title, rows, role, now, empty }: { title: string; rows: Booking[]; role: "owner" | "sitter"; now: number; empty: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2>{title}</h2>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((b) => (
            <BookingRow key={b.id} b={b} line={rowSummary(b, role, now)} />
          ))}
        </ul>
      ) : (
        <div className="text-ink-2">{empty}</div>
      )}
    </section>
  );
}

export default function MinePage() {
  const me = useMe();
  const now = useNow();
  const list = useRead(() => readBookingsOfWindow(me.address), [me.address], { enabled: !!me.address });
  useAfterTx(list.refresh);
  const rows = list.data?.rows ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-2">
        <p className="kicker text-sage-ink">Your pages of the diary</p>
        <h1>My bookings</h1>
        <p className="text-ink-2">Every booking this address made as the owner, and every one it sits. Open one for its days, its stickers and its envelopes.</p>
      </div>
      <WalletGate what="to see your bookings">
        {list.loading ? (
          <Placeholder lines={5} />
        ) : list.error ? (
          <ReadError detail={list.error} onRetry={list.retry} />
        ) : (
          <div className="flex flex-col gap-8">
            <List
              title="As the owner"
              rows={rows.filter((b) => b.role === "owner")}
              role="owner"
              now={now}
              empty={
                <div className="flex flex-col items-start gap-2">
                  <p>You have not booked anyone from this address.</p>
                  <StickerLink href="/book" size="sm">
                    Book the demo sitter
                  </StickerLink>
                </div>
              }
            />
            <List title="As the sitter" rows={rows.filter((b) => b.role === "sitter")} role="sitter" now={now} empty={<p>Nobody has booked this address as a sitter yet.</p>} />
            {list.data?.partial && <p className="text-[0.85rem] text-ink-3">Only the newest 60 bookings are listed.</p>}
          </div>
        )}
      </WalletGate>
    </div>
  );
}
