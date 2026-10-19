// One builder per write method of the contract: the method's name, its arguments in the contract's
// order, and the value sent. Pure, so tests/unit/interface.test.mjs checks every builder against the
// signatures in contracts/sitter.py with no browser and no network.

import { instructionsJson } from "./rules.ts";
import type { Call } from "./types.ts";

const int = (n: number): number => Math.trunc(n);

export const calls = {
  /** book(sitter, instructions_json, day_rate, days, day_seconds, start_at), payable: exactly day_rate * days. The rate travels as digits. */
  book: (sitter: string, instructions: string[], dayRateAtto: bigint, days: number, daySeconds: number, startAt: number): Call => ({
    fn: "book",
    args: [sitter.trim().toLowerCase(), instructionsJson(instructions), dayRateAtto.toString(), int(days), int(daySeconds), int(startAt)],
    value: dayRateAtto * BigInt(int(days)),
  }),
  /** withdraw_booking(booking): the owner, while the offer is not accepted. */
  withdrawBooking: (booking: string): Call => ({ fn: "withdraw_booking", args: [booking] }),
  /** decline(booking): the sitter, while the offer is not accepted. */
  decline: (booking: string): Call => ({ fn: "decline", args: [booking] }),
  /** accept(booking): the sitter, before the first day starts. */
  accept: (booking: string): Call => ({ fn: "accept", args: [booking] }),
  /** deposit(), payable: the value joins the sender's own credit for report fees. */
  deposit: (amountAtto: bigint): Call => ({ fn: "deposit", args: [], value: amountAtto }),
  /** withdraw(): the sender's whole credit back to the sender. */
  withdraw: (): Call => ({ fn: "withdraw", args: [] }),
  /** report(booking, day, text): the sitter, inside the day's window; judged in the same call. */
  report: (booking: string, day: number, text: string): Call => ({ fn: "report", args: [booking, int(day), text] }),
  /** close_day(booking, day): anyone, once the day's window ended without a clear reading. */
  closeDay: (booking: string, day: number): Call => ({ fn: "close_day", args: [booking, int(day)] }),
  /** end(booking): the owner, while some day has not begun. */
  end: (booking: string): Call => ({ fn: "end", args: [booking] }),
};
