// Seeded random journeys through the in-memory contract: anyone does anything, in any order, with right
// and wrong values, demo reports, the sitting page's report chips and junk, and the clock jumps. After
// every step no atto is created or lost; the contract holds exactly the escrow of the offered and active
// bookings plus every credit; every booking's money adds up to what was booked; a settled booking never
// changes again; and the totals stats() publishes add up.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { DEMO_PLANS, SCRIPT_KEYS } from "../../lib/demo-sitter.ts";
import { reportChips } from "../../lib/suggestions.ts";

const G = 10n ** 18n;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const view = async (fn, args) => JSON.parse(await mock.view(fn, args));

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED" || s.status === "UNDETERMINED") return s;
  }
  throw new Error("never final");
}

const seen = new Map();

async function check(total, step) {
  let sum = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) sum += await mock.balanceOf(a);
  assert.equal(sum, total, `${step}: no atto created or lost`);
  const { held, credit, balance } = mock.mockHeld();
  assert.equal(held + credit, balance, `${step}: the contract holds exactly the open escrow plus every credit`);
  const st = await view("stats", []);
  let open = 0n;
  for (let k = 1; k <= st.bookings; k++) {
    const b = await view("booking", ["B" + k]);
    const rate = BigInt(b.day_rate);
    const booked = rate * BigInt(b.days);
    assert.equal(BigInt(b.held) + BigInt(b.to_sitter) + BigInt(b.to_owner), booked, `${step}: B${k}'s money adds up to what was booked`);
    if (b.status === "offered") assert.equal(BigInt(b.held), booked, `${step}: offered B${k} holds every day`);
    else if (b.status === "active") assert.equal(BigInt(b.held), rate * BigInt(b.last_day - b.settled), `${step}: active B${k} holds its unsettled days`);
    else assert.equal(b.held, "0", `${step}: ${b.status} B${k} holds nothing`);
    open += BigInt(b.held);
    assert.ok(b.settled <= b.last_day && b.last_day <= b.days, `${step}: B${k}'s days are in order`);
    const prev = seen.get(b.booking);
    if (prev && !["offered", "active"].includes(prev.status)) {
      const still = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "now" && key !== "begun"));
      assert.deepEqual(still(b), still(prev), `${step}: settled B${k} never changes`);
    }
    seen.set(b.booking, b);
  }
  assert.equal(BigInt(st.held), open, `${step}: stats().held is every open escrow`);
  assert.equal(BigInt(st.held), BigInt(st.taken) - BigInt(st.to_sitters) - BigInt(st.to_owners), `${step}: held = taken - paid out`);
  assert.equal(BigInt(st.credit), BigInt(st.deposited) - BigInt(st.credit_withdrawn) - BigInt(st.fees_to_owners), `${step}: credit = deposited - withdrawn - fees`);
  assert.equal(st.offered + st.active + st.finished + st.declined + st.withdrawn, st.bookings, `${step}: every booking is counted once`);
  assert.equal(st.reports, st.clear + st.unclear, `${step}: every report has one reading`);
  assert.equal(st.days_paid, st.clear, `${step}: every clear reading paid one day`);
}

test("400 seeded random steps by anyone, in any order: the money stays whole", async () => {
  const r = rng(20261019);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  for (const a of mock.ACCOUNTS) await mock.faucet(a);
  for (const a of mock.ACCOUNTS) {
    mock.setMockPersona(a);
    await finalOf(await mock.write(calls.deposit(G / 5n)));
  }
  let total = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) total += await mock.balanceOf(a);
  await check(total, "start");
  const own = ["Feed the goldfish a pinch of flakes", "Water the tomato plants in the greenhouse", "Bring in the post from the mat"];
  const lists = [...DEMO_PLANS.map((p) => p.instructions), own, ["short"], [own[0], own[0].toUpperCase()]];
  for (let step = 1; step <= 400; step++) {
    const st = await view("stats", []);
    const id = "B" + (1 + Math.floor(r() * Math.max(1, st.bookings + 1)));
    const who = pick(mock.ACCOUNTS);
    mock.setMockPersona(who);
    const roll = r();
    let hash = "";
    try {
      if (roll < 0.2) {
        const items = pick(lists);
        // Mostly inside the limits, now and then just outside one of them.
        const odd = r() < 0.2;
        const rate = odd && r() < 0.3 ? G / 50n : pick([G / 20n, G / 10n, G / 4n]);
        const days = odd && r() < 0.3 ? pick([0, 15]) : pick([1, 2, 3]);
        const seconds = odd && r() < 0.3 ? 599 : pick([600, 1200]);
        const lead = odd && r() < 0.3 ? 30 : pick([400, 900]);
        const call = calls.book(pick(mock.ACCOUNTS), items, rate, days, seconds, mock.mockNow() + lead);
        hash = await mock.write(r() < 0.85 ? call : { ...call, value: (call.value ?? 0n) + 1n });
      } else if (roll < 0.27) {
        const offers = [];
        for (let k = 1; k <= st.bookings; k++) {
          const b = await view("booking", ["B" + k]);
          if (b.status === "offered" && b.start_at > mock.mockNow()) offers.push(b);
        }
        const b = offers.length && r() < 0.85 ? pick(offers) : await view("booking", [id]);
        if (b.sitter && r() < 0.85) mock.setMockPersona(b.sitter);
        hash = await mock.write(calls.accept(b.booking ?? id));
      }
      else if (roll < 0.29) hash = await mock.write(calls.decline(id));
      else if (roll < 0.31) hash = await mock.write(calls.withdrawBooking(id));
      else if (roll < 0.33) hash = await mock.write(calls.end(id));
      else if (roll < 0.39) hash = await mock.write(calls.deposit(pick([G / 100n, G / 20n, 0n])));
      else if (roll < 0.41) hash = await mock.write(calls.withdraw());
      else if (roll < 0.56) {
        const open = [];
        for (let k = 1; k <= st.bookings; k++) {
          for (const d of (await view("days_of", ["B" + k, 0, 20])).rows ?? []) if (d.can_report) open.push(d);
        }
        const target = open.length && r() < 0.85 ? pick(open) : { booking: id, day: 1 + Math.floor(r() * 4) };
        const b = await view("booking", [target.booking]);
        const items = b.instructions ?? own;
        if (b.sitter && r() < 0.85) mock.setMockPersona(b.sitter);
        const texts = [...reportChips(items).map((c) => c.value), ...DEMO_PLANS.flatMap((p) => p.scripts.map((s) => s.text)), "too short", "x".repeat(40)];
        hash = await mock.write(calls.report(target.booking, target.day, pick(texts)));
      } else if (roll < 0.64) hash = await mock.write(calls.closeDay(id, 1 + Math.floor(r() * 4)));
      else if (roll < 0.70) {
        const a = await mock.demoAccept(id);
        hash = a.ok ? a.hash : "";
      } else if (roll < 0.80) {
        const a = await mock.demoReport(id, pick([...SCRIPT_KEYS, "nope"]), r() < 0.5 ? 0 : 1 + Math.floor(r() * 3));
        hash = a.ok ? a.hash : "";
      } else mock.advanceClock(pick([30, 60, 120, 300, 600, 1800]));
    } catch (e) {
      if (!/insufficient funds/.test(String(e))) throw e;
    }
    if (hash) await finalOf(hash);
    await check(total, `step ${step}`);
  }
  const st = await view("stats", []);
  assert.ok(st.bookings >= 12 && st.reports >= 8 && st.days_paid >= 3 && st.days_closed >= 2, `the journey went somewhere: ${JSON.stringify({ bookings: st.bookings, reports: st.reports, paid: st.days_paid, closed: st.days_closed })}`);
});
