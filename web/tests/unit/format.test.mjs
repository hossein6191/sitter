// The display helpers (lib/format.ts) and the diary's day helpers (lib/days.ts).

import test from "node:test";
import assert from "node:assert/strict";

import * as f from "../../lib/format.ts";
import { liveDay, stickerOf, storedOf, ticksOf } from "../../lib/days.ts";

test("amounts and durations print as a person says them", () => {
  assert.equal(f.gen("500000000000000000"), "0.5 GEN");
  assert.equal(f.gen(10n ** 18n), "1 GEN");
  assert.equal(f.gen("125000000000000000"), "0.125 GEN");
  assert.equal(f.gen("1"), "<0.0001 GEN");
  assert.equal(f.gen(""), "0 GEN");
  assert.equal(f.toAtto("0.5"), 5n * 10n ** 17n);
  assert.equal(f.tryAtto("1.2.3"), null);
  assert.equal(f.span(1200), "20 min");
  assert.equal(f.durationLabel(600), "10 minutes");
  assert.equal(f.durationLabel(86400), "1 day");
  assert.equal(f.short("0x5e1a3c9b07d24f68a1e3c5b7d9f0a2c4e6b8d0f1"), "0x5e1a…d0f1");
});

test("a day moves on the page's own clock and wears the sticker of its reading", () => {
  const b = { startAt: 1000, daySeconds: 600, days: 2, status: "active", lastDay: 2 };
  const day = { booking: "B1", day: 1, opens: 1000, closes: 3400, tries: 0, reports: [], mask: "", done: 0, of: 4, toSitterAtto: "0", toOwnerAtto: "0", feesToOwnerAtto: "0", settledAt: 0, state: "upcoming", canReport: false };
  assert.equal(liveDay(b, day, 999).state, "upcoming");
  assert.equal(liveDay(b, day, 1000).state, "open");
  assert.equal(liveDay(b, day, 1000).canReport, true);
  assert.equal(liveDay(b, day, 3400).state, "closable");
  assert.equal(liveDay(b, { ...day, tries: 1, state: "unclear" }, 2000).state, "unclear");
  assert.equal(liveDay(b, { ...day, tries: 2, state: "unclear" }, 2000).canReport, false);
  assert.equal(liveDay(b, { ...day, state: "paid", mask: "1101", tries: 1 }, 9999).state, "paid");
  assert.equal(liveDay({ ...b, lastDay: 0 }, day, 2000).state, "ended");
  assert.equal(storedOf({ state: "closable", tries: 1 }), "unclear");
  assert.equal(stickerOf({ state: "paid", mask: "1111", of: 4, tries: 1 }).kind, "done");
  assert.equal(stickerOf({ state: "paid", mask: "1101", of: 4, tries: 1 }).bottom, "3/4");
  assert.equal(stickerOf({ state: "unclear", mask: "", of: 4, tries: 1 }).bottom, "re-report");
  assert.equal(stickerOf({ state: "unclear", mask: "", of: 4, tries: 2 }).bottom, "no more tries");
  assert.equal(stickerOf({ state: "closed", mask: "", of: 4, tries: 0 }).kind, "closed");
  assert.equal(stickerOf({ state: "open", mask: "", of: 4, tries: 0 }), null);
  assert.deepEqual(ticksOf("101", 3), [true, false, true]);
  assert.deepEqual(ticksOf("unclear", 3), [null, null, null]);
  assert.deepEqual(ticksOf("000", 3), [null, null, null], "a mask with nothing done is never stored");
});
