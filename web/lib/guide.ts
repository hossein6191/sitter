// What a visitor is told whenever they wait, in plain lines: what is happening now and who it waits for,
// how long that takes or the exact time, whether anything is needed from them, whether they can close
// the page, and where the money is (held by the contract day by day, paid to the sitter, or back with
// the owner). The same words for every in-between state of the site: a wallet prompt, a transaction on
// its way, the validators reading a report, a booking waiting to be accepted, a day open for a report,
// an unclear reading and its re-report window, a day closed or paid, and a booking that has ended.
//
// Pure, with no React: the state, the viewer's role and the clock in, the words out. The waiting note
// (components/wait-note.tsx) renders a guide; the rows of /mine and /sitting print the one-line form.
// tests/unit/guide.test.mjs runs every state for every role. Nothing here may promise what
// contracts/sitter.py does not do.

import { clockTime, gen, span } from "./format.ts";
import { MAX_REPORTS, REPORT_FEE, type BookingStatus, type DayState } from "./rules.ts";
import type { WriteFn } from "./types.ts";

/** Who is looking: the owner of the booking, its sitter, or anyone else. */
export type Role = "owner" | "sitter" | "visitor";
export const ROLES: Role[] = ["owner", "sitter", "visitor"];

/** busy: something is at work; wait: a clock runs; act: something can be done now; done: settled. */
export type Tone = "busy" | "wait" | "act" | "done";

export type Guide = {
  /** a stable name for the state, written on the note for tests and tools */
  id: string;
  tone: Tone;
  /** the small line above the title: who it waits for */
  kicker: string;
  /** 1. what is happening now */
  now: string;
  /** 2. how long it usually takes, or the exact time */
  time: string;
  /** 3. what is needed from the viewer right now */
  need: string;
  /** 4. whether the viewer can close the page, and where the thing stays */
  leave: string;
  canLeave: boolean;
  /** 5. where the money is right now, with the amount */
  money: string;
  /** one more sentence when the state needs it */
  note?: string;
  /** seconds until the next thing happens on the contract's clock, for a countdown */
  left?: number;
  leftLabel?: string;
};

export const NOTHING_NEEDED = "Nothing is needed from you.";
export const NOTHING_LEFT = "Nothing is left to do here.";

export type GuideBooking = {
  id: string;
  status: BookingStatus;
  startAt: number;
  daySeconds: number;
  days: number;
  lastDay: number;
  endedAt: number;
  dayRateAtto: string;
  heldAtto: string;
  toSitterAtto: string;
  toOwnerAtto: string;
  feesToOwnerAtto: string;
};

export type GuideDay = {
  day: number;
  state: DayState;
  tries: number;
  mask: string;
  of: number;
  opens: number;
  closes: number;
  toSitterAtto: string;
  toOwnerAtto: string;
};

export type GuideOpts = {
  /** the demo build: things take seconds, not minutes */
  mock?: boolean;
  /** the sitter is the demo sitter and the instructions are one of its plans: its buttons do the reporting */
  demo?: boolean;
};

const FEE = gen(REPORT_FEE);

const ABOUT_30 = (mock?: boolean) => (mock ? "A few seconds in this demo build; about 30 seconds on Studio." : "About 30 seconds.");
const READING_TIME = (mock?: boolean) =>
  mock
    ? "A few seconds in this demo build; 1 to 3 minutes on Studio, where every validator asks its own model."
    : "Usually 1 to 3 minutes: every validator asks its model four questions about the report and the instructions.";

/** "You can close this page; B3 stays under My bookings" (no full stop). */
function keep(id: string, role: Role): string {
  if (role === "owner") return `You can close this page; ${id} stays under My bookings`;
  if (role === "sitter") return `You can close this page; ${id} stays under Sitting`;
  return "You can close this page and come back to this address later";
}

const total = (b: GuideBooking): string => gen(BigInt(b.dayRateAtto) * BigInt(b.days));
const rate = (b: GuideBooking): string => gen(b.dayRateAtto);
const unsettled = (b: GuideBooking, days: readonly GuideDay[]): number => days.filter((d) => d.day <= b.lastDay && d.state !== "paid" && d.state !== "closed").length;

/** Where an active booking's money is: held day by day, and what has gone out so far. */
function heldLine(b: GuideBooking, days: readonly GuideDay[]): string {
  const left = unsettled(b, days);
  const out = BigInt(b.toSitterAtto) > 0n || BigInt(b.toOwnerAtto) > 0n ? ` So far ${gen(b.toSitterAtto)} has gone to the sitter and ${gen(b.toOwnerAtto)} back to the owner.` : "";
  return `${gen(b.heldAtto)} is held by the contract for ${left === 1 ? "1 day" : `${left} days`} not yet settled, ${rate(b)} a day; each day's share is released only when that day's report is read or its window ends.${out}`;
}

// ---- the wallet prompt --------------------------------------------------------------------------------

export type SignInput = {
  fn: WriteFn;
  /** what the call does, e.g. "Booking the demo sitter for 3 days" */
  label: string;
  /** the value sent, or the amount the call moves */
  amountAtto?: string;
  role?: Role;
  mock?: boolean;
};

function moneyBeforeSigning(s: SignInput): string {
  const amount = gen(s.amountAtto ?? "0");
  switch (s.fn) {
    case "book":
      return `${amount} is still in your wallet. Once you confirm it is held by the contract, not paid to the sitter, and released day by day; a refused booking sends all of it back in the same transaction.`;
    case "withdraw_booking":
      return `The contract holds ${amount} for this booking; withdrawing sends all of it back to you.`;
    case "decline":
      return `The contract holds ${amount} for this booking; declining sends all of it back to the owner, none to you.`;
    case "accept":
      return "Accepting moves no money: the owner's payment stays held, and each day's rate is released when that day is reported or closed.";
    case "deposit":
      return `${amount} is still in your wallet. Once you confirm it becomes your credit for report fees (${FEE} a report), which you can withdraw whole at any time.`;
    case "withdraw":
      return `Your whole credit, ${amount}, comes back to your wallet.`;
    case "report":
      return `Nothing moves until the report is read. A clear reading splits the day's rate by the instructions shown done; an unclear one sends ${FEE} of your credit to the owner.`;
    case "close_day":
      return `The day's ${amount} goes back to the owner, all of it.`;
    case "end":
      return `${amount} for the days not yet begun comes back to you; the days already begun stay held and are reported or closed as usual.`;
  }
}

/** The wallet is asking: nothing has been sent yet. */
export function signGuide(s: SignInput): Guide {
  return {
    id: "sign",
    tone: "act",
    kicker: "Waiting for your wallet",
    now: `Your wallet is asking you to confirm: ${s.label}.`,
    time: "Until you confirm or cancel in the wallet.",
    need: "Confirm in the wallet, or cancel there. Nothing is sent until you do.",
    leave: "Stay on this page until the wallet answers; closing it cancels nothing on chain, but the page will not follow the transaction.",
    canLeave: false,
    money: moneyBeforeSigning(s),
  };
}

// ---- a transaction on its way --------------------------------------------------------------------------

export type SendingInput = {
  fn: WriteFn;
  label: string;
  id?: string;
  day?: number;
  amountAtto?: string;
  role?: Role;
  mock?: boolean;
};

/** A transaction is going through: the report being read, or any other call being confirmed. */
export function sendingGuide(s: SendingInput): Guide {
  const where = s.id ? keep(s.id, s.role ?? "visitor") : "You can close this page; the transaction goes through without it";
  if (s.fn === "report")
    return {
      id: "reading",
      tone: "busy",
      kicker: "The validators are reading",
      now: s.day ? `The validators are reading the day ${s.day} report against every instruction.` : "The validators are reading the report against every instruction.",
      time: READING_TIME(s.mock),
      need: "Nothing. Each validator asks DONE and NOT DONE in two numberings; a mask is stored only if every one of them agrees exactly.",
      leave: `${where}, and the reading lands on chain either way.`,
      canLeave: true,
      money: `The day's ${s.amountAtto ? gen(s.amountAtto) : "rate"} stays held until they agree. A mask splits it in this same transaction; unclear moves only the ${FEE} fee; no agreement moves nothing at all.`,
    };
  return {
    id: "sending",
    tone: "busy",
    kicker: "On its way",
    now: `The network is confirming: ${s.label}.`,
    time: ABOUT_30(s.mock),
    need: NOTHING_NEEDED,
    leave: `${where}.`,
    canLeave: true,
    money: moneyWhileSending(s),
  };
}

function moneyWhileSending(s: SendingInput): string {
  const amount = gen(s.amountAtto ?? "0");
  switch (s.fn) {
    case "book":
      return `${amount} goes to the contract, not to the sitter, and is held there day by day; if the booking is refused, all of it comes back in the same transaction.`;
    case "deposit":
      return `${amount} becomes your credit for report fees; if the deposit is refused, it comes back in the same transaction.`;
    default:
      return moneyBeforeSigning({ fn: s.fn, label: s.label, amountAtto: s.amountAtto });
  }
}

/** The demo sitter is accepting or reporting: the site's server signs with its key. */
export function demoGuide(kind: "accept" | "report", s: { id: string; day?: number; mock?: boolean; amountAtto?: string }): Guide {
  if (kind === "accept")
    return {
      id: "demo-accepting",
      tone: "busy",
      kicker: "Waiting for the demo sitter",
      now: `The demo sitter is accepting ${s.id}.`,
      time: ABOUT_30(s.mock),
      need: NOTHING_NEEDED,
      leave: `${keep(s.id, "owner")}; the acceptance lands without it.`,
      canLeave: true,
      money: "Accepting moves no money: your payment stays held day by day.",
    };
  return {
    id: "demo-reporting",
    tone: "busy",
    kicker: "Waiting for the demo sitter",
    now: `The demo sitter has filed its report${s.day ? ` on day ${s.day}` : ""}, and the validators are reading it against every instruction.`,
    time: READING_TIME(s.mock),
    need: NOTHING_NEEDED,
    leave: `${keep(s.id, "owner")}; the reading is stored with the day.`,
    canLeave: true,
    money: `The day's ${s.amountAtto ? gen(s.amountAtto) : "rate"} stays held until the validators agree; then it is split by the mask, or, if unclear, only the ${FEE} fee comes to you.`,
  };
}

// ---- one day -----------------------------------------------------------------------------------------

const doneCount = (mask: string): number => [...mask].filter((c) => c === "1").length;

/** The words for one day of a booking, for whoever is looking. */
export function dayGuide(b: GuideBooking, d: GuideDay, role: Role, now: number, opts: GuideOpts = {}): Guide {
  const label = `Day ${d.day}`;
  const r = rate(b);
  const leave = keep(b.id, role) + ".";
  switch (d.state) {
    case "paid": {
      const k = doneCount(d.mask);
      const all = k === d.of;
      return {
        id: all ? "day-paid-all" : "day-paid-part",
        tone: "done",
        kicker: all ? "All done" : `Part done ${k}/${d.of}`,
        now: all ? `${label}: every instruction was shown done.` : `${label}: ${k} of ${d.of} instructions were shown done.`,
        time: "Settled for good: a paid day never changes.",
        need: NOTHING_NEEDED,
        leave: NOTHING_LEFT,
        canLeave: true,
        money: all ? `${gen(d.toSitterAtto)} was paid to the sitter in the same transaction.` : `${gen(d.toSitterAtto)} was paid to the sitter and ${gen(d.toOwnerAtto)} went back to the owner, in the same transaction.`,
      };
    }
    case "closed":
      return {
        id: "day-closed",
        tone: "done",
        kicker: "Closed",
        now: `${label} was closed after its window ended without a clear reading.`,
        time: "Settled for good.",
        need: NOTHING_NEEDED,
        leave: NOTHING_LEFT,
        canLeave: true,
        money: `Its whole ${r} went back to the owner.`,
      };
    case "ended":
      return {
        id: "day-ended",
        tone: "done",
        kicker: "Refunded",
        now: `${label} was refunded: the owner ended the booking before it began.`,
        time: "Settled for good.",
        need: NOTHING_NEEDED,
        leave: NOTHING_LEFT,
        canLeave: true,
        money: `Its ${r} went back to the owner when the booking was ended.`,
      };
    case "void":
      return {
        id: "day-void",
        tone: "done",
        kicker: "Never began",
        now: `${label} never began: the booking was ${b.status === "declined" ? "declined by the sitter" : "withdrawn by the owner"} before it was accepted.`,
        time: "Settled for good.",
        need: NOTHING_NEEDED,
        leave: NOTHING_LEFT,
        canLeave: true,
        money: "Everything the owner paid went back to the owner.",
      };
    case "offered":
      return {
        id: "day-offered",
        tone: "wait",
        kicker: "Not accepted yet",
        now: `${label} waits for the sitter to accept the booking.`,
        time: `The first day starts at ${clockTime(b.startAt, now)}.`,
        need: role === "sitter" ? "Accept or decline the booking above." : NOTHING_NEEDED,
        leave,
        canLeave: true,
        money: `Its ${r} is held by the contract with the rest of the booking.`,
      };
    case "upcoming":
      return {
        id: "day-upcoming",
        tone: "wait",
        kicker: "Coming up",
        now: `${label} starts at ${clockTime(d.opens, now)}; its report window opens then.`,
        time: `In ${span(d.opens - now)}.`,
        need: role === "sitter" ? "Nothing yet; report once the day has begun." : NOTHING_NEEDED,
        leave,
        canLeave: true,
        money: `Its ${r} is held until it is reported or its window ends.`,
        left: Math.max(0, d.opens - now),
        leftLabel: "until it opens",
      };
    case "open":
      return {
        id: "day-open",
        tone: role === "sitter" ? "act" : "wait",
        kicker: role === "sitter" ? "Your report" : "Waiting for the report",
        now: role === "sitter" ? `${label} is open for your report.` : `${label} is open: waiting for the sitter's report.`,
        time: `The window closes at ${clockTime(d.closes, now)}, in ${span(d.closes - now)}.`,
        need:
          role === "sitter"
            ? `Report what you did, naming each instruction. It costs ${FEE} from your credit, kept on a clear reading.`
            : role === "owner" && opts.demo
              ? "Press one of the demo sitter's report buttons to have it file this day's report."
              : NOTHING_NEEDED,
        leave,
        canLeave: true,
        money: `Its ${r} is held until the report is read: the sitter gets the share for the instructions shown done, the owner the rest.`,
        left: Math.max(0, d.closes - now),
        leftLabel: "window left",
      };
    case "unclear": {
      const again = d.tries < MAX_REPORTS;
      return {
        id: again ? "day-unclear" : "day-unclear-spent",
        tone: role === "sitter" && again ? "act" : "wait",
        kicker: again ? "Unclear · re-report" : "Unclear · waiting for the window",
        now: again
          ? `${label}'s report was unclear: it did not show which instructions were done.`
          : `${label} had its report and its one re-report, and neither was clear.`,
        time: again ? `The sitter may report once more until ${clockTime(d.closes, now)}, in ${span(d.closes - now)}.` : `Its window ends at ${clockTime(d.closes, now)}, in ${span(d.closes - now)}; then anyone may close it.`,
        need: again
          ? role === "sitter"
            ? "Write one more report that names each instruction you did. It is your last on this day."
            : role === "owner" && opts.demo
              ? "Press one of the demo sitter's report buttons again for its one re-report."
              : NOTHING_NEEDED
          : NOTHING_NEEDED,
        leave,
        canLeave: true,
        money: again
          ? `Its ${r} is still held. The ${FEE} report fee went to the owner. A clear re-report splits the rate by the mask; otherwise it goes back to the owner when the window ends.`
          : `Its ${r} is still held and goes back to the owner once the window ends and the day is closed.`,
        left: Math.max(0, d.closes - now),
        leftLabel: "window left",
      };
    }
    case "closable":
      return {
        id: "day-closable",
        tone: "act",
        kicker: "Window ended",
        now: `${label}'s report window ended without a clear reading.`,
        time: "Now: there is no deadline to close it.",
        need: role === "sitter" ? "Nothing; it can no longer be reported." : `Close the day to send its ${r} back to the owner. Anyone may close it.`,
        leave,
        canLeave: true,
        money: `Its ${r} is still held; closing sends all of it to the owner in the same transaction.`,
      };
    case "unknown":
      return {
        id: "day-unknown",
        tone: "wait",
        kicker: "No clock",
        now: `${label} could not be placed on the clock when it was read.`,
        time: "The next read places it.",
        need: NOTHING_NEEDED,
        leave,
        canLeave: true,
        money: `Its ${r} is held by the contract.`,
      };
  }
}

// ---- the booking as a whole ----------------------------------------------------------------------------

/** The day a booking's note is about: one to close, then one unclear, then one open, then the next to begin. */
export function focusDay(days: readonly GuideDay[], now: number, b: Pick<GuideBooking, "daySeconds">): GuideDay | null {
  const pick = (state: DayState) => days.filter((d) => d.state === state);
  const closable = pick("closable");
  if (closable.length) return closable[0];
  const unclear = pick("unclear");
  if (unclear.length) return unclear[0];
  const open = pick("open");
  if (open.length) return open.find((d) => now >= d.opens && now < d.opens + b.daySeconds) ?? open[0];
  const upcoming = pick("upcoming");
  return upcoming[0] ?? null;
}

/** The words for a booking as a whole, for whoever is looking. */
export function bookingGuide(b: GuideBooking, days: readonly GuideDay[], role: Role, now: number, opts: GuideOpts = {}): Guide {
  const leave = keep(b.id, role) + ".";
  if (b.status === "declined" || b.status === "withdrawn")
    return {
      id: b.status,
      tone: "done",
      kicker: b.status === "declined" ? "Declined" : "Withdrawn",
      now: b.status === "declined" ? `The sitter declined ${b.id} before it began.` : `The owner withdrew ${b.id} before the sitter accepted it.`,
      time: "Settled for good.",
      need: NOTHING_NEEDED,
      leave: NOTHING_LEFT,
      canLeave: true,
      money: `All ${total(b)} went back to the owner in the same transaction.`,
    };
  if (b.status === "finished")
    return {
      id: "finished",
      tone: "done",
      kicker: "Finished",
      now: `Every day of ${b.id} is settled.`,
      time: "Settled for good.",
      need: NOTHING_NEEDED,
      leave: NOTHING_LEFT,
      canLeave: true,
      money: `${gen(b.toSitterAtto)} was paid to the sitter and ${gen(b.toOwnerAtto)} went back to the owner${BigInt(b.feesToOwnerAtto) > 0n ? `, plus ${gen(b.feesToOwnerAtto)} in report fees for unclear readings` : ""}. Nothing is held.`,
      note: b.endedAt ? "The owner ended the booking early: the days that had not begun were refunded at once." : undefined,
    };
  if (b.status === "offered") {
    const late = now >= b.startAt;
    if (late)
      return {
        id: "offered-late",
        tone: role === "visitor" ? "wait" : "act",
        kicker: "Never accepted",
        now: `The first day of ${b.id} began and the sitter never accepted it, so it can no longer be accepted.`,
        time: "No deadline: the money waits for the owner.",
        need:
          role === "owner"
            ? `Withdraw the offer to have the whole ${total(b)} back.`
            : role === "sitter"
              ? "Nothing; you may decline it so the owner has the money back sooner."
              : NOTHING_NEEDED,
        leave,
        canLeave: true,
        money: `${total(b)} is still held; withdrawing or declining returns all of it to the owner in the same transaction.`,
      };
    return {
      id: "offered",
      tone: role === "sitter" ? "act" : "wait",
      kicker: role === "sitter" ? "Your answer" : "Waiting for the sitter",
      now:
        role === "sitter"
          ? `An owner booked you for ${b.id} and paid for every day up front. Accept before the first day starts, or decline.`
          : `${b.id} is booked and paid for; it waits for the sitter to accept.`,
      time: `The first day starts at ${clockTime(b.startAt, now)}, in ${span(b.startAt - now)}; it can be accepted until then.`,
      need:
        role === "sitter"
          ? `Accept or decline below. Before your first report, deposit a little credit for report fees (${FEE} a report).`
          : role === "owner"
            ? opts.demo
              ? "Nothing: the demo sitter is asked to accept as soon as your booking is final. If it has not, press its accept button."
              : "Nothing. If the sitter does not answer, you can withdraw the offer and have everything back."
            : NOTHING_NEEDED,
      leave,
      canLeave: true,
      money: `${total(b)} is held by the contract, not paid to anyone; until the sitter accepts, the owner can withdraw all of it.`,
      left: Math.max(0, b.startAt - now),
      leftLabel: "until day 1",
    };
  }
  // active
  const focus = focusDay(days, now, b);
  const ended = b.endedAt && b.lastDay < b.days ? `The owner ended the booking early: day ${b.lastDay + 1} onward was refunded.` : undefined;
  if (!focus)
    return {
      id: "active-settling",
      tone: "wait",
      kicker: "Settling",
      now: `Every day of ${b.id} has been read or closed; the booking finishes with its last settlement.`,
      time: "Moments.",
      need: NOTHING_NEEDED,
      leave,
      canLeave: true,
      money: heldLine(b, days),
      note: ended,
    };
  if (focus.state === "upcoming" && focus.day === 1)
    return {
      id: "accepted",
      tone: "wait",
      kicker: "Accepted",
      now: role === "sitter" ? `You accepted ${b.id}. Day 1 starts at ${clockTime(b.startAt, now)}.` : `The sitter accepted ${b.id}. Day 1 starts at ${clockTime(b.startAt, now)}.`,
      time: `In ${span(b.startAt - now)}.`,
      need: role === "sitter" ? `Nothing yet. Make sure your credit holds at least ${FEE} for each report.` : NOTHING_NEEDED,
      leave,
      canLeave: true,
      money: heldLine(b, days),
      left: Math.max(0, b.startAt - now),
      leftLabel: "until day 1",
      note: ended,
    };
  const g = dayGuide(b, focus, role, now, opts);
  return { ...g, id: "booking-" + g.id, money: focus.state === "closable" ? g.money : heldLine(b, days), note: ended };
}

/** One line for a list row: what is happening and whether the viewer has to act. */
export function rowLine(g: Guide): string {
  return g.tone === "act" ? `${g.now} ${g.need}` : g.now;
}

// ---- one line for a list ---------------------------------------------------------------------------------

/**
 * A booking in one line for the lists of /mine, /sitting and the ledger, from the booking row alone (a
 * list does not read every day): what is happening and, when it is the viewer's turn, what to do.
 */
export function rowSummary(b: GuideBooking & { settled: number }, role: Role, now: number): string {
  switch (b.status) {
    case "declined":
      return "Declined by the sitter: everything went back to the owner.";
    case "withdrawn":
      return "Withdrawn by the owner before it was accepted: everything went back to the owner.";
    case "finished":
      return `Finished: ${gen(b.toSitterAtto)} to the sitter, ${gen(b.toOwnerAtto)} back to the owner.`;
    case "offered":
      if (now >= b.startAt)
        return role === "owner" ? "Never accepted: withdraw it to have everything back." : "Never accepted, and it can no longer be accepted.";
      return role === "sitter"
        ? `Waiting for your answer: accept or decline before ${clockTime(b.startAt, now)}.`
        : `Waiting for the sitter to accept, until ${clockTime(b.startAt, now)}; ${total(b)} held.`;
    case "active": {
      if (now < b.startAt) return `Accepted; day 1 starts at ${clockTime(b.startAt, now)}.`;
      const current = Math.min(b.days, Math.floor((now - b.startAt) / b.daySeconds) + 1);
      const running = current <= b.lastDay && now < b.startAt + b.lastDay * b.daySeconds ? `Day ${current} of ${b.lastDay} is running` : "Every day has begun";
      const turn = role === "sitter" ? "; open it to report" : "";
      return `${running} · ${b.settled} settled · ${gen(b.heldAtto)} held${turn}.`;
    }
  }
}
