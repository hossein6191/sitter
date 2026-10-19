// The demo sitter, so one visitor's wallet can try everything as the owner.
//
// A throwaway Studio key the site's server holds (DEMO_SITTER_KEY) is the demo sitter. A visitor books
// it with their own wallet, short demo days and one of THREE demo care plans word for word: Biscuit the
// cat, Pepper the dog, or the house on Juniper Lane. The demo sitter accepts such a booking, and when
// the visitor presses one of its buttons it files one report from a FIXED list for that plan: every
// instruction done, one missed, a vague note, or two missed. The plan only picks the script; nothing a
// visitor types is ever signed, and a booking with any other instructions gets nothing from it. Every
// pet, place and person here is fictional. Pure, so node runs it in tests/unit.

import { ATTO, UNCLEAR, canReport, dayOf, type BookingStatus, type DayState } from "./rules.ts";

export type PlanKey = "biscuit" | "pepper" | "house";
export const PLAN_KEYS: PlanKey[] = ["biscuit", "pepper", "house"];

export type ScriptKey = "all" | "one" | "vague" | "two";
/** The same four keys in every plan, in this order: the report route takes one of them and nothing else. */
export const SCRIPT_KEYS: ScriptKey[] = ["all", "one", "vague", "two"];

export type DemoScript = {
  plan: PlanKey;
  key: ScriptKey;
  /** the button */
  label: string;
  /** the report, word for word, as the demo sitter signs it */
  text: string;
  /** what the network should agree: a mask, or "unclear" */
  expect: string;
  /** why, in one line */
  why: string;
};

export type DemoPlan = {
  key: PlanKey;
  /** the plan in a few words, for its chip */
  title: string;
  /** who or what is looked after */
  who: string;
  /** one line under the chip */
  blurb: string;
  /** the instructions, word for word: a booking of the demo sitter with exactly these is this plan */
  instructions: string[];
  /** the four reports, in SCRIPT_KEYS order */
  scripts: DemoScript[];
};

const BISCUIT = [
  "Feed Biscuit her morning meal",
  "Feed Biscuit her evening meal",
  "Give Biscuit her heart pill",
  "Fresh water in both bowls",
  "Water the balcony ferns",
];

const PEPPER = ["Walk Pepper around the block after breakfast", "Feed Pepper her dinner at six", "Brush Pepper's coat", "Lock the back door before bed"];

const HOUSE = ["Water the houseplants in the kitchen", "Take the green bins out to the kerb", "Close the front room blinds at dusk"];

const VAGUE_WHY = "it names no instruction, so the rules read it as showing none done: unclear, and the sitter may report once more";

export const DEMO_PLANS: DemoPlan[] = [
  {
    key: "biscuit",
    title: "Biscuit the cat",
    who: "Biscuit, a tabby with a heart condition",
    blurb: "Two meals, a pill, water and the balcony ferns: five instructions",
    instructions: BISCUIT,
    scripts: [
      {
        plan: "biscuit",
        key: "all",
        label: "Everything done",
        text: "Fed Biscuit her morning meal and her evening meal, gave her the heart pill, put fresh water in both bowls and watered the balcony ferns.",
        expect: "11111",
        why: "every instruction is named as done",
      },
      {
        plan: "biscuit",
        key: "one",
        label: "Forgot the pill",
        text: "Fed Biscuit her morning meal and her evening meal, fresh water in both bowls, and the balcony ferns are watered. I forgot her heart pill, sorry.",
        expect: "11011",
        why: "the report says the pill was forgotten",
      },
      { plan: "biscuit", key: "vague", label: "A vague note", text: "All fine, Biscuit is happy and purring!", expect: UNCLEAR, why: VAGUE_WHY },
      {
        plan: "biscuit",
        key: "two",
        label: "Two missed",
        text: "Fed Biscuit her morning meal, gave her the heart pill and put fresh water in both bowls. I missed her evening meal and did not water the balcony ferns.",
        expect: "10110",
        why: "the evening meal and the ferns are said to be missed",
      },
    ],
  },
  {
    key: "pepper",
    title: "Pepper the dog",
    who: "Pepper, a spaniel who likes the park",
    blurb: "A walk, dinner, a brush and the back door: four instructions",
    instructions: PEPPER,
    scripts: [
      {
        plan: "pepper",
        key: "all",
        label: "Everything done",
        text: "Walked Pepper around the block after breakfast, fed her dinner at six, brushed her coat and locked the back door before bed.",
        expect: "1111",
        why: "every instruction is named as done",
      },
      {
        plan: "pepper",
        key: "one",
        label: "Forgot the brush",
        text: "Walked Pepper around the block after breakfast, fed her dinner at six and locked the back door before bed. I did not brush her coat today.",
        expect: "1101",
        why: "the report says the coat was not brushed",
      },
      { plan: "pepper", key: "vague", label: "A vague note", text: "Pepper had a lovely day and all is well here.", expect: UNCLEAR, why: VAGUE_WHY },
      {
        plan: "pepper",
        key: "two",
        label: "Two missed",
        text: "Fed Pepper her dinner at six and brushed her coat. It rained all morning so there was no walk, and I forgot to lock the back door.",
        expect: "0110",
        why: "no walk, and the back door was left unlocked",
      },
    ],
  },
  {
    key: "house",
    title: "The house on Juniper Lane",
    who: "a house with no pets, while its owners are away",
    blurb: "Plants, bins and blinds: three instructions",
    instructions: HOUSE,
    scripts: [
      {
        plan: "house",
        key: "all",
        label: "Everything done",
        text: "Watered the houseplants in the kitchen, took the green bins out to the kerb and closed the front room blinds at dusk.",
        expect: "111",
        why: "every instruction is named as done",
      },
      {
        plan: "house",
        key: "one",
        label: "Forgot the bins",
        text: "Watered the houseplants in the kitchen and closed the front room blinds at dusk. I forgot to take the green bins out.",
        expect: "101",
        why: "the report says the bins stayed in",
      },
      { plan: "house", key: "vague", label: "A vague note", text: "Everything at the house is fine, nothing to report.", expect: UNCLEAR, why: VAGUE_WHY },
      {
        plan: "house",
        key: "two",
        label: "Two missed",
        text: "Watered the houseplants in the kitchen. I forgot the bins and left the front room blinds open overnight.",
        expect: "100",
        why: "the bins and the blinds are said to be missed",
      },
    ],
  },
];

/** The demo terms a visitor is offered: short days, so a whole booking fits in one sitting. */
export const DEMO_TERMS = { dayRateAtto: ATTO / 10n, days: 2, daySeconds: 600, leadSeconds: 420 };

export const planOf = (key: PlanKey): DemoPlan => DEMO_PLANS.find((p) => p.key === key)!;

/** The demo plan a booking's instructions are, compared word for word and in order; null for any other list. */
export function planOfInstructions(items: readonly string[]): DemoPlan | null {
  return DEMO_PLANS.find((p) => p.instructions.length === items.length && p.instructions.every((x, i) => x === items[i])) ?? null;
}

export const isScriptKey = (what: string): what is ScriptKey => (SCRIPT_KEYS as string[]).includes(what);

/** The report the demo sitter files for a key on a booking with these instructions; null when they are no demo plan's. */
export function scriptFor(items: readonly string[], key: string): DemoScript | null {
  const plan = planOfInstructions(items);
  return plan && isScriptKey(key) ? (plan.scripts.find((s) => s.key === key) ?? null) : null;
}

/** What the network should make of a demo report on these instructions; "" when the text is no script of theirs. */
export function scriptedReading(items: readonly string[], text: string): string {
  const plan = planOfInstructions(items);
  return plan?.scripts.find((s) => s.text === text)?.expect ?? "";
}

// ---- when the demo sitter acts ------------------------------------------------------------------------

export type DemoBooking = {
  id: string;
  sitter: string;
  status: BookingStatus;
  instructions: string[];
  startAt: number;
  daySeconds: number;
  days: number;
};

export type DemoDay = { day: number; state: DayState; tries: number };

/** Why the demo sitter does nothing on a booking whose instructions are not one of its plans. */
export function offPlan(id: string): string {
  return `${id}'s instructions are not one of the ${DEMO_PLANS.length} demo care plans word for word, so the demo sitter has no reports for it; the owner may withdraw it while it is not accepted`;
}

/** "" when the demo sitter may accept this booking now, else exactly why not. */
export function demoAcceptProblem(b: DemoBooking | null, demoSitter: string, now: number): string {
  if (!b) return "there is no such booking";
  if (!demoSitter || b.sitter.toLowerCase() !== demoSitter.toLowerCase()) return `${b.id} was not made to the demo sitter`;
  if (b.status !== "offered") return `${b.id} is ${b.status}; the demo sitter accepts only an offer`;
  if (!planOfInstructions(b.instructions)) return offPlan(b.id);
  if (now >= b.startAt) return `the first day of ${b.id} has already started, so it can no longer be accepted; the owner can withdraw it and have everything back`;
  return "";
}

/**
 * The day the demo sitter reports on: the one asked for, or else the day running now when it can still
 * be reported, or else the earliest day still open for a report. 0 when none is.
 */
export function demoDayFor(b: DemoBooking, days: readonly DemoDay[], now: number, asked = 0): number {
  const open = days.filter((d) => canReport(d.state, d.tries));
  if (asked) return open.some((d) => d.day === asked) ? asked : 0;
  const running = open.find((d) => {
    const [opens, ends] = dayOf(b, d.day);
    return now >= opens && now < ends;
  });
  return running?.day ?? open[0]?.day ?? 0;
}

/** "" when the demo sitter may file this report now, else exactly why not. */
export function demoReportProblem(b: DemoBooking | null, demoSitter: string, script: string, day: number, asked = 0): string {
  if (!b) return "there is no such booking";
  if (!demoSitter || b.sitter.toLowerCase() !== demoSitter.toLowerCase()) return `${b.id} was not made to the demo sitter`;
  if (!isScriptKey(script)) return "the demo sitter files only the reports its buttons name";
  if (b.status !== "active") return `${b.id} is ${b.status}; reports are taken while it is active`;
  if (!planOfInstructions(b.instructions)) return offPlan(b.id);
  if (!day) return asked ? `day ${asked} of ${b.id} is not open for a report now` : `no day of ${b.id} is open for a report right now`;
  return "";
}
