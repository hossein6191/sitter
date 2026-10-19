// A day as the diary shows it: the view's row moved on to the page's own clock, the sticker it wears and
// the envelopes its money went into. Pure, so node runs it in tests/unit.

import { MAX_REPORTS, canReport, dayStateAt, doneOf, isMask, type StoredDay } from "./rules.ts";
import type { Booking, Day } from "./types.ts";

/** What the day row stored, read back from the view: paid, closed, unclear (reported, no clear reading) or nothing. */
export function storedOf(d: Pick<Day, "state" | "tries">): StoredDay | "" {
  if (d.state === "paid" || d.state === "closed") return d.state;
  return d.tries > 0 ? "unclear" : "";
}

/** The day with its state and can-report worked out again at `now`, so a square moves on without a new read. */
export function liveDay(b: Pick<Booking, "startAt" | "daySeconds" | "days" | "status" | "lastDay">, d: Day, now: number): Day {
  if (!now) return d;
  const state = dayStateAt(b, d.day, storedOf(d), now);
  return { ...d, state, canReport: canReport(state, d.tries) };
}

export type StickerKind = "done" | "part" | "unclear" | "closed";
export type DaySticker = { kind: StickerKind; top: string; bottom: string; label: string };

/** The round sticker a day wears: all done, part done k/n, unclear (with a re-report left or not), closed or refunded; null for none. */
export function stickerOf(d: Pick<Day, "state" | "mask" | "of" | "tries">): DaySticker | null {
  if (d.state === "paid" && isMask(d.mask, d.of)) {
    const k = doneOf(d.mask);
    if (k === d.of) return { kind: "done", top: "All", bottom: "done", label: "All done" };
    return { kind: "part", top: "Part done", bottom: `${k}/${d.of}`, label: `Part done, ${k} of ${d.of}` };
  }
  if (d.state === "closed") return { kind: "closed", top: "Closed", bottom: "rate back", label: "Closed: the rate went back to the owner" };
  if (d.state === "ended") return { kind: "closed", top: "Refunded", bottom: "ended early", label: "Refunded: the booking was ended early" };
  if (d.tries > 0 && (d.state === "unclear" || d.state === "closable")) {
    const again = d.state === "unclear" && d.tries < MAX_REPORTS;
    return { kind: "unclear", top: "Unclear", bottom: again ? "re-report" : "no more tries", label: again ? "Unclear: one re-report left" : "Unclear" };
  }
  return null;
}

/** The ticks a mask gives each instruction: true done, false not shown done, null not read (yet). */
export function ticksOf(mask: string, n: number): (boolean | null)[] {
  if (!isMask(mask, n)) return Array.from({ length: n }, () => null);
  return [...mask].map((c) => c === "1");
}
