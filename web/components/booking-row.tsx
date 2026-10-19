"use client";

// One booking as a line in a list: its id and care plan, the viewer's side, the days as a row of small
// dots (filled for paid, crossed for closed), what is happening in one line, and the money.

import Link from "next/link";

import { bookingPath } from "@/lib/chain";
import { cx } from "@/lib/cx";
import { planOfInstructions } from "@/lib/demo-sitter";
import { gen } from "@/lib/format";
import type { Booking } from "@/lib/types";

const STATUS_TONE: Record<Booking["status"], string> = {
  offered: "border-amber bg-amber-wash text-amber-ink",
  active: "border-plum bg-plum-wash text-plum-deep",
  finished: "border-sage-deep bg-sage-wash text-sage-ink",
  declined: "border-grey bg-grey-wash text-grey-ink",
  withdrawn: "border-grey bg-grey-wash text-grey-ink",
};

export function BookingRow({ b, line, role }: { b: Booking; line?: string; role?: "owner" | "sitter" | "" }) {
  const plan = planOfInstructions(b.instructions);
  return (
    <li>
      <Link href={bookingPath(b.id)} className="flex flex-col gap-1.5 rounded-[12px] border-2 border-dashed border-line-strong bg-card px-3 py-2.5 hover:border-plum-soft sm:flex-row sm:items-center sm:gap-4">
        <span className="flex min-w-0 items-baseline gap-2 sm:w-56 sm:shrink-0">
          <span className="mono text-[0.95rem] font-semibold text-plum-deep">{b.id}</span>
          <span className="hand min-w-0 truncate text-[1.3rem] leading-none font-bold text-ink">{plan ? plan.title : b.instructions[0] ?? "A booking"}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className={cx("rounded-full border-2 px-2 py-0.5 text-[0.7rem] font-extrabold tracking-wide uppercase", STATUS_TONE[b.status])}>{b.status}</span>
          {role && <span className="text-[0.75rem] font-bold text-ink-3">you are the {role}</span>}
        </span>
        <span className="min-w-0 flex-1 text-[0.85rem] text-ink-2">{line}</span>
        <span className="mono shrink-0 text-[0.8rem] text-ink-3">
          {b.days} × {gen(b.dayRateAtto)}
        </span>
      </Link>
    </li>
  );
}
