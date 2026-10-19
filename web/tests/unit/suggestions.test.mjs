// Every suggestion chip is inside the contract's limits, so pressing one never fills a field with
// something the contract would refuse.

import test from "node:test";
import assert from "node:assert/strict";

import * as s from "../../lib/suggestions.ts";
import { DEMO_PLANS } from "../../lib/demo-sitter.ts";
import * as rules from "../../lib/rules.ts";

test("the booking chips are all inside the limits", () => {
  for (const c of s.INSTRUCTION_CHIPS) assert.equal(rules.textProblem(c.value, rules.MIN_INSTRUCTION, rules.MAX_INSTRUCTION, "x"), "", c.value);
  assert.equal(rules.instructionsOf(rules.instructionsJson(s.INSTRUCTION_CHIPS.slice(0, rules.MAX_INSTRUCTIONS).map((c) => c.value))).problem, "", "six chips make one valid list");
  for (const c of s.DAYS_CHIPS) assert.ok(c.value >= rules.MIN_DAYS && c.value <= rules.MAX_DAYS, c.label);
  for (const c of s.DAY_LENGTH_CHIPS) assert.ok(c.value >= rules.MIN_DAY_SECONDS && c.value <= rules.MAX_DAY_SECONDS, c.label);
  for (const c of s.START_CHIPS) assert.ok(c.value >= rules.MIN_LEAD + 60 && c.value <= rules.MAX_LEAD, `${c.label} leaves a minute to sign`);
  for (const c of s.RATE_CHIPS) {
    const atto = s.chipAtto(c.value);
    assert.ok(atto >= rules.MIN_RATE && atto <= rules.MAX_RATE, c.label);
  }
  for (const c of s.DEPOSIT_CHIPS) assert.ok(s.chipAtto(c.value) >= rules.REPORT_FEE, c.label);
  assert.deepEqual(s.PLAN_CHIPS.map((c) => c.value), DEMO_PLANS.map((p) => p.key));
  assert.deepEqual(s.lookupChips(6).map((c) => c.value), ["B6", "B5", "B4", "B3"]);
  assert.deepEqual(s.lookupChips(0), []);
});

test("a demo booking with every chip set is one the contract takes", () => {
  const now = 1_800_000_000;
  for (const plan of DEMO_PLANS)
    for (const d of s.DAYS_CHIPS)
      for (const r of s.RATE_CHIPS) {
        const why = rules.bookProblem({ owner: "0x" + "1".repeat(40), sitter: "0x" + "2".repeat(40), items: plan.instructions, rateAtto: s.chipAtto(r.value), days: d.value, daySeconds: 600, startAt: now + 420, now });
        assert.equal(why, "", `${plan.key} ${d.label} ${r.label}`);
      }
});

test("the report chips name every instruction, fit the contract, and say what they should be read as", () => {
  const lists = [
    ...DEMO_PLANS.map((p) => p.instructions),
    ["Feed the goldfish a pinch of flakes"],
    Array.from({ length: 6 }, (_, i) => `Instruction number ${i + 1}: ` + "y".repeat(120)),
  ];
  for (const items of lists) {
    const chips = s.reportChips(items);
    assert.ok(chips.length >= 1);
    for (const c of chips) {
      assert.equal(rules.reportProblem(c.value), "", c.label);
      assert.ok(c.expect === rules.UNCLEAR || rules.isMask(c.expect, items.length), `${c.label}: ${c.expect}`);
      if (c.expect !== rules.UNCLEAR) for (const [k, item] of items.entries()) assert.ok(c.value.includes(item), `${c.label} names instruction ${k + 1}`);
    }
  }
  const six = s.reportChips(lists[lists.length - 1]);
  assert.ok(six.every((c) => c.value.length <= rules.MAX_REPORT), "a chip that would not fit is left out");
  assert.deepEqual(s.reportChips([]), []);
});
