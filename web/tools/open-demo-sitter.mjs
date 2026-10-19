// Gets the demo sitter ready, once: checks its key, funds its account from Studio's faucet, and deposits
// credit for report fees on the contract, so the site's server can accept and report from the first
// booking. Run it by hand after the contract is deployed; nothing in the build runs it.
//
//   REGISTER=0x... DEMO_SITTER_KEY=0x... node tools/open-demo-sitter.mjs
//   DRY=1 DEMO_SITTER_KEY=0x... node tools/open-demo-sitter.mjs        # check the key and print what would be sent
//
// The key is a throwaway Studio test key, the same one the site's server holds in DEMO_SITTER_KEY; it is
// read from the environment only and never printed. Each transaction is followed to a final status.
// Needs Node 22.18 or later (it reads lib/*.ts directly).

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

import { cleanKey, keyProblem } from "../lib/demo-key.ts";
import { DEMO_PLANS } from "../lib/demo-sitter.ts";
import { REPORT_FEE, instructionsJson, instructionsOf, reportProblem } from "../lib/rules.ts";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const studio = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };

const REGISTER = (process.env.REGISTER || "").trim();
const DRY = process.env.DRY === "1";
/** The credit the demo sitter keeps: 50 report fees. */
const CREDIT = REPORT_FEE * 50n;

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const problem = keyProblem(process.env.DEMO_SITTER_KEY);
if (problem) fail(`DEMO_SITTER_KEY: ${problem}.`);
if (!DRY && !/^0x[0-9a-fA-F]{40}$/.test(REGISTER)) fail("REGISTER must be the deployed contract's 0x address.");

// Every demo plan and every fixed report must be one the contract takes.
for (const plan of DEMO_PLANS) {
  const why = instructionsOf(instructionsJson(plan.instructions)).problem;
  if (why) fail(`The ${plan.title} plan would be refused: ${why}.`);
  for (const s of plan.scripts) if (reportProblem(s.text)) fail(`The ${plan.title} "${s.label}" report would be refused: ${reportProblem(s.text)}.`);
}

const account = createAccount(cleanKey(process.env.DEMO_SITTER_KEY));
console.log(`the key is usable; the demo sitter is ${account.address}`);
console.log(`the ${DEMO_PLANS.length} demo care plans and their ${DEMO_PLANS.length * 4} fixed reports are inside the contract's limits`);
if (DRY) {
  console.log(`DRY RUN: would fund ${account.address} from the faucet when it holds under 1 GEN, then deposit(${CREDIT} atto) to ${REGISTER || "<REGISTER>"} when its credit is under 10 reports.`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) {
        await sleep(res.status === 429 || body.error.code === -32029 ? 20_000 : 5000);
        continue;
      }
      return body.result;
    } catch {
      await sleep(4000);
    }
  }
  throw new Error(`${method} did not answer`);
}

async function follow(hash) {
  for (let i = 0; i < 300; i++) {
    await sleep(4000);
    const tx = await rpc("eth_getTransactionByHash", [hash]);
    const status = String(tx?.status ?? "");
    if (status === "FINALIZED" || status === "CANCELED" || status === "UNDETERMINED") {
      const lr = tx.consensus_data?.leader_receipt;
      const one = Array.isArray(lr) ? lr[0] : lr;
      let text = "";
      try {
        text = Buffer.from(one?.result ?? "", "base64").toString("utf8");
      } catch {
        text = "";
      }
      return { status, text };
    }
  }
  return { status: "TIMEOUT", text: "" };
}

const client = createClient({ chain: studio, account });
const balance = async () => BigInt((await rpc("eth_getBalance", [account.address, "latest"])) || "0x0");
const have = await balance();
if (have < 10n ** 18n) {
  await rpc("sim_fundAccount", { account_address: getAddress(account.address), amount: 20e18 });
  for (let i = 0; i < 20 && (await balance()) <= have; i++) await sleep(3000);
}
console.log(`balance ${(await balance()).toString()} atto`);

let credit = 0n;
for (let i = 0; i < 8; i++) {
  try {
    const raw = await client.readContract({ address: REGISTER, functionName: "credit", args: [account.address.toLowerCase()] });
    credit = BigInt(JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)).credit);
    break;
  } catch {
    await sleep(5000);
  }
}
if (credit >= REPORT_FEE * 10n) {
  console.log(`SKIP  deposit: the demo sitter's credit already holds ${credit / REPORT_FEE} report fees.`);
  process.exit(0);
}
const hash = await client.writeContract({ address: REGISTER, functionName: "deposit", args: [], value: CREDIT });
const done = await follow(hash);
console.log(`${done.status === "FINALIZED" && done.text.includes('"ok": true') ? "OK  " : "FAIL"}  deposit ${CREDIT} atto  ${EXPLORER}/tx/${hash}`);
console.log("\nSet DEMO_SITTER_KEY on the host and check GET /api/demo/status.");
