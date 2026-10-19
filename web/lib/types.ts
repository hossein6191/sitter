// The shapes the pages use, in one place with no runtime code: lib/chain.ts maps every view answer
// into these, and lib/chain-mock.ts answers in the contract's own JSON so the same mappers run in
// both modes. Every instant is seconds on the message clock; 0 until it happens. Every amount is a
// decimal string of atto.

import type { BookingStatus, DayState } from "./rules.ts";

/** booking(id): one booking, its parties, its instructions, its terms and its money. */
export type Booking = {
  /** "B3" */
  id: string;
  owner: string;
  sitter: string;
  instructions: string[];
  dayRateAtto: string;
  days: number;
  daySeconds: number;
  startAt: number;
  status: BookingStatus;
  bookedAt: number;
  acceptedAt: number;
  closedAt: number;
  endedAt: number;
  /** the last day still part of the booking: days, or fewer after the owner ended it early */
  lastDay: number;
  /** days paid or closed */
  settled: number;
  heldAtto: string;
  toSitterAtto: string;
  toOwnerAtto: string;
  feesToOwnerAtto: string;
  reports: number;
  unclear: number;
  /** instructions shown done over the paid days, and instructions judged over them */
  done: number;
  judged: number;
  /** the view's own clock when it was read; 0 from a list row or when the read had none */
  now: number;
  /** the browser's clock (the mock's, in mock mode) when the row was read */
  readAt: number;
  /** in bookings_of rows: the address's side */
  role?: "owner" | "sitter";
};

/** One report on a day: what the sitter wrote, what the network agreed, and when. */
export type DayReport = { text: string; mask: string; at: number };

/** day(booking, n): one day, its window, its state, its reports and what it paid. */
export type Day = {
  booking: string;
  day: number;
  opens: number;
  closes: number;
  tries: number;
  reports: DayReport[];
  /** the mask the day was paid on; "" otherwise */
  mask: string;
  done: number;
  of: number;
  toSitterAtto: string;
  toOwnerAtto: string;
  feesToOwnerAtto: string;
  settledAt: number;
  state: DayState;
  canReport: boolean;
};

export type Paged<T> = { total: number; offset: number; limit: number; rows: T[] };

/** credit(address): the credit for report fees, and how many reports it pays for. */
export type Credit = { address: string; creditAtto: string; reportFeeAtto: string; reports: number };

/** stats(): totals only. Amounts in atto. */
export type Stats = {
  bookings: number;
  offered: number;
  active: number;
  finished: number;
  declined: number;
  withdrawn: number;
  endedEarly: number;
  reports: number;
  clear: number;
  unclear: number;
  rereports: number;
  daysPaid: number;
  daysClosed: number;
  heldAtto: string;
  takenAtto: string;
  toSittersAtto: string;
  toOwnersAtto: string;
  feesToOwnersAtto: string;
  creditAtto: string;
  depositedAtto: string;
  creditWithdrawnAtto: string;
  refusedPayments: number;
  returnedAtto: string;
};

/** rules(): the contract's own words, kept as it wrote them. */
export type Rules = Record<string, unknown>;

export type Votes = { agree: number; disagree: number; idle: number };

export type TxStatus = {
  /** PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNDETERMINED | UNKNOWN */
  status: string;
  votes: Votes;
  /** null until votes exist */
  applied: boolean | null;
  /** finished with no majority: nothing was stored */
  undetermined: boolean;
  /** SUCCESS | ERROR | null */
  exec: string | null;
  /** the contract's JSON return, if any */
  result: Record<string, unknown> | null;
  /** the decoded return or error text */
  message: string;
};

export type ReadResult<T> = { data: T; source: "chain" | "mock" };

/** The contract's write methods, by name. */
export type WriteFn = "book" | "withdraw_booking" | "decline" | "accept" | "deposit" | "withdraw" | "report" | "close_day" | "end";

export type Arg = string | number;

/** One contract call, ready to sign: the method, its arguments in the contract's order, and the value sent. */
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

/** Whether the demo sitter can act now, its address, how many report fees its credit holds, and exactly why not. */
export type DemoStatus = { online: boolean; sitter: string; reason: string; reports: number };

/** What the demo sitter answered when asked to act: a transaction hash, or why not. */
export type DemoAnswer = { ok: true; hash: string; day?: number } | { ok: false; reason: string; retryAfter?: number };
