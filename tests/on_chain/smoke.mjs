/* Sitter against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copy.
 *
 *   npm ci                                         # genlayer-js 1.1.8 and viem 2.56.8, pinned by package-lock.json
 *   node tests/on_chain/smoke.mjs                  # the whole run, about an hour and a quarter
 *   RESUME=1 node tests/on_chain/smoke.mjs         # continue a run that was cut off, from the saved state
 *   STATE=/some/dir/run.json ...                   # the state file: keys, contract address, every step made
 *   FRESH=1 ...                                    # start over even though a saved run exists
 *
 * Three accounts the script generates and funds itself play the whole story: OWNER is Biscuit's owner, SITTER
 * looks after Biscuit (a cat) and the flat, STRANGER tries what only the two of them may do. The days are short
 * so the run can be watched: three days of 1200 seconds at 0.5 GEN a day, starting about twenty minutes after
 * the run begins. Five instructions of one action each, so each one is worth 0.1 GEN a day. No page is read;
 * the validators read only the instructions and the reports.
 *
 * Phases:
 *   A  deploy. OWNER books B1 for SITTER: five care instructions for Biscuit, 0.5 GEN a day for three days of
 *      1200 s (1.5 GEN held), and B2, the variant nobody reports: one day of 600 s at 0.1 GEN. SITTER accepts
 *      both before they start. STRANGER tries to accept B1 and is refused. OWNER tries to book itself as the
 *      sitter: refused, and the 1.5 GEN comes back in the same transaction. SITTER deposits 0.05 GEN of credit
 *      for report fees. STRANGER tries to report on B1: refused. SITTER tries to report on day 3 at once:
 *      refused, its window is not open. STRANGER tries to close B2's day at once: refused, its window has not
 *      ended.
 *   B  on the chain's clock, one consensus round per report:
 *        day 1  a report covering every instruction                          11111, 0.5 GEN to SITTER
 *        day 2  a report that says the pill was forgotten                    11011, 0.4 to SITTER, 0.1 to OWNER
 *        day 3  "All fine, Biscuit is happy and purring!"                    unclear, the 0.01 fee to OWNER
 *        day 3  the one re-report, covering every instruction                11111, 0.5 to SITTER; B1 finished
 *      a further report on day 3 is refused.
 *   C  once B2's report window has ended with no report, STRANGER closes its day: 0.1 GEN back to OWNER. (If
 *      SITTER's acceptance of B2 had missed its start, OWNER withdraws B2 instead.)
 *   D  the deployed code is read back and compared with contracts/sitter.py byte for byte; the views are checked
 *      against what the run did; SITTER withdraws the credit left; the contract holds nothing; every account ends
 *      where the money says: SITTER up exactly what OWNER is down, STRANGER whole.
 *
 * Every refusal is a signed transaction. Balances are read before and after every step that moves money.
 * Transactions are polled with eth_getTransactionByHash, never with views (gen_call is limited to 30 a minute
 * per client, shared with sim_fundAccount). A round the validators do not carry stores nothing; it is sent again
 * and both transactions are kept. Every id is read from the receipt of the call that made it. Every step is saved
 * as it is made, so a run cut off by a closed laptop continues with RESUME=1 without sending anything twice.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const STATE = process.env.STATE || join(tmpdir(), "sitter-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }   // the connection itself failed, or the answer was not JSON
  }
  throw last;
};
let pass = 0, fail = 0, skipped = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const skip = (n, d = "") => { skipped++; console.log(`SKIP  ${n}${d ? "  - " + d : ""}`); };
const note = (s) => console.log(`      .. ${s}`);
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (text) => createHash("sha256").update(text).digest("hex");

// ---------- state: keys, the contract address and every step already made survive a cut-off run ----------
if (existsSync(STATE) && !process.env.RESUME && !process.env.FRESH) {
  console.log(`A saved run exists at ${STATE}.\nRESUME=1 continues it; FRESH=1 starts over; STATE=<path> keeps another.`);
  process.exit(2);
}
const st = existsSync(STATE) && process.env.RESUME && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = { owner: "OWNER, Biscuit's owner", sitter: "SITTER", stranger: "STRANGER" };
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
save();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so nothing
// is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      const text = errText(e);
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${text.slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => String(t.from_address).toLowerCase() === addr.toLowerCase() && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, exec: one?.execution_result || "", votes: v, applied: v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", exec: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settleBalance = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step of the run: a signed transaction, its tally, what it returned, and the balances it moved.
// opt.value is what is sent with it; opt.watch names the accounts whose balances are read before and
// after; opt.expect is the change each should show once every transfer has landed, a table or a
// function of what the call returned. A step already in the saved state is not sent again.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const watch = opt.watch || [];
    if (!rec.before) { rec.before = {}; for (const k of watch) rec.before[k] = String(await balance(acct[k].address)); save(); }
    let r;
    for (;;) {
      if (!rec.pending) {
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: st.contract, functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg, at: stamp() });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(-30)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      break;
    }
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(r.msg)) : opt.expect;
    rec.after = {}; rec.delta = {};
    for (const k of watch) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) : null;
      const now = want === null ? await balance(acct[k].address) : await settleBalance(acct[k].address, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {} };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who, path) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy " + path.split("/").pop(), args: [], value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(new URL(path, import.meta.url));
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args: [], leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300), at: stamp() });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} deploy ${path.split("/").pop()}  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 or on "Contract not found" instead of failing ----------
let lastRead = 0;
const read = async (fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st.contract, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = []) => { if (!st.views[id]) { st.views[id] = { fn, args, at: stamp(), out: await read(fn, args) }; save(); } return st.views[id].out; };

// Wait on the chain's own clock, read from booking(id), until `target` (unix seconds) has passed by MARGIN.
const MARGIN = 30;
const untilChain = async (bid, target, why) => {
  for (;;) {
    const r = await read("booking", [bid]);
    const now = r && !r.error && Number(r.now) > 0 ? Number(r.now) : Math.floor(Date.now() / 1000);
    const left = target + MARGIN - now;
    if (left <= 0) return now;
    console.log(`      [${stamp()}] waiting ${left}s until ${why}`);
    await sleep(Math.min(left, 120) * 1000);
  }
};

// ---------- the demonstration: Biscuit, five instructions of one action each, three short days; the same words as tests/test_pure.py ----------
const INSTRUCTIONS = [
  "Feed Biscuit her morning meal",
  "Feed Biscuit her evening meal",
  "Give Biscuit her heart pill",
  "Fresh water in both bowls",
  "Water the balcony ferns",
];
const RATE = 5n * GEN / 10n, DAYS = 3, DAY_SECONDS = 1200;
const VARIANT_RATE = GEN / 10n, VARIANT_SECONDS = 600;     // B2: one day nobody reports
const REPORT_GRACE = 1800, REPORT_FEE = GEN / 100n;        // the contract's own
const LEAD = 1200;                                          // B1 and B2 start this long after the run begins
const DAY1 = "Fed Biscuit her morning meal and her evening meal, gave her the heart pill, put fresh water in both bowls and watered the balcony ferns.";
const DAY2 = "Fed Biscuit her morning meal and her evening meal, fresh water in both bowls, and the balcony ferns are watered. I forgot her heart pill, sorry.";
const VAGUE = "All fine, Biscuit is happy and purring!";
const DAY3 = "Sorry for the short note. Fed Biscuit her morning meal and her evening meal, gave her the heart pill, filled both bowls with fresh water and watered the balcony ferns.";
const QUESTION_DONE = "Which numbered INSTRUCTIONS does the REPORT say were carried out on this day? Answer with the list of those numbers, for example [1, 3], or [] for none.";
const QUESTION_NOT_DONE = "Which numbered INSTRUCTIONS does the REPORT not say were carried out on this day, because it leaves them out, says they were skipped, or is too vague to tell? Answer with the list of those numbers, or [] for none.";
const share = (done) => RATE * BigInt(done) / BigInt(INSTRUCTIONS.length);

await fundOnce("owner", 10); await fundOnce("sitter", 5); await fundOnce("stranger", 5);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => k.toUpperCase().padEnd(8) + " " + st.accounts[k]).join("\n           ")}\n           state ${STATE}`);

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, two bookings, both accepted, the refusals`);
st.contract = st.contract || await deploy("deploy", "owner", "../../contracts/sitter.py");
st.startAt = st.startAt || Math.floor(Date.now() / 1000) + LEAD;
save();
const START = st.startAt;
console.log(`      Sitter at ${st.contract}; the first day of B1 and B2 starts at ${new Date(START * 1000).toISOString()}`);
const b1 = await call("bookB1", "owner", "book", [st.accounts.sitter, JSON.stringify(INSTRUCTIONS), String(RATE), DAYS, DAY_SECONDS, START], { value: RATE * BigInt(DAYS), watch: ["owner"], expect: { owner: -RATE * BigInt(DAYS) } });
ok("OWNER books SITTER for Biscuit: five instructions, 0.5 GEN a day, three days of 1200 s, 1.5 GEN held", b1.j?.ok === true && b1.j?.status === "offered" && b1.j?.held === String(RATE * 3n) && JSON.stringify(b1.j?.instructions) === JSON.stringify(INSTRUCTIONS) && moved(b1, "owner", -RATE * 3n), `${votes(b1)}  ${b1.msg.slice(0, 110)}`);
const B1 = b1.j?.booking || "";
const b2 = await call("bookB2", "owner", "book", [st.accounts.sitter, JSON.stringify(INSTRUCTIONS), String(VARIANT_RATE), 1, VARIANT_SECONDS, START], { value: VARIANT_RATE, watch: ["owner"], expect: { owner: -VARIANT_RATE } });
ok(`OWNER books ${b2.j?.booking}, the variant nobody reports: one day of 600 s at 0.1 GEN`, b2.j?.ok === true && b2.j?.held === String(VARIANT_RATE) && moved(b2, "owner", -VARIANT_RATE), `${votes(b2)}  ${b2.msg.slice(0, 90)}`);
const B2 = b2.j?.booking || "";
const a1 = await call("acceptB1", "sitter", "accept", [B1]);
ok(`SITTER accepts ${B1} before its first day`, a1.j?.status === "active" && Number(a1.j?.accepted_at) < START, `${votes(a1)}  ${a1.msg.slice(0, 100)}`);
const a2 = await call("acceptB2", "sitter", "accept", [B2]);
const b2Active = a2.j?.status === "active";
ok(`SITTER accepts ${B2}`, b2Active, `${votes(a2)}  ${a2.msg.slice(0, 100)}`);
const sa = await call("acceptStranger", "stranger", "accept", [B1]);
ok(`STRANGER may not accept ${B1}`, refused(sa, "only the sitter of " + B1 + " may accept it"), `${votes(sa)}  ${sa.msg.slice(0, 110)}`);
const own = await call("bookSelf", "owner", "book", [st.accounts.owner, JSON.stringify(INSTRUCTIONS), String(RATE), DAYS, DAY_SECONDS, START], { value: RATE * BigInt(DAYS), watch: ["owner"], expect: { owner: 0n } });
ok("OWNER may not book itself as the sitter, and the 1.5 GEN comes back in the same transaction", own.exec !== "ERROR" && own.j?.ok === false && String(own.j?.reason).includes("the owner may not book itself as the sitter") && own.j?.returned === String(RATE * 3n) && moved(own, "owner", 0n), `${votes(own)}  ${own.j?.reason}`);
const dep = await call("deposit", "sitter", "deposit", [], { value: 5n * REPORT_FEE, watch: ["sitter"], expect: { sitter: -5n * REPORT_FEE } });
ok("SITTER deposits 0.05 GEN of credit, five report fees", dep.j?.ok === true && dep.j?.credit === String(5n * REPORT_FEE) && moved(dep, "sitter", -5n * REPORT_FEE), `${votes(dep)}  ${dep.msg.slice(0, 100)}`);
const sr = await call("reportStranger", "stranger", "report", [B1, 1, DAY1]);
ok(`STRANGER may not report on ${B1}`, refused(sr, "only the sitter of " + B1 + " may report on it"), `${votes(sr)}  ${sr.msg.slice(0, 110)}`);
const early = await call("reportEarly", "sitter", "report", [B1, 3, DAY3]);
ok(`SITTER may not report on day 3 of ${B1} yet: its window is not open`, refused(early, "day 3 of " + B1 + " opens for its report at " + (START + 2 * DAY_SECONDS)), `${votes(early)}  ${early.msg.slice(0, 140)}`);
const ce = await call("closeEarly", "stranger", "close_day", [B2, 1]);
ok(`STRANGER may not close day 1 of ${B2} yet: its window has not ended`, refused(ce, "the report window for day 1 of " + B2 + " closes at " + (START + VARIANT_SECONDS + REPORT_GRACE)), `${votes(ce)}  ${ce.msg.slice(0, 140)}`);

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: the three days of ${B1}, each report read against every instruction`);
const DAYPLAN = [
  ["day1", 1, DAY1, "11111", 5, "the day 1 report covers every instruction: 11111, the whole 0.5 GEN to SITTER"],
  ["day2", 2, DAY2, "11011", 4, "the day 2 report says the pill was forgotten: 11011, 0.4 GEN to SITTER and 0.1 back to OWNER"],
];
for (const [id, d, text, mask, done, title] of DAYPLAN) {
  if (!st.steps[id]) await untilChain(B1, START + (d - 1) * DAY_SECONDS, `day ${d} of ${B1} opens`);
  const r = await call(id, "sitter", "report", [B1, d, text], { watch: ["sitter", "owner"], expect: { sitter: share(done), owner: RATE - share(done) } });
  ok(title, r.applied && r.j?.mask === mask && r.j?.to_sitter === String(share(done)) && r.j?.to_owner === String(RATE - share(done)) && r.j?.fee === "kept" && moved(r, "sitter", share(done)) && moved(r, "owner", RATE - share(done)), `${votes(r)}  -> ${JSON.stringify({ mask: r.j?.mask, to_sitter: r.j?.to_sitter, to_owner: r.j?.to_owner })}`);
}
if (!st.steps.day3Vague) await untilChain(B1, START + 2 * DAY_SECONDS, `day 3 of ${B1} opens`);
const vague = await call("day3Vague", "sitter", "report", [B1, 3, VAGUE], { watch: ["sitter", "owner"], expect: { sitter: 0n, owner: REPORT_FEE } });
ok(`"${VAGUE}": unclear, nothing paid from the escrow, the 0.01 GEN fee to OWNER from SITTER's credit`, vague.applied && vague.j?.mask === "unclear" && vague.j?.fee === "to_owner" && vague.j?.credit === String(4n * REPORT_FEE) && vague.j?.to_sitter === "0" && moved(vague, "owner", REPORT_FEE) && moved(vague, "sitter", 0n), `${votes(vague)}  -> ${JSON.stringify({ mask: vague.j?.mask, fee: vague.j?.fee, credit: vague.j?.credit })}`);
const again = await call("day3Again", "sitter", "report", [B1, 3, DAY3], { watch: ["sitter", "owner"], expect: { sitter: RATE, owner: 0n } });
ok(`the one re-report on day 3 covers every instruction: 11111, 0.5 GEN to SITTER, and ${B1} is finished`, again.applied && again.j?.mask === "11111" && again.j?.try === 2 && again.j?.booking_status === "finished" && moved(again, "sitter", RATE), `${votes(again)}  -> ${JSON.stringify({ mask: again.j?.mask, try: again.j?.try, booking_status: again.j?.booking_status })}`);
const third = await call("day3Third", "sitter", "report", [B1, 3, DAY3]);
ok(`a further report on day 3 of ${B1} is refused`, refused(third, B1 + " is finished; reports are taken while it is active"), `${votes(third)}  ${third.msg.slice(0, 110)}`);

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: ${B2}, the day nobody reported`);
let closedB2 = null;
if (b2Active) {
  if (!st.steps.closeB2) await untilChain(B1, START + VARIANT_SECONDS + REPORT_GRACE, `the report window of ${B2} ends`);
  closedB2 = await call("closeB2", "stranger", "close_day", [B2, 1], { watch: ["owner", "stranger"], expect: { owner: VARIANT_RATE, stranger: 0n } });
  ok(`nobody reported on ${B2}: once its window ends STRANGER closes the day and the 0.1 GEN goes back to OWNER`, closedB2.j?.status === "closed" && closedB2.j?.to_owner === String(VARIANT_RATE) && closedB2.j?.booking_status === "finished" && moved(closedB2, "owner", VARIANT_RATE) && moved(closedB2, "stranger", 0n), `${votes(closedB2)}  ${closedB2.msg.slice(0, 120)}`);
} else {
  const w = await call("withdrawB2", "owner", "withdraw_booking", [B2], { watch: ["owner"], expect: { owner: VARIANT_RATE } });
  skip(`closing the unreported day of ${B2}`, `SITTER's acceptance missed its start, so OWNER withdrew it instead: ${w.j?.status}, ${w.j?.to_owner}`);
}

// ================================================================ phase D
console.log(`\n[${stamp()}] ---- phase D: the code read back, the views, the balances`);
{
  const file = readFileSync(new URL("../../contracts/sitter.py", import.meta.url));
  const chain = Buffer.from(String(await rpc("gen_getContractCode", [st.contract])), "base64");
  st.code = { address: st.contract, bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
  save();
  ok(`the code deployed at ${st.contract} is byte for byte contracts/sitter.py`, st.code.identical, `${chain.length} bytes, sha256 ${st.code.sha256}`);
  const days = await seen("days", "days_of", [B1, 0, 20]);
  const rows = days.rows || [];
  ok(`days_of(${B1}) shows each day paid on its mask, and day 3's two reports`, JSON.stringify(rows.map((r) => r.state)) === JSON.stringify(["paid", "paid", "paid"]) && JSON.stringify(rows.map((r) => r.mask)) === JSON.stringify(["11111", "11011", "11111"]) && rows[2]?.tries === 2 && rows[2]?.reports?.[0]?.mask === "unclear" && rows[2]?.reports?.[0]?.text === VAGUE, JSON.stringify(rows.map((r) => [r.state, r.mask, r.tries])));
  const row = await seen("booking", "booking", [B1]);
  ok(`booking(${B1}) reads finished, nothing held, 1.4 GEN to SITTER, 0.1 back to OWNER, 0.01 in fees`, row.status === "finished" && row.held === "0" && row.to_sitter === String(14n * GEN / 10n) && row.to_owner === String(GEN / 10n) && row.fees_to_owner === String(REPORT_FEE) && row.done === 14 && row.judged === 15, JSON.stringify({ status: row.status, to_sitter: row.to_sitter, to_owner: row.to_owner, done: row.done, judged: row.judged }));
  const mine = await seen("bookingsOfSitter", "bookings_of", [st.accounts.sitter, 0, 20]);
  ok("bookings_of(SITTER) lists both bookings with the role sitter, the address read in any letter case", mine.total === 2 && (mine.rows || []).every((r) => r.role === "sitter"), JSON.stringify({ total: mine.total }));
  const credit = await seen("credit", "credit", [st.accounts.sitter]);
  ok("credit(SITTER): 0.04 GEN left, four report fees", credit.credit === String(4n * REPORT_FEE) && credit.reports === 4, JSON.stringify(credit));
  const wd = await call("withdraw", "sitter", "withdraw", [], { watch: ["sitter"], expect: { sitter: 4n * REPORT_FEE } });
  ok("SITTER withdraws the credit left: 0.04 GEN back", wd.j?.withdrawn === String(4n * REPORT_FEE) && moved(wd, "sitter", 4n * REPORT_FEE), `${votes(wd)}  ${wd.msg.slice(0, 90)}`);
  const stats = await seen("stats", "stats", []);
  ok("stats(): nothing held, no credit left, three days paid, one closed, one unclear reading, one re-report, one refused payment returned", stats.held === "0" && stats.credit === "0" && stats.days_paid === 3 && stats.days_closed === (closedB2 ? 1 : 0) && stats.unclear === 1 && stats.rereports === 1 && stats.refused_payments === 1 && stats.returned === String(RATE * 3n), JSON.stringify(stats));
  const rules = await seen("rules", "rules", []);
  ok("rules() publishes the questions word for word, the comparison, the combine rule, the vague-report rule and one action per instruction", rules.report?.askings?.[0] === "1, instructions as listed: " + QUESTION_DONE && rules.report?.askings?.[3] === "4, instructions reversed and renumbered: " + QUESTION_NOT_DONE && String(rules.compared).includes("exact equality") && String(rules.report?.combine?.mask).includes("at least one instruction is done") && String(rules.report?.rules).includes("A report that says all is well, or that everything was done, without saying which instructions were done, shows none of them carried out.") && String(rules.limits?.one_action).startsWith("one action per instruction"), "");
  ok("the contract's own balance is zero", (await balance(st.contract)) === 0n, String(await balance(st.contract)));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const toSitter = share(5) + share(4) + share(5) - REPORT_FEE;      // 1.4 GEN paid, less the one fee the owner kept
  const want = { owner: -toSitter, sitter: toSitter, stranger: 0n };
  ok(`every account ends where the money says: SITTER up ${Number(toSitter) / 1e18} GEN, OWNER down the same, STRANGER whole`, Object.keys(want).every((k) => net(k) === want[k]), Object.keys(want).map((k) => k.toUpperCase() + " " + Number(net(k)) / 1e18).join("  "));
}

st.checks = { pass, fail, skipped }; save();
console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
console.log(`Sitter: ${st.contract}  ${EXPLORER}/address/${st.contract}`);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id]; console.log(`${id.padEnd(15)} ${s.tries.map((t) => t.tx + " " + tally(t.votes) + " " + t.exec).join(" | ")}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
