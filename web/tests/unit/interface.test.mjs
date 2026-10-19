// The site against the contract it talks to, read from contracts/sitter.py in this repository: every
// write builder names a real write method with the right number of arguments and sends value only to the
// payable ones; every view the site reads exists and the site reads every view; the limits and the
// askings are the contract's own; every refusal sentence the in-memory contract and the forms give is made
// of the contract's words; the readers of the caller's arguments and the report windows answer as the
// contract's do; and the in-memory rules() is the contract's rules(), compared whole.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calls } from "../../lib/calls.ts";
import * as rules from "../../lib/rules.ts";
import * as mock from "../../lib/chain-mock.ts";
import { askContract } from "./oracle.mjs";

// The contract's source with its escaped quotes read as quotes, and Python's adjacent string literals
// (a sentence split over two lines) joined back into one, so its sentences can be looked up whole.
const raw = readFileSync(new URL("../../../contracts/sitter.py", import.meta.url), "utf8");
const contract = raw
  .replace(/\\"/g, '"')
  .replace(/"\s*\n\s*"/g, "")
  .replace(/"\s*\n\s*\+\s*"/g, "")
  .replace(/"\s*\+\s*\n\s*"/g, "")
  .replace(/" "/g, "");
const chainSource = readFileSync(new URL("../../lib/chain.ts", import.meta.url), "utf8");
const mockSource = readFileSync(new URL("../../lib/chain-mock.ts", import.meta.url), "utf8");
const rulesSource = readFileSync(new URL("../../lib/rules.ts", import.meta.url), "utf8");

/** { name: { kind, payable, params } } for every public method of the contract. */
function methods() {
  const out = {};
  const re = /@gl\.public\.(write(?:\.payable)?|view)\s*\n\s*def (\w+)\(self(?:,\s*([^)]*))?\)/g;
  for (const m of raw.matchAll(re)) {
    const params = (m[3] ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    out[m[2]] = { kind: m[1].startsWith("view") ? "view" : "write", payable: m[1].endsWith("payable"), params: params.length };
  }
  return out;
}

/** The value of a Python constant written as `NAME = <expr>` at the start of a line. */
const constant = (name) => {
  const m = new RegExp(`^${name}\\s*=\\s*([^#\\n]+)`, "m").exec(raw);
  assert.ok(m, `the contract defines ${name}`);
  return m[1].trim();
};

/** A parenthesised Python string constant, joined. */
const pyString = (name) => {
  const start = raw.indexOf(`\n${name} = (`);
  assert.ok(start >= 0, `the contract defines ${name}`);
  const body = raw.slice(start, raw.indexOf("\n)", start));
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) => (m[1] ?? m[2]).replace(/\\"/g, '"')).join("");
};

test("every write builder names a write method of the contract, with its arguments and its value", () => {
  const all = methods();
  const built = [
    calls.book("0x" + "a".repeat(40), ["Water the balcony ferns"], 10n ** 17n, 2, 600, 2000000000),
    calls.withdrawBooking("B1"),
    calls.decline("B1"),
    calls.accept("B1"),
    calls.deposit(10n ** 16n),
    calls.withdraw(),
    calls.report("B1", 1, "x".repeat(30)),
    calls.closeDay("B1", 1),
    calls.end("B1"),
  ];
  const writes = Object.entries(all).filter(([, m]) => m.kind === "write").map(([n]) => n).sort();
  assert.equal(writes.length, 9);
  assert.deepEqual([...new Set(built.map((c) => c.fn))].sort(), writes, "the site can send every write and nothing else");
  for (const c of built) {
    const m = all[c.fn];
    assert.equal(c.args.length, m.params, `${c.fn} takes ${m.params} arguments`);
    assert.equal(c.value !== undefined, m.payable, `${c.fn} sends value only when payable`);
  }
  const b = calls.book(" 0xAB" + "c".repeat(38) + " ", [" Feed the cat  "], 15n * 10n ** 16n, 3.7, 600.9, 2000000000.5);
  assert.equal(b.args[0], "0xab" + "c".repeat(38), "the sitter travels as a lowercase address");
  assert.equal(b.args[1], '["Feed the cat"]', "the instructions travel as a JSON list, each one stripped");
  assert.equal(b.args[2], "150000000000000000", "the day rate travels as a string of digits");
  assert.deepEqual(b.args.slice(3), [3, 600, 2000000000], "the numbers travel as integers");
  assert.equal(b.value, 45n * 10n ** 16n, "the value is the day rate times the days");
  assert.equal(calls.deposit(5n).value, 5n);
});

test("every view the site reads is a view of the contract, and the site reads every view", () => {
  const all = methods();
  const read = [...chainSource.matchAll(/view\("(\w+)"/g)].map((m) => m[1]);
  const views = Object.entries(all).filter(([, m]) => m.kind === "view").map(([n]) => n);
  assert.equal(views.length, 7);
  for (const name of read) assert.equal(all[name]?.kind, "view", `${name} is a view`);
  for (const name of views) assert.ok(read.includes(name), `the site reads ${name}`);
  for (const name of views) assert.ok(mockSource.includes(`case "${name}":`), `the in-memory contract answers ${name}`);
  // Every list view is paged, at most PAGE rows, and the site never asks for more.
  assert.match(chainSource, /Math\.min\(PAGE, Math\.trunc\(limit\)\)/);
  assert.ok(rules.MAX_DAYS <= rules.PAGE, "every day of a booking fits one page of days_of");
});

test("the limits are the contract's own", () => {
  const nums = {
    MIN_DAYS: 1, MAX_DAYS: 14, MIN_DAY_SECONDS: 600, MAX_DAY_SECONDS: 86400, MIN_LEAD: 300, MIN_INSTRUCTIONS: 1, MAX_INSTRUCTIONS: 6, MIN_INSTRUCTION: 10,
    MAX_INSTRUCTION: 150, MAX_INSTRUCTIONS_JSON: 2000, MIN_REPORT: 30, MAX_REPORT: 900, REPORT_GRACE: 1800, MAX_REPORTS: 2, TAG_CHARS: 16, MAX_ANSWER: 400,
    PAGE: 20, ID_CHARS: 16, ADDRESS_CHARS: 42,
  };
  for (const [name, value] of Object.entries(nums)) {
    assert.equal(Number(constant(name)), value, `${name} in the contract`);
    assert.equal(rules[name], value, `${name} in lib/rules.ts`);
  }
  assert.equal(constant("MAX_LEAD"), "90 * 86400");
  assert.equal(rules.MAX_LEAD, 90 * 86400);
  assert.equal(constant("MIN_RATE"), "ATTO // 20");
  assert.equal(rules.MIN_RATE, 10n ** 18n / 20n);
  assert.equal(constant("MAX_RATE"), "20 * ATTO");
  assert.equal(rules.MAX_RATE, 20n * 10n ** 18n);
  assert.equal(constant("REPORT_FEE"), "ATTO // 100");
  assert.equal(rules.REPORT_FEE, 10n ** 16n);
  assert.equal(constant("UNCLEAR"), JSON.stringify(rules.UNCLEAR));
  for (const s of rules.STATUSES) assert.ok(raw.includes(`= "${s}"`), `the contract stores the status ${s}`);
  for (const s of rules.DAY_STATES) assert.ok(raw.includes(`"${s}"`), `the contract writes the day state ${s}`);
});

test("the askings, the rules they carry and the answer they ask for are the contract's own, word for word", () => {
  assert.equal(rules.QUESTION_DONE, pyString("QUESTION_DONE"));
  assert.equal(rules.QUESTION_NOT_DONE, pyString("QUESTION_NOT_DONE"));
  assert.equal(rules.READING, pyString("READING"));
  assert.equal(rules.RETURN_LIST, pyString("RETURN_LIST"));
});

/** The text of every call `name(...)` in a source, with its parentheses balanced (strings respected). */
function argsOf(source, name) {
  const out = [];
  let at = 0;
  for (;;) {
    const i = source.indexOf(name + "(", at);
    if (i < 0) return out;
    let depth = 0;
    let j = i + name.length;
    let quote = "";
    for (; j < source.length; j++) {
      const ch = source[j];
      if (quote) {
        if (ch === "\\") j++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "`" || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) break;
    }
    out.push(source.slice(i + name.length + 1, j));
    at = j;
  }
}

/** Every string literal in an expression, cut at its ${...} holes: the pieces of a sentence the code writes itself. */
function pieces(expr) {
  const out = [];
  for (const m of expr.matchAll(/"((?:[^"\\]|\\.)*)"|`([^`]*)`/g)) {
    const text = (m[1] ?? m[2]).replace(/\\"/g, '"');
    for (const part of text.split(/\$\{[^}]*\}/)) {
      const p = part.trim().replace(/^[;:,.]\s*/, "");
      if (p.length >= 8) out.push(p);
    }
  }
  return out;
}

test("every refusal the in-memory contract gives is in the contract's own words", () => {
  const raised = argsOf(mockSource, "fail").filter((a) => /["`]/.test(a));
  assert.ok(raised.length >= 25, `found ${raised.length} refusals`);
  for (const r of raised) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
  const refused = [...mockSource.matchAll(/problem =\s*([\s\S]*?);\n/g)].map((m) => m[1]).filter((a) => /["`]/.test(a));
  assert.ok(refused.length >= 7, `found ${refused.length} payable refusals`);
  for (const r of refused) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("every sentence the forms give in lib/rules.ts is in the contract's own words", () => {
  const start = rulesSource.indexOf("// ---- reading the caller");
  const end = rulesSource.indexOf("// ---- the report windows");
  const said = [...rulesSource.slice(start, end).matchAll(/(?:return|problem:)\s+\(?\s*([^;\n]+)/g)].map((m) => m[1]).filter((a) => /"/.test(a));
  assert.ok(said.length >= 15, `found ${said.length} sentences`);
  for (const r of said) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("the readers of the caller's arguments answer as the contract's do", (t) => {
  const texts = [
    ["", 30, 900, "a report"],
    ["Fed Biscuit her morning meal and her evening meal.", 30, 900, "a report"],
    ["two\nlines in a report that is long enough", 30, 900, "a report"],
    ["café au lait for the sitter, thirty chars", 30, 900, "a report"],
    ["x".repeat(901), 30, 900, "a report"],
    ["short", 10, 150, "instruction 1"],
    ["<b>angle brackets are fine</b>", 10, 150, "instruction 2"],
  ];
  const numbers = [0, 5, -1, "12", " 7 ", "1.5", "abc", "", "1".repeat(41), true, null, 3.5, "١"];
  const addresses = ["0x" + "a".repeat(40), " 0X" + "AB".repeat(20) + " ", "0x" + "g".repeat(40), "0x" + "a".repeat(39), 7, "", "0x" + "0".repeat(40)];
  const lists = [
    '["Feed Biscuit her morning meal", "Water the balcony ferns"]',
    "[]",
    '["a"]',
    '["Feed the cat", "feed the CAT"]',
    '["Feed the cat", 1.5]',
    '["Feed the cat", 2]',
    '{"a": 1}',
    "not json",
    JSON.stringify(Array.from({ length: 7 }, (_, i) => "Instruction number " + i)),
    JSON.stringify(["x".repeat(1990)]),
    JSON.stringify(["  Water the ferns please  "]),
    '["Feed the cat", NaN]',
    '["Feed the cat", 1e3]',
    5,
  ];
  const answers = askContract([
    ...texts.map((a) => ({ fn: "_text_problem", args: a })),
    ...numbers.map((n) => ({ fn: "_number_arg", args: [n] })),
    ...addresses.map((a) => ({ fn: "_address_text", args: [a] })),
    ...lists.map((l) => ({ fn: "_instructions_of", args: [l] })),
  ]);
  if (!answers) return t.skip("no python3 on this machine");
  let k = 0;
  for (const a of texts) assert.equal(rules.textProblem(...a), answers[k++].ok, `text ${JSON.stringify(a[0]).slice(0, 30)}`);
  for (const n of numbers) assert.equal(rules.numberArg(n).toString(), String(answers[k++].ok), `number ${JSON.stringify(n)}`);
  for (const a of addresses) assert.equal(rules.addressText(a), answers[k++].ok, `address ${JSON.stringify(a)}`);
  for (const l of lists) {
    const mine = rules.instructionsOf(l);
    assert.deepEqual([mine.items, mine.problem], answers[k++].ok, `instructions ${String(l).slice(0, 40)}`);
  }
});

test("the report windows and the days begun are the contract's", (t) => {
  const b = { startAt: 1_800_000_000, daySeconds: 600, days: 3 };
  const cases = [1, 2, 3].map((d) => ({ fn: "_window", args: [b, d] }));
  const whens = [b.startAt - 1, b.startAt, b.startAt + 599, b.startAt + 600, b.startAt + 5000];
  const answers = askContract([...cases, ...whens.map((w) => ({ fn: "_started", args: [b, w] }))]);
  if (!answers) return t.skip("no python3 on this machine");
  let k = 0;
  for (const d of [1, 2, 3]) assert.deepEqual(rules.windowOf(b, d), answers[k++].ok, `day ${d}`);
  for (const w of whens) assert.equal(rules.started(b, w), answers[k++].ok, `started at ${w}`);
});

test("the in-memory rules() is the contract's rules(), whole", async (t) => {
  const mine = JSON.parse(await mock.view("rules", []));
  const answers = askContract([{ fn: "rules" }]);
  if (!answers) return t.skip("no python3 on this machine");
  assert.deepEqual(mine, answers[0].ok);
});
