// The contract's rules, in TypeScript, with no imports: the limits, the four askings, the words it
// stores, the report windows, and the readers of the caller's arguments. The in-memory contract of
// mock mode (lib/chain-mock.ts) is built on these, the forms check against them before anything is
// signed, and tests/unit runs them from node with no browser, against contracts/sitter.py itself.
//
// Every refusal sentence here is the contract's own, word for word, so a form, the mock and the chain
// all say the same thing about the same input.

export const ATTO = 10n ** 18n;
export const MIN_RATE = ATTO / 20n;
export const MAX_RATE = 20n * ATTO;
export const MIN_DAYS = 1;
export const MAX_DAYS = 14;
export const MIN_DAY_SECONDS = 600;
export const MAX_DAY_SECONDS = 86400;
export const MIN_LEAD = 300;
export const MAX_LEAD = 90 * 86400;
export const MIN_INSTRUCTIONS = 1;
export const MAX_INSTRUCTIONS = 6;
export const MIN_INSTRUCTION = 10;
export const MAX_INSTRUCTION = 150;
export const MAX_INSTRUCTIONS_JSON = 2000;
export const MIN_REPORT = 30;
export const MAX_REPORT = 900;
export const REPORT_GRACE = 1800;
export const MAX_REPORTS = 2;
export const REPORT_FEE = ATTO / 100n;
export const TAG_CHARS = 16;
export const MAX_ANSWER = 400;
export const PAGE = 20;
export const ID_CHARS = 16;
export const ADDRESS_CHARS = 42;
export const ZERO_ADDRESS = "0x" + "0".repeat(40);

// ---- the askings, in the contract's words -------------------------------------------------------------

export const QUESTION_DONE =
  "Which numbered INSTRUCTIONS does the REPORT say were carried out on this day? Answer with the list of those " +
  "numbers, for example [1, 3], or [] for none.";
export const QUESTION_NOT_DONE =
  "Which numbered INSTRUCTIONS does the REPORT not say were carried out on this day, because it leaves them out, " +
  "says they were skipped, or is too vague to tell? Answer with the list of those numbers, or [] for none.";
export const READING =
  "Rules: judge only what the REPORT says about this day. An instruction was carried out when the report says it " +
  "was done, in words that make clear which instruction it is; the report need not repeat the instruction word for " +
  "word. A report that says all is well, or that everything was done, without saying which instructions were " +
  "done, shows none of them carried out. An instruction done only in part, such as one meal of two, was not " +
  "carried out. The report is the sitter's own claim: take what it says as said, and do not guess beyond it.";
export const RETURN_LIST =
  "Use only the numbers shown in this INSTRUCTIONS block, each at most once. Return JSON of the form " + '{"answer": [1, 3]} or {"answer": []} and nothing else.';

// ---- the words the contract stores --------------------------------------------------------------------

export const UNCLEAR = "unclear";
export type BookingStatus = "offered" | "active" | "finished" | "declined" | "withdrawn";
export const STATUSES: BookingStatus[] = ["offered", "active", "finished", "declined", "withdrawn"];
/** What a stored day row says: reported without a clear reading yet, paid on a mask, or closed. */
export type StoredDay = "unclear" | "paid" | "closed";
/** A day as a reader sees it (the contract's _day_row): a stored state, or where the clock puts it. */
export type DayState = "paid" | "closed" | "void" | "offered" | "ended" | "unknown" | "upcoming" | "unclear" | "open" | "closable";
export const DAY_STATES: DayState[] = ["paid", "closed", "void", "offered", "ended", "unknown", "upcoming", "unclear", "open", "closable"];

/** True for a mask of n characters of 1 and 0 with at least one 1, as the contract stores it. */
export const isMask = (mask: string, n: number): boolean => mask.length === n && /^[01]+$/.test(mask) && mask.includes("1");
/** How many instructions a mask shows done. */
export const doneOf = (mask: string): number => [...mask].filter((c) => c === "1").length;

// ---- reading the caller, as the contract does -----------------------------------------------------

/** The characters Python's str.strip() treats as whitespace (str.isspace()). */
const PY_SPACE_CHARS = "\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0                　";

/** Python's str.strip(): JS trim() also takes U+FEFF and misses \x1c-\x1f and \x85. */
export function pyStrip(text: string): string {
  let a = 0;
  let b = text.length;
  while (a < b && PY_SPACE_CHARS.includes(text[a])) a++;
  while (b > a && PY_SPACE_CHARS.includes(text[b - 1])) b--;
  return text.slice(a, b);
}

/** The contract's _text_problem: "" when the text may be stored, else why not. Printable ASCII on one line. */
export function textProblem(text: string, least: number, most: number, what: string): string {
  // Python counts code points; a JS string's length counts UTF-16 units.
  const n = [...text].length;
  if (n < least || n > most) return what + " is " + least + " to " + most + " characters; this one is " + n;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c > 126) return what + " is printable ASCII on one line";
  }
  return "";
}

/** The contract's _number_arg: an int, or a string of at most 40 ASCII digits; -1 otherwise (a bool is refused by name). */
export function numberArg(raw: unknown): bigint {
  if (typeof raw === "boolean") return -1n;
  if (typeof raw === "bigint") return raw >= 0n ? raw : -1n;
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : -1n;
  if (typeof raw === "string") {
    const s = pyStrip(raw);
    return s.length <= 40 && /^[0-9]+$/.test(s) ? BigInt(s) : -1n;
  }
  return -1n;
}

/** The contract's _address_text: a lowercase 0x address, or "" when it is not one. */
export function addressText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const text = pyStrip(raw).toLowerCase();
  if (text.length !== ADDRESS_CHARS || !text.startsWith("0x")) return "";
  return /^[0-9a-f]*$/.test(text.slice(2)) ? text : "";
}

/** True when a JSON text holds a number written with a fraction or an exponent (Python reads it as a float). */
function hasFloat(text: string): boolean {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i;
      while (j < text.length && /[-+0-9.eE]/.test(text[j])) j++;
      if (/[.eE]/.test(text.slice(i, j))) return true;
      i = j - 1;
    }
  }
  return false;
}

/** The contract's _instructions_of: the care instructions from a caller's JSON list of strings, and "" or why they cannot be taken. */
export function instructionsOf(raw: unknown): { items: string[]; problem: string } {
  if (typeof raw !== "string") return { items: [], problem: "the instructions are a JSON list of strings" };
  const text = pyStrip(raw);
  const n = [...text].length;
  if (n > MAX_INSTRUCTIONS_JSON) return { items: [], problem: "the instructions are at most " + MAX_INSTRUCTIONS_JSON + " characters as sent; these are " + n };
  let parsed: unknown;
  try {
    if (hasFloat(text)) throw new Error("a number with a fraction");
    parsed = JSON.parse(text);
  } catch {
    return { items: [], problem: 'the instructions are a JSON list of strings, such as ["Water the balcony ferns"]' };
  }
  if (!Array.isArray(parsed) || parsed.length < MIN_INSTRUCTIONS || parsed.length > MAX_INSTRUCTIONS)
    return { items: [], problem: "the instructions are a list of " + MIN_INSTRUCTIONS + " to " + MAX_INSTRUCTIONS + " strings" };
  const items: string[] = [];
  const lowered: string[] = [];
  for (let k = 0; k < Math.min(parsed.length, MAX_INSTRUCTIONS); k++) {
    const what = "instruction " + (k + 1);
    const entry = parsed[k];
    if (typeof entry !== "string") return { items: [], problem: what + " is a string" };
    const item = pyStrip(entry);
    const problem = textProblem(item, MIN_INSTRUCTION, MAX_INSTRUCTION, what);
    if (problem) return { items: [], problem };
    if (lowered.includes(item.toLowerCase())) return { items: [], problem: what + " repeats an earlier one; every instruction must be its own" };
    items.push(item);
    lowered.push(item.toLowerCase());
  }
  return { items, problem: "" };
}

/** The instructions as the site sends them: the list a form holds, each line stripped, as JSON. */
export const instructionsJson = (items: string[]): string => JSON.stringify(items.map((i) => pyStrip(plain(i))));

/** The book() checks a form can make before signing, in the contract's order: "" when it would be taken. */
export function bookProblem(b: { owner: string; sitter: string; items: string[]; rateAtto: bigint; days: number; daySeconds: number; startAt: number; now: number; valueAtto?: bigint }): string {
  const mate = addressText(b.sitter);
  if (mate === "") return "the sitter is an address: 0x and 40 hex characters";
  if (mate === ZERO_ADDRESS) return "the sitter is not the zero address";
  if (mate === b.owner.toLowerCase()) return "the owner may not book itself as the sitter";
  const { problem } = instructionsOf(instructionsJson(b.items));
  if (problem) return problem;
  if (b.rateAtto < MIN_RATE || b.rateAtto > MAX_RATE) return "the day rate is a whole number of atto from " + MIN_RATE + " (0.05 GEN) to " + MAX_RATE + " (20 GEN)";
  if (b.days < MIN_DAYS || b.days > MAX_DAYS) return "a booking is " + MIN_DAYS + " to " + MAX_DAYS + " days";
  if (b.daySeconds < MIN_DAY_SECONDS || b.daySeconds > MAX_DAY_SECONDS) return "a day is " + MIN_DAY_SECONDS + " to " + MAX_DAY_SECONDS + " seconds";
  if (b.startAt < b.now + MIN_LEAD || b.startAt > b.now + MAX_LEAD)
    return "the first day starts " + MIN_LEAD + " to " + MAX_LEAD + " seconds after the booking, so the sitter has time to accept; this one starts " + (b.startAt - b.now) + " seconds from now";
  if (b.valueAtto !== undefined && b.valueAtto !== b.rateAtto * BigInt(b.days)) return "send exactly the day rate times the days, " + b.rateAtto * BigInt(b.days) + " atto; this one sent " + b.valueAtto;
  return "";
}

/** report()'s check of the text, after the strip. */
export const reportProblem = (text: string): string => textProblem(pyStrip(text), MIN_REPORT, MAX_REPORT, "a report");

// ---- the report windows -----------------------------------------------------------------------------

export type Clocked = { startAt: number; daySeconds: number; days: number };

/** The contract's _window: day d's report window, [its start, its end + REPORT_GRACE). */
export function windowOf(b: Clocked, d: number): [number, number] {
  const opens = b.startAt + (d - 1) * b.daySeconds;
  return [opens, opens + b.daySeconds + REPORT_GRACE];
}

/** The day itself, without the grace: [its start, its end). */
export function dayOf(b: Clocked, d: number): [number, number] {
  const opens = b.startAt + (d - 1) * b.daySeconds;
  return [opens, opens + b.daySeconds];
}

/** The contract's _started: how many days have begun by `now`. */
export function started(b: Clocked, now: number): number {
  if (now < b.startAt) return 0;
  return Math.min(b.days, Math.floor((now - b.startAt) / b.daySeconds) + 1);
}

/**
 * The contract's _day_row state for day d, worked out again on the page's own clock so a square moves
 * from upcoming to open to closable without a new read. `stored` is the day row's status ("" when the
 * day has no row).
 */
export function dayStateAt(b: Clocked & { status: BookingStatus; lastDay: number }, d: number, stored: StoredDay | "", now: number): DayState {
  if (stored === "paid" || stored === "closed") return stored;
  if (b.status === "declined" || b.status === "withdrawn") return "void";
  if (b.status === "offered") return "offered";
  if (d > b.lastDay) return "ended";
  if (now < 0) return "unknown";
  const [opens, closes] = windowOf(b, d);
  if (now < opens) return "upcoming";
  if (now < closes) return stored === "unclear" ? "unclear" : "open";
  return "closable";
}

/** The contract's can_report: open or unclear, and fewer than MAX_REPORTS tries. */
export const canReport = (state: DayState, tries: number): boolean => (state === "open" || state === "unclear") && tries < MAX_REPORTS;

// ---- what the site sends --------------------------------------------------------------------------

const TYPOGRAPHIC: [string, string][] = [
  ["‘", "'"],
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
  ["–", "-"],
  ["—", "-"],
  ["…", "..."],
  [" ", " "],
];

/**
 * A text as a form sends it: typographic quotes, dashes and the ellipsis made plain, and every run of
 * whitespace, line breaks included, turned into one space. The contract itself only strips the ends;
 * this is what keeps a pasted report on one line of printable ASCII.
 */
export function plain(text: string): string {
  let t = String(text ?? "");
  for (const [fancy, plainChar] of TYPOGRAPHIC) t = t.split(fancy).join(plainChar);
  return t
    .split(/[\s\x1c-\x1f\x85]+/)
    .filter(Boolean)
    .join(" ");
}

/** A contract sentence as a sentence: capital first letter, full stop at the end, the error tag dropped. */
export function sentence(text: string): string {
  const t = String(text ?? "")
    .replace(/^\s*\[(EXPECTED|LLM_ERROR)\]\s*/i, "")
    .trim();
  if (!t) return "";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?)]$/.test(s) ? s : s + ".";
}

/** "B3" from "B3", "b3" or "3"; "" for anything else. */
export function parseBookingId(raw: string): string {
  let text = "";
  try {
    text = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    return "";
  }
  const m = /^B?([1-9]\d{0,8})$/i.exec(text);
  return m ? "B" + m[1] : "";
}

/** The number inside an id: 3 for "B3"; 0 when there is none. */
export const idNumber = (id: string): number => Number(/^B([1-9]\d{0,8})$/.exec(id)?.[1] ?? 0);
