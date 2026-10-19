// POST /api/demo/report {booking, script, day?}: the demo sitter files ONE report from the fixed list of
// the booking's demo care plan: "all" (every instruction done), "one" (one missed), "vague" (names none,
// so it reads unclear) or "two" (two missed). The script is a key into that list; the plan is the one
// whose instructions the booking carries word for word (lib/demo-sitter.ts), and any other booking is
// refused. The report goes on `day` when given, else on the day running now, else on the earliest day
// still open for a report. No text from the visitor is ever signed. One call at a time per booking,
// rate-limited; answers the transaction hash and the day, or why not. Nothing here ever logs or returns
// the key.

import { SCRIPT_KEYS } from "@/lib/demo-sitter";
import { sendDemoReport } from "@/lib/demo-server";
import { MAX_DAYS, parseBookingId } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Three reads (retried while Studio is slow), perhaps a faucet payment, and one signature.
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let id = "";
  let script = "";
  let day = 0;
  let bad = false;
  try {
    const text = await request.text();
    if (text.length > 200) throw new Error("too long");
    const body = JSON.parse(text) as { booking?: unknown; script?: unknown; day?: unknown };
    id = typeof body.booking === "string" ? parseBookingId(body.booking) : "";
    script = typeof body.script === "string" && (SCRIPT_KEYS as string[]).includes(body.script) ? body.script : "";
    if (body.day !== undefined) {
      day = typeof body.day === "number" && Number.isInteger(body.day) && body.day >= 1 && body.day <= MAX_DAYS ? body.day : 0;
      bad = day === 0;
    }
  } catch {
    id = "";
  }
  if (!id || !script || bad)
    return Response.json({ ok: false, reason: `send {"booking": "B1", "script": one of ${SCRIPT_KEYS.join(", ")}}, and "day" 1 to ${MAX_DAYS} if you name one` }, { status: 400, headers: noStore });
  const answer = await sendDemoReport(id, script, day);
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
