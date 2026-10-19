// POST /api/demo/accept {booking}: the demo sitter accepts a booking made to it with one of the three demo
// care plans word for word, before its first day starts. Any other booking is refused. Rate-limited per
// booking and in total, one signature at a time; answers the transaction hash or why not. Nothing here
// ever logs or returns the key.

import { sendDemoAccept } from "@/lib/demo-server";
import { parseBookingId } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two reads (retried while Studio is slow), perhaps a faucet payment, and one signature.
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let id = "";
  try {
    const text = await request.text();
    if (text.length > 200) throw new Error("too long");
    const body = JSON.parse(text) as { booking?: unknown };
    id = typeof body.booking === "string" ? parseBookingId(body.booking) : "";
  } catch {
    id = "";
  }
  if (!id) return Response.json({ ok: false, reason: 'send {"booking": "B1"}' }, { status: 400, headers: noStore });
  const answer = await sendDemoAccept(id);
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
