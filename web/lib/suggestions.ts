// One-click suggestions for every field of the site. Every chip is inside the contract's limits
// (tests/unit/suggestions.test.mjs checks each one against lib/rules.ts), so pressing one never fills a
// field with something the contract would refuse. Pure, so node runs it in tests/unit.

import { DEMO_PLANS, DEMO_TERMS, type PlanKey } from "./demo-sitter.ts";
import { ATTO, MAX_REPORT, UNCLEAR, reportProblem } from "./rules.ts";

export type Chip<T> = { label: string; value: T; tag?: string };

/** The demo care plans: a chip fills every instruction at once. */
export const PLAN_CHIPS: Chip<PlanKey>[] = DEMO_PLANS.map((p) => ({ label: p.title, value: p.key, tag: `${p.instructions.length} lines` }));

/** Single-action instructions to start a list of one's own. */
export const INSTRUCTION_CHIPS: Chip<string>[] = [
  "Feed the cat her morning meal",
  "Feed the cat her evening meal",
  "Scoop the litter tray",
  "Fresh water in the bowl",
  "Walk the dog for half an hour",
  "Water the plants on the windowsill",
  "Bring in the post",
  "Lock the back door before bed",
].map((v) => ({ label: v, value: v }));

/** How many days. */
export const DAYS_CHIPS: Chip<number>[] = [
  { label: "1 day", value: 1 },
  { label: "2 days", value: 2 },
  { label: "3 days", value: 3 },
  { label: "a week", value: 7 },
];

/** The day rate in GEN, as a form field holds it. */
export const RATE_CHIPS: Chip<string>[] = [
  { label: "0.1 GEN", value: "0.1" },
  { label: "0.25 GEN", value: "0.25" },
  { label: "0.5 GEN", value: "0.5" },
  { label: "1 GEN", value: "1" },
];

/** How long a day lasts: short demo days so a whole booking fits in one sitting, or a real day. */
export const DAY_LENGTH_CHIPS: Chip<number>[] = [
  { label: "10 minutes", value: 600, tag: "demo" },
  { label: "20 minutes", value: 1200 },
  { label: "1 hour", value: 3600 },
  { label: "a whole day", value: 86400 },
];

/** When the first day starts, in seconds from now: at least five minutes, so the sitter can accept. */
export const START_CHIPS: Chip<number>[] = [
  { label: "in 7 minutes", value: DEMO_TERMS.leadSeconds, tag: "demo" },
  { label: "in 15 minutes", value: 900 },
  { label: "in an hour", value: 3600 },
  { label: "tomorrow", value: 86400 },
];

/** A sitter's credit for report fees, in GEN: 0.01 GEN a report. */
export const DEPOSIT_CHIPS: Chip<string>[] = [
  { label: "0.05 GEN", value: "0.05", tag: "5 reports" },
  { label: "0.1 GEN", value: "0.1", tag: "10 reports" },
  { label: "0.5 GEN", value: "0.5", tag: "50 reports" },
];

/** A booking id to look up, from the newest one the ledger knows. */
export function lookupChips(newest: number): Chip<string>[] {
  const out: Chip<string>[] = [];
  for (let k = newest; k >= 1 && out.length < 4; k--) out.push({ label: "B" + k, value: "B" + k });
  return out;
}

export type ReportChip = Chip<string> & { expect: string };

/**
 * Reports a sitter can start from, built from the booking's own instructions: every one done, the last
 * one missed, and a vague note. Each names the instructions in the owner's words, so a reader that
 * follows the rules can tell which is which; a chip that would not fit the contract's limit is left out.
 */
export function reportChips(items: readonly string[]): ReportChip[] {
  const n = items.length;
  if (n < 1) return [];
  const out: ReportChip[] = [];
  const all = "Done today: " + items.join("; ") + ".";
  out.push({ label: "Every instruction done", value: all, expect: "1".repeat(n), tag: "1".repeat(n) });
  if (n >= 2) {
    const missed = "Done today: " + items.slice(0, n - 1).join("; ") + ". Not done today: " + items[n - 1] + ".";
    out.push({ label: "The last one missed", value: missed, expect: "1".repeat(n - 1) + "0", tag: "1".repeat(n - 1) + "0" });
  }
  out.push({ label: "A vague note", value: "All fine here today, nothing to report.", expect: UNCLEAR, tag: UNCLEAR });
  return out.filter((c) => c.value.length <= MAX_REPORT && !reportProblem(c.value));
}

/** The GEN a chip names, in atto: what the form will send. */
export const chipAtto = (gen: string): bigint => {
  const [w, f = ""] = gen.split(".");
  return BigInt(w) * ATTO + BigInt((f + "0".repeat(18)).slice(0, 18));
};
