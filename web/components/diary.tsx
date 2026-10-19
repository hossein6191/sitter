"use client";

// The diary's own pieces: the round sticker a day wears, the kraft envelope its money went into, the
// checklist of care instructions that ticks itself from the agreed mask, and the week planner whose
// squares fill with each day's report.

import * as React from "react";

import { IconPaw } from "@/components/icons";
import { clockText } from "@/components/wait-note";
import { cx } from "@/lib/cx";
import { liveDay, stickerOf, ticksOf, type DaySticker } from "@/lib/days";
import { clockTime, gen } from "@/lib/format";
import type { Role } from "@/lib/guide";
import type { Booking, Day } from "@/lib/types";

// ---- the sticker ------------------------------------------------------------------------------------

export function DayBadge({ sticker, small, className }: { sticker: DaySticker; small?: boolean; className?: string }) {
  return (
    <span role="img" aria-label={sticker.label} data-kind={sticker.kind} className={cx("day-sticker sticker-land", small && "!size-[3.25rem] !border-2 !text-[0.5rem]", className)}>
      {sticker.kind === "done" && <IconPaw size={small ? 13 : 20} />}
      <span>{sticker.top}</span>
      <span className={sticker.kind === "part" ? (small ? "mono text-[0.72rem] tracking-normal normal-case" : "mono text-[0.85rem] tracking-normal normal-case") : undefined}>{sticker.bottom}</span>
    </span>
  );
}

// ---- the envelope -----------------------------------------------------------------------------------

/** Who an amount went to, in the viewer's words. */
export function payee(to: "sitter" | "owner", role: Role): string {
  if (to === "sitter") return role === "sitter" ? "paid to you" : "paid to the sitter";
  return role === "owner" ? "back to you" : "back to the owner";
}

export function Envelope({ amountAtto, to, role, className }: { amountAtto: string; to: "sitter" | "owner"; role: Role; className?: string }) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="24" height="16" rx="2.5" fill="var(--color-kraft)" stroke="var(--color-kraft-deep)" strokeWidth="1.4" />
        <path d="M1.8 2.2 13 10.2l11.2-8" fill="none" stroke="var(--color-kraft-deep)" strokeWidth="1.4" strokeLinejoin="round" />
        {to === "sitter" ? <circle cx="13" cy="11.4" r="2.6" fill="var(--color-sage-deep)" /> : <circle cx="13" cy="11.4" r="2.6" fill="var(--color-plum)" />}
      </svg>
      <span className="min-w-0 text-[0.78rem] leading-tight">
        <span className="mono font-semibold text-kraft-ink">{gen(amountAtto)}</span> <span className="text-ink-2">{payee(to, role)}</span>
      </span>
    </span>
  );
}

/** The envelopes of one settled day: what went to the sitter and what went back to the owner. */
export function DayEnvelopes({ day, role, className }: { day: Pick<Day, "state" | "toSitterAtto" | "toOwnerAtto">; role: Role; className?: string }) {
  if (day.state !== "paid" && day.state !== "closed") return null;
  const toSitter = BigInt(day.toSitterAtto);
  const toOwner = BigInt(day.toOwnerAtto);
  return (
    <span className={cx("flex flex-col gap-1", className)}>
      {toSitter > 0n && <Envelope amountAtto={day.toSitterAtto} to="sitter" role={role} />}
      {toOwner > 0n && <Envelope amountAtto={day.toOwnerAtto} to="owner" role={role} />}
    </span>
  );
}

// ---- the checklist ------------------------------------------------------------------------------------

/** The care instructions as checkbox lines on the ruled page, ticked from the agreed mask. */
export function Checklist({ items, mask, unread, className }: { items: string[]; mask: string; unread?: string; className?: string }) {
  const ticks = ticksOf(mask, items.length);
  const read = ticks.some((t) => t !== null);
  return (
    <ol className={cx("ruled flex flex-col", className)} aria-label="Care instructions">
      {items.map((item, i) => {
        const t = ticks[i];
        return (
          <li key={i + item} className="flex min-h-[2rem] items-start gap-2.5 py-[3px]">
            <span
              aria-hidden="true"
              className={cx(
                "mt-[2px] flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border-2 bg-card",
                t === true ? "border-plum" : t === false ? "border-brick/60" : "border-line-strong",
              )}
            >
              {t === true && (
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path className="tick-draw" d="M3 8.6 6.6 12 13 4" fill="none" stroke="var(--color-plum)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {t === false && <span className="block h-[2px] w-2.5 rounded bg-brick/60" />}
            </span>
            <span className="mono mt-[3px] w-5 shrink-0 text-[0.78rem] text-ink-3">{i + 1}.</span>
            <span className={cx("min-w-0 flex-1 leading-[1.6rem]", t === false && "text-ink-2")}>
              {item}
              <span className="sr-only">{t === true ? " (shown done)" : t === false ? " (not shown done)" : ""}</span>
              {t === false && <span className="ml-2 text-[0.72rem] font-extrabold tracking-wide text-brick-ink uppercase">not shown done</span>}
            </span>
          </li>
        );
      })}
      {!read && unread && <li className="pt-1 text-[0.8rem] text-ink-3">{unread}</li>}
    </ol>
  );
}

// ---- the week planner ---------------------------------------------------------------------------------

const STATE_WORD: Record<Day["state"], string> = {
  paid: "Paid",
  closed: "Closed",
  void: "Never began",
  offered: "Not accepted yet",
  ended: "Ended early",
  unknown: "No clock",
  upcoming: "Coming up",
  unclear: "Unclear",
  open: "Open for the report",
  closable: "Window ended",
};

function DaySquare({ booking, day, now, selected, onSelect, role }: { booking: Booking; day: Day; now: number; selected: boolean; onSelect: () => void; role: Role }) {
  const sticker = stickerOf(day);
  const last = day.reports[day.reports.length - 1];
  const opens = day.opens;
  const ends = opens + booking.daySeconds;
  const countdown =
    day.state === "upcoming" ? { label: "opens in", left: opens - now } : day.state === "open" || day.state === "unclear" ? { label: "report by", left: day.closes - now } : null;
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Day ${day.day}: ${STATE_WORD[day.state]}${sticker ? ", " + sticker.label : ""}`}
        className={cx(
          "relative flex h-full min-h-[11.5rem] w-full flex-col rounded-[12px] border-2 bg-card p-2.5 text-left transition-shadow",
          selected ? "border-plum shadow-[0_0_0_3px_var(--color-plum-wash)]" : "border-dashed border-line-strong hover:border-plum-soft",
          (day.state === "void" || day.state === "ended") && "opacity-70",
        )}
      >
        <span className="hand pr-10 text-[1.55rem] leading-none font-bold whitespace-nowrap text-plum-deep">Day {day.day}</span>
        <span className="mono mt-0.5 text-[0.7rem] text-ink-3">
          {clockTime(opens, now)}–{clockTime(ends, now).replace(/^.*, /, "")}
        </span>
        {sticker && <DayBadge sticker={sticker} small className="absolute -top-2 -right-2" />}
        <span className="mt-1.5 text-[0.7rem] font-extrabold tracking-[0.08em] text-ink-3 uppercase">{STATE_WORD[day.state]}</span>
        {last ? (
          <span className="hand mt-0.5 line-clamp-4 text-[1.08rem] leading-[1.2] text-ink">&ldquo;{last.text}&rdquo;</span>
        ) : (
          <span className="mt-0.5 text-[0.8rem] text-ink-3">{day.state === "closable" || day.state === "closed" ? "No report was filed." : "No report yet."}</span>
        )}
        <span className="mt-auto flex flex-col gap-1 pt-2">
          {countdown && countdown.left > 0 && (
            <span className="mono text-[0.75rem] text-plum">
              {countdown.label} {clockText(countdown.left)}
            </span>
          )}
          <DayEnvelopes day={day} role={role} />
        </span>
      </button>
    </li>
  );
}

/** The booking's days as squares of a week planner: seven to a row on a wide page, two on a phone. */
export function WeekCalendar({ booking, days, now, selected, onSelect, role }: { booking: Booking; days: Day[]; now: number; selected: number; onSelect: (d: number) => void; role: Role }) {
  const live = days.map((d) => liveDay(booking, d, now));
  const fill = (7 - (live.length % 7)) % 7;
  return (
    <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7" aria-label="The days of the booking">
      {live.map((d) => (
        <DaySquare key={d.day} booking={booking} day={d} now={now} selected={selected === d.day} onSelect={() => onSelect(d.day)} role={role} />
      ))}
      {Array.from({ length: fill }, (_, i) => (
        <li key={"blank" + i} aria-hidden="true" className="hidden min-h-[11.5rem] rounded-[12px] border-2 border-dashed border-line/80 lg:block" />
      ))}
    </ol>
  );
}

export function useSelectedDay(days: Day[], focus: number): [number, (d: number) => void] {
  const [picked, setPicked] = React.useState(0);
  const valid = picked && days.some((d) => d.day === picked) ? picked : focus || days[0]?.day || 0;
  return [valid, setPicked];
}
