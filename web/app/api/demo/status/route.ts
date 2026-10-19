// GET /api/demo/status: whether the demo sitter can act now, its public address, how many report fees its
// credit holds, and exactly why not when it cannot: "no key set", "the key set is not a 0x private key of
// 64 hex characters", "the contract is not deployed yet", Studio's RPC not answering, no GEN on its
// account, or its report credit being topped up. The key itself is never echoed.

import { demoStatusNow } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A balance read (perhaps a faucet payment), a credit read and perhaps a deposit, retried while Studio is slow.
export const maxDuration = 60;

export async function GET() {
  return Response.json(await demoStatusNow(), { headers: { "cache-control": "no-store" } });
}
