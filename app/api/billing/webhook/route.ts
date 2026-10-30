import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/billing";

/**
 * POST /api/billing/webhook
 *
 * The only thing allowed to change what someone has paid for. A browser
 * saying "payment succeeded" is a claim; this is the fact.
 *
 * Two details that are easy to get wrong and expensive to debug:
 *
 * - The RAW body is read with req.text(). Parsing and re-serialising
 *   produces different bytes from what the provider signed, so the
 *   signature would never verify.
 * - A failure we could not process returns 5xx, not 200, so the provider
 *   retries. Only a bad signature is 401, because retrying that is pointless.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const outcome = handleWebhook(rawBody, req.headers);

  if (!outcome.ok) {
    return NextResponse.json({ success: false, error: outcome.error }, { status: outcome.status });
  }

  if (outcome.replayed) {
    // Already applied. Acknowledge so the provider stops retrying.
    return NextResponse.json({ success: true, replayed: true });
  }

  // The ledger has recorded it. Nothing is written to an account's security
  // log yet: events are not tied to accounts until entitlement lands (see
  // lib/billing/index.ts), and with real accounts there is no single log to
  // write to.

  return NextResponse.json({ success: true, type: outcome.event.type });
}
