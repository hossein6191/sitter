// The in-memory contract walked through every outcome, as the site drives it: a booking of the demo
// sitter with each demo care plan, every one of its fixed reports read as its mask (or unclear, with the
// fee to the owner and one re-report left), the money of each day split exactly as the contract splits
// it, and every refusal a visitor can meet, with what was sent coming back in the same transaction.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { DEMO_PLANS, DEMO_TERMS, planOf } from "../../lib/demo-sitter.ts";
import { liveDay, stickerOf } from "../../lib/days.ts";
import { MAX_REPORTS, REPORT_FEE, REPORT_GRACE, UNCLEAR } from "../../lib/rules.ts";
import { reportChips } from "../../lib/suggestions.ts";

const G = 10n ** 18n;
const view = async (fn, args) => JSON.parse(await mock.view(fn, args));

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED") return s;
  }
  throw new Error("never final");
}

async function as(who, call) {
  mock.setMockPersona(who);
  return finalOf(await mock.write(call));
}

/** Books the demo sitter with a plan as the visitor, has it accepted, and returns the id and the start. */
async function bookDemo(planKey, days = DEMO_TERMS.days, rate = DEMO_TERMS.dayRateAtto) {
  const start = mock.mockNow() + DEMO_TERMS.leadSeconds;
  const s = await as(mock.VISITOR, calls.book(mock.DEMO_SITTER, planOf(planKey).instructions, rate, days, DEMO_TERMS.daySeconds, start));
  assert.equal(s.result?.ok, true, JSON.stringify(s.result));
  const id = s.result.booking;
  const a = await mock.demoAccept(id);
  assert.equal(a.ok, true, a.reason);
  assert.equal((await finalOf(a.hash)).result?.status, "active");
  return { id, start };
}

const balance = (a) => mock.balanceOf(a);

test("the seeded diary, before the clock moves: Biscuit's finished week, an offer, a running day and a day to close", async () => {
  const b1 = await view("booking", ["B1"]);
  assert.equal(b1.status, "finished");
  assert.equal(b1.done, 14);
  assert.equal(b1.judged, 15);
  assert.equal(b1.to_sitter, (14n * G / 10n).toString());
  assert.equal((await view("booking", ["B2"])).status, "offered");
  const d = await view("days_of", ["B3", 0, 20]);
  assert.ok(d.rows.some((r) => r.can_report), "a day of B3 can be reported by its sitter");
  const b4 = await view("days_of", ["B4", 0, 20]);
  assert.ok(["closable", "closed"].includes(b4.rows[0].state));
});

test("every fixed report of every demo plan is read as its mask, and the day's rate splits exactly", async () => {
  for (const plan of DEMO_PLANS) {
    for (const script of plan.scripts) {
      const { id, start } = await bookDemo(plan.key, 1);
      mock.advanceClock(start - mock.mockNow());
      const ownerBefore = await balance(mock.VISITOR);
      const sitterBefore = await balance(mock.DEMO_SITTER);
      const r = await mock.demoReport(id, script.key);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.day, 1);
      const s = await finalOf(r.hash);
      assert.equal(s.result?.mask, script.expect, `${plan.key}/${script.key}`);
      const n = plan.instructions.length;
      const day = await view("day", [id, 1]);
      if (script.expect === UNCLEAR) {
        assert.equal(s.result.fee, "to_owner");
        assert.equal(day.state, "unclear");
        assert.equal(day.can_report, true, "one re-report is left");
        assert.equal((await balance(mock.VISITOR)) - ownerBefore, REPORT_FEE, "the fee went to the owner");
        assert.equal(await balance(mock.DEMO_SITTER), sitterBefore, "nothing from the escrow");
        assert.equal(stickerOf(day).kind, "unclear");
      } else {
        const done = [...script.expect].filter((c) => c === "1").length;
        const toSitter = (DEMO_TERMS.dayRateAtto * BigInt(done)) / BigInt(n);
        assert.equal(s.result.to_sitter, toSitter.toString());
        assert.equal(BigInt(s.result.to_owner), DEMO_TERMS.dayRateAtto - toSitter);
        assert.equal((await balance(mock.DEMO_SITTER)) - sitterBefore, toSitter);
        assert.equal((await balance(mock.VISITOR)) - ownerBefore, DEMO_TERMS.dayRateAtto - toSitter);
        assert.equal(day.state, "paid");
        assert.equal(stickerOf(day).kind, done === n ? "done" : "part");
        assert.equal((await view("booking", [id])).status, "finished", "a one-day booking finishes with its day");
      }
    }
  }
});

test("an unclear day takes one re-report, then waits for its window and is closed back to the owner", async () => {
  const { id, start } = await bookDemo("pepper", 2);
  mock.advanceClock(start - mock.mockNow() + 60);
  assert.equal((await finalOf((await mock.demoReport(id, "vague")).hash)).result.mask, UNCLEAR);
  assert.equal((await finalOf((await mock.demoReport(id, "vague", 1)).hash)).result.mask, UNCLEAR);
  const day = await view("day", [id, 1]);
  assert.equal(day.tries, MAX_REPORTS);
  assert.equal(day.can_report, false, "no third report");
  const third = await mock.demoReport(id, "all", 1);
  assert.equal(third.ok, false);
  assert.match(third.reason, /day 1 of B\d+ is not open for a report now/);
  // Day 2 is still open on its own clock: the demo sitter reports it, then day 1 is closed by a passer-by.
  mock.advanceClock(DEMO_TERMS.daySeconds);
  const r2 = await mock.demoReport(id, "all");
  assert.equal(r2.day, 2, "the day running now is the one reported");
  assert.equal((await finalOf(r2.hash)).result.mask, "1111");
  const early = await as(mock.PASSER_BY, calls.closeDay(id, 1));
  assert.equal(early.exec, "ERROR");
  assert.match(early.message, /the report window for day 1 of B\d+ closes at \d+, in \d+ seconds; the day can be closed after that/);
  mock.advanceClock(REPORT_GRACE);
  const owner = await balance(mock.VISITOR);
  const closed = await as(mock.PASSER_BY, calls.closeDay(id, 1));
  assert.equal(closed.result?.status, "closed");
  assert.equal((await balance(mock.VISITOR)) - owner, DEMO_TERMS.dayRateAtto, "the day's rate went back to the owner");
  const b = await view("booking", [id]);
  assert.equal(b.status, "finished");
  assert.equal(b.held, "0");
  assert.equal(b.fees_to_owner, (2n * REPORT_FEE).toString());
  assert.equal(stickerOf(await view("day", [id, 1])).kind, "closed");
});

test("every refusal a visitor can meet, with what was sent coming back", async () => {
  const items = planOf("biscuit").instructions;
  const start = mock.mockNow() + 600;
  const before = await balance(mock.VISITOR);
  const self = await as(mock.VISITOR, calls.book(mock.VISITOR, items, G / 10n, 2, 600, start));
  assert.equal(self.result.ok, false);
  assert.equal(self.result.reason, "the owner may not book itself as the sitter");
  assert.equal(self.result.returned, (G / 5n).toString());
  assert.equal(await balance(mock.VISITOR), before, "the value came back in the same transaction");
  const soon = await as(mock.VISITOR, calls.book(mock.DEMO_SITTER, items, G / 10n, 2, 600, mock.mockNow() + 10));
  assert.match(soon.result.reason, /^the first day starts 300 to 7776000 seconds after the booking/);
  const wrong = await as(mock.VISITOR, { ...calls.book(mock.DEMO_SITTER, items, G / 10n, 2, 600, start), value: G });
  assert.match(wrong.result.reason, /^send exactly the day rate times the days, 200000000000000000 atto; this one sent 1000000000000000000$/);
  const twice = await as(mock.VISITOR, calls.book(mock.DEMO_SITTER, ["Feed the cat", "feed the CAT"], G / 10n, 1, 600, start));
  assert.equal(twice.result.reason, "instruction 2 repeats an earlier one; every instruction must be its own");
  assert.equal(await balance(mock.VISITOR), before, "every refused booking returned all of it");
  const nothing = await as(mock.MY_SITTER, calls.deposit(0n));
  assert.equal(nothing.result.ok, false);

  // An off-plan booking of the demo sitter: it will not accept, and the owner withdraws everything.
  const off = await as(mock.VISITOR, calls.book(mock.DEMO_SITTER, ["Feed the goldfish a pinch of flakes"], G / 10n, 1, 600, start));
  const offId = off.result.booking;
  const refusedAccept = await mock.demoAccept(offId);
  assert.equal(refusedAccept.ok, false);
  assert.match(refusedAccept.reason, /not one of the 3 demo care plans word for word/);
  const stranger = await as(mock.PASSER_BY, calls.withdrawBooking(offId));
  assert.match(stranger.message, /only the owner of B\d+ may withdraw it/);
  const w = await as(mock.VISITOR, calls.withdrawBooking(offId));
  assert.equal(w.result.status, "withdrawn");
  assert.equal(await balance(mock.VISITOR), before, "a withdrawn offer returns everything");

  // A stranger may not accept, report or end; the demo sitter declines nothing it was not offered.
  const { id } = await bookDemo("house", 3, G / 4n);
  assert.match((await as(mock.PASSER_BY, calls.report(id, 1, "x".repeat(40)))).message, /only the sitter of B\d+ may report on it/);
  assert.match((await as(mock.PASSER_BY, calls.end(id))).message, /only the owner of B\d+ may end it/);
  const notYet = await mock.demoReport(id, "all");
  assert.equal(notYet.ok, false);
  assert.match(notYet.reason, /no day of B\d+ is open for a report right now/);
  const unknown = await mock.demoReport(id, "something else");
  assert.equal(unknown.ok, false);

  // The owner ends it before day 1: all three days come back.
  const owner = await balance(mock.VISITOR);
  const ended = await as(mock.VISITOR, calls.end(id));
  assert.equal(ended.result.refunded, ((G / 4n) * 3n).toString());
  assert.equal((await balance(mock.VISITOR)) - owner, (G / 4n) * 3n);
  assert.equal((await view("booking", [id])).status, "finished");
  assert.equal((await view("day", [id, 1])).state, "ended");
});

test("a sitter of its own: accepts, deposits, reports with the page's chips, and is paid by the mask", async () => {
  const items = ["Feed the goldfish a pinch of flakes", "Water the tomato plants in the greenhouse", "Bring in the post from the mat"];
  const start = mock.mockNow() + 400;
  const b = await as(mock.EARLIER_OWNER, calls.book(mock.MY_SITTER, items, (G * 3n) / 10n, 2, 1200, start));
  const id = b.result.booking;
  assert.match((await as(mock.MY_SITTER, calls.report(id, 1, "x".repeat(40)))).message, /B\d+ is offered; reports are taken while it is active/);
  assert.equal((await as(mock.MY_SITTER, calls.accept(id))).result.status, "active");
  mock.advanceClock(start - mock.mockNow());
  const chips = reportChips(items);
  const missed = chips.find((c) => c.expect === "110");
  const sitterBefore = await balance(mock.MY_SITTER);
  const r = await as(mock.MY_SITTER, calls.report(id, 1, missed.value));
  assert.equal(r.result.mask, "110");
  assert.equal((await balance(mock.MY_SITTER)) - sitterBefore, (G * 2n) / 10n, "two of three lines of 0.3 GEN");
  const d1 = liveDay({ startAt: start, daySeconds: 1200, days: 2, status: "active", lastDay: 2 }, { ...(await view("day", [id, 1])), canReport: false, toSitterAtto: "0", toOwnerAtto: "0" }, mock.mockNow());
  assert.equal(d1.state, "paid");
  mock.advanceClock(1200);
  const all = await as(mock.MY_SITTER, calls.report(id, 2, chips[0].value));
  assert.equal(all.result.mask, "111");
  assert.equal(all.result.booking_status, "finished");
  const credit = await view("credit", [mock.MY_SITTER]);
  assert.equal(BigInt(credit.credit) >= REPORT_FEE, true, "clear readings keep the fee in the credit");
  const w = await as(mock.MY_SITTER, calls.withdraw());
  assert.equal(w.result.withdrawn, credit.credit);
  assert.match((await as(mock.MY_SITTER, calls.withdraw())).message, /there is no credit to withdraw for 0x/);
});
