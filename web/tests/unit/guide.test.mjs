// The waiting copy (lib/guide.ts) for every state of a booking and of a day, for every role, on the
// clock: each line is there, reads as a sentence, says whether the viewer can leave, and says where the
// money is with an amount. Nothing here may promise what contracts/sitter.py does not do.

import test from "node:test";
import assert from "node:assert/strict";

import * as g from "../../lib/guide.ts";
import { DAY_STATES } from "../../lib/rules.ts";

const NOW = 1_800_000_000;
const RATE = "100000000000000000";

const booking = (over = {}) => ({
  id: "B7",
  status: "active",
  startAt: NOW - 300,
  daySeconds: 600,
  days: 3,
  lastDay: 3,
  endedAt: 0,
  dayRateAtto: RATE,
  heldAtto: "300000000000000000",
  toSitterAtto: "0",
  toOwnerAtto: "0",
  feesToOwnerAtto: "0",
  settled: 0,
  ...over,
});
const day = (d, state, over = {}) => ({
  day: d,
  state,
  tries: 0,
  mask: "",
  of: 5,
  opens: NOW - 300 + (d - 1) * 600,
  closes: NOW - 300 + d * 600 + 1800,
  toSitterAtto: "0",
  toOwnerAtto: "0",
  ...over,
});

function wellFormed(guide, what) {
  for (const k of ["id", "kicker", "now", "time", "need", "leave", "money"]) {
    assert.equal(typeof guide[k], "string", `${what}: ${k} is a string`);
    assert.ok(guide[k].length > 2, `${what}: ${k} is said`);
    assert.ok(!/undefined|NaN|\[object/.test(guide[k]), `${what}: ${k} has no hole: ${guide[k]}`);
  }
  for (const k of ["now", "time", "need", "leave", "money"]) assert.match(guide[k], /[.!?]$/, `${what}: ${k} ends as a sentence: ${guide[k]}`);
  assert.ok(["busy", "wait", "act", "done"].includes(guide.tone), `${what}: a known tone`);
  assert.equal(typeof guide.canLeave, "boolean", `${what}: says whether you can leave`);
  assert.match(guide.money, /GEN|money|held|paid/, `${what}: says where the money is`);
  if (guide.left !== undefined) assert.ok(guide.left >= 0 && guide.leftLabel, `${what}: a countdown has a label`);
}

const DAY_CASES = [
  ["paid", { mask: "11111", toSitterAtto: RATE }],
  ["paid", { mask: "11011", toSitterAtto: "80000000000000000", toOwnerAtto: "20000000000000000" }],
  ["closed", { toOwnerAtto: RATE }],
  ["ended", {}],
  ["void", {}],
  ["offered", {}],
  ["upcoming", {}],
  ["open", {}],
  ["unclear", { tries: 1 }],
  ["unclear", { tries: 2 }],
  ["closable", {}],
  ["closable", { tries: 1 }],
  ["unknown", {}],
];

test("every day state, for every role, says the five things", () => {
  const covered = new Set();
  for (const [state, over] of DAY_CASES) {
    for (const role of g.ROLES) {
      const b = booking({ status: state === "void" ? "withdrawn" : state === "offered" ? "offered" : "active" });
      const guide = g.dayGuide(b, day(1, state, over), role, NOW, { demo: true });
      wellFormed(guide, `${state}/${role}`);
      covered.add(state);
    }
  }
  assert.deepEqual([...covered].sort(), [...DAY_STATES].sort(), "every day state the contract writes is covered");
  assert.equal(g.dayGuide(booking(), day(1, "paid", { mask: "11111", toSitterAtto: RATE }), "owner", NOW).id, "day-paid-all");
  assert.equal(g.dayGuide(booking(), day(1, "paid", { mask: "11011" }), "owner", NOW).kicker, "Part done 4/5");
  assert.equal(g.dayGuide(booking(), day(1, "unclear", { tries: 1 }), "sitter", NOW).tone, "act", "the sitter is asked to re-report");
  assert.equal(g.dayGuide(booking(), day(1, "unclear", { tries: 2 }), "sitter", NOW).id, "day-unclear-spent", "no third report is offered");
  assert.match(g.dayGuide(booking(), day(1, "open"), "owner", NOW, { demo: true }).need, /demo sitter's report buttons/);
  assert.match(g.dayGuide(booking(), day(1, "closable"), "visitor", NOW).need, /Anyone may close it/);
  assert.equal(g.dayGuide(booking(), day(1, "closable"), "sitter", NOW).need, "Nothing; it can no longer be reported.");
});

test("every booking state, for every role, says the five things", () => {
  const cases = [
    ["offered", booking({ status: "offered", startAt: NOW + 400 }), []],
    ["offered-late", booking({ status: "offered", startAt: NOW - 10 }), []],
    ["declined", booking({ status: "declined", heldAtto: "0" }), []],
    ["withdrawn", booking({ status: "withdrawn", heldAtto: "0" }), []],
    ["accepted", booking({ startAt: NOW + 200 }), [day(1, "upcoming", { opens: NOW + 200 }), day(2, "upcoming"), day(3, "upcoming")]],
    ["open", booking(), [day(1, "open"), day(2, "upcoming"), day(3, "upcoming")]],
    ["unclear", booking(), [day(1, "unclear", { tries: 1 }), day(2, "open"), day(3, "upcoming")]],
    ["closable", booking(), [day(1, "closable"), day(2, "open"), day(3, "upcoming")]],
    ["next", booking({ settled: 1 }), [day(1, "paid", { mask: "11111" }), day(2, "upcoming"), day(3, "upcoming")]],
    ["ended", booking({ lastDay: 1, endedAt: NOW - 5 }), [day(1, "open"), day(2, "ended"), day(3, "ended")]],
    ["settling", booking({ settled: 3 }), [day(1, "paid", { mask: "11111" }), day(2, "closed"), day(3, "paid", { mask: "10000" })]],
    ["finished", booking({ status: "finished", heldAtto: "0", toSitterAtto: "250000000000000000", toOwnerAtto: "50000000000000000", feesToOwnerAtto: "10000000000000000" }), []],
  ];
  for (const [name, b, days] of cases)
    for (const role of g.ROLES) {
      const guide = g.bookingGuide(b, days, role, NOW, { demo: true, mock: true });
      wellFormed(guide, `${name}/${role}`);
      assert.equal(typeof g.rowSummary(b, role, NOW), "string");
      assert.match(g.rowSummary(b, role, NOW), /[.]$/, `${name}/${role}: the row line is a sentence`);
    }
  const offered = g.bookingGuide(booking({ status: "offered", startAt: NOW + 400 }), [], "owner", NOW);
  assert.equal(offered.left, 400, "the offer counts down to day 1");
  assert.match(offered.money, /0\.3 GEN is held by the contract, not paid to anyone/);
  assert.match(g.bookingGuide(booking({ status: "offered", startAt: NOW - 10 }), [], "owner", NOW).need, /Withdraw the offer to have the whole 0\.3 GEN back/);
  const closing = g.bookingGuide(booking(), [day(1, "closable"), day(2, "open")], "owner", NOW);
  assert.equal(closing.id, "booking-day-closable", "a day to close comes first");
  assert.match(g.bookingGuide(booking(), [day(1, "open")], "owner", NOW).money, /held by the contract for 1 day not yet settled, 0\.1 GEN a day/);
  assert.match(g.bookingGuide(booking({ lastDay: 1, endedAt: NOW - 5 }), [day(1, "open"), day(2, "ended")], "owner", NOW).note ?? "", /ended the booking early/);
  assert.match(g.bookingGuide(booking({ status: "finished" }), [], "visitor", NOW).money, /Nothing is held/);
});

test("every wallet prompt and every transaction on its way says what moves", () => {
  const fns = ["book", "withdraw_booking", "decline", "accept", "deposit", "withdraw", "report", "close_day", "end"];
  for (const fn of fns) {
    for (const mock of [true, false]) {
      const sign = g.signGuide({ fn, label: "Doing " + fn, amountAtto: RATE, role: "owner", mock });
      wellFormed(sign, `sign ${fn}`);
      assert.equal(sign.canLeave, false, "nobody is told to leave while the wallet asks");
      const going = g.sendingGuide({ fn, label: "Doing " + fn, id: "B7", day: 2, amountAtto: RATE, role: "owner", mock });
      wellFormed(going, `sending ${fn}`);
      assert.equal(going.canLeave, true, "a transaction on its way goes through without the page");
    }
  }
  assert.equal(g.sendingGuide({ fn: "report", label: "x", day: 2 }).id, "reading");
  assert.match(g.sendingGuide({ fn: "report", label: "x", day: 2 }).now, /day 2 report against every instruction/);
  for (const kind of ["accept", "report"]) wellFormed(g.demoGuide(kind, { id: "B7", day: 1, mock: true, amountAtto: RATE }), `demo ${kind}`);
  assert.match(g.sendingGuide({ fn: "report", label: "x", mock: false }).time, /1 to 3 minutes/);
});

test("the guide promises nothing the contract does not do", () => {
  const words = [];
  for (const [state, over] of DAY_CASES) for (const role of g.ROLES) words.push(JSON.stringify(g.dayGuide(booking(), day(1, state, over), role, NOW)));
  const all = words.join(" ");
  assert.doesNotMatch(all, /photo|camera|refund the sitter|appeal|dispute/i);
  assert.match(all, /0\.01 GEN/, "the report fee is named");
});
