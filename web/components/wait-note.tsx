"use client";

// The waiting note: a note taped into the diary. What is happening right now and who it waits for, then
// four short lines (how long, what is needed from you, whether you can leave, where the money is), a
// small counter, and the next button when there is one. The words come from lib/guide.ts, the same for
// every in-between state of the site. A page shows one where its action happens; the note scrolls itself
// into view when a busy state first appears (a calm state never moves the page). Four tones, each with
// its own tape: busy (a transaction or the demo sitter is at work), wait (a day's clock runs), act
// (something can be done now) and done (settled: where the money ended up).

import * as React from "react";

import { IconCheck, IconClock, IconExternal, IconPen } from "@/components/icons";
import { useWallNow } from "@/components/use-now";
import { cx } from "@/lib/cx";
import type { Guide, Tone } from "@/lib/guide";

/** The four lines under the title, from a guide. */
export type WaitLines = { time: string; need: string; leave: string; canLeave: boolean; money: string };

export type Wait = {
  /** a stable name for the state, e.g. "reading"; written on the note for tests and tools */
  id: string;
  tone: Tone;
  kicker: string;
  title: string;
  body?: React.ReactNode;
  lines?: WaitLines;
  /** browser-clock seconds when the wait began: an elapsed counter runs from it */
  since?: number;
  /** seconds left on the contract's clock: a countdown in place of the elapsed counter */
  left?: number;
  leftLabel?: string;
  link?: { href: string; label: string };
  action?: React.ReactNode;
};

/** A guide from lib/guide.ts as a note, with what only the page has: the button, the link, the counter's start. */
export function waitOf(g: Guide, extra: Pick<Wait, "action" | "link" | "since"> = {}): Wait {
  return {
    id: g.id,
    tone: g.tone,
    kicker: g.kicker,
    title: g.now,
    body: g.note || undefined,
    lines: { time: g.time, need: g.need, leave: g.leave, canLeave: g.canLeave, money: g.money },
    left: g.left !== undefined && g.left > 0 ? g.left : undefined,
    leftLabel: g.leftLabel,
    ...extra,
  };
}

/** "0:42", "12:05", "1:02:09"; longer than a day, "2 d 3 h". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  if (d > 0) {
    const h = Math.floor((s % 86400) / 3600);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const KICKER_INK: Record<Tone, string> = {
  busy: "text-plum",
  wait: "text-sage-ink",
  act: "text-amber-ink",
  done: "text-grey-ink",
};

export function WaitNote({ wait, className }: { wait: Wait; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const wall = useWallNow();

  React.useEffect(() => {
    const el = ref.current;
    if (wait.tone !== "busy" || !el || typeof el.scrollIntoView !== "function") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [wait.id, wait.tone]);

  const counter =
    wait.left !== undefined
      ? { text: clockText(wait.left), label: wait.leftLabel ?? "left" }
      : wait.since && wall
        ? { text: clockText(wall - wait.since), label: "so far" }
        : null;
  const lines = wait.lines;

  return (
    <div ref={ref} data-wait={wait.id} data-tone={wait.tone} className={cx("note mt-3 scroll-mt-6 scroll-mb-6", className)}>
      <div className="px-4 pt-5 pb-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0" role="status" aria-live="polite" aria-atomic="true">
            <p className={cx("kicker flex items-center gap-1.5", KICKER_INK[wait.tone])}>
              {wait.tone === "done" ? <IconCheck size={14} /> : wait.tone === "act" ? <IconPen size={14} /> : <IconClock size={14} />}
              {wait.kicker}
            </p>
            <p className="hand mt-1 text-[1.6rem] leading-[1.15] font-bold text-ink">{wait.title}</p>
          </div>
          {counter && (
            <div className="shrink-0 rounded-xl border-2 border-dashed border-plum-soft bg-plum-wash px-2.5 py-1.5 text-right">
              <p className="mono text-[1.25rem] leading-none font-semibold text-plum-deep">{counter.text}</p>
              <p className="mt-1 text-[0.62rem] font-extrabold tracking-[0.1em] text-plum uppercase">{counter.label}</p>
            </div>
          )}
        </div>
        {wait.body && <div className="mt-2 text-[0.92rem] leading-relaxed text-ink-2">{wait.body}</div>}
        {lines && (
          <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[0.9rem] leading-[1.45]">
            <Line label="How long">{lines.time}</Line>
            <Line label="From you" strong>
              {lines.need}
            </Line>
            <Line label="Leave?" warn={!lines.canLeave}>
              {lines.leave}
            </Line>
            <Line label="Money">{lines.money}</Line>
          </dl>
        )}
        {(wait.action || wait.link) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {wait.action}
            {wait.link && (
              <a href={wait.link.href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-[0.82rem] text-ink-2">
                {wait.link.label}
                <IconExternal size={12} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, children, strong, warn }: { label: string; children: React.ReactNode; strong?: boolean; warn?: boolean }) {
  return (
    <>
      <dt className="border-t border-dashed border-line-strong pt-1.5 pb-1 text-[0.68rem] font-extrabold tracking-[0.09em] whitespace-nowrap text-ink-3 uppercase">{label}</dt>
      <dd className={cx("min-w-0 border-t border-dashed border-line-strong pt-1.5 pb-1", strong ? "font-bold text-ink" : warn ? "font-bold text-brick-ink" : "text-ink-2")}>{children}</dd>
    </>
  );
}
