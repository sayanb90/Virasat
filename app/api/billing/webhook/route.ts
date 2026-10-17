import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/billing";
import { db } from "@/lib/state/mockDatabase";

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

  db.logAudit(
    "Billing Event Received",
    "ZeroKnowledgeSync",
    `Verified "${outcome.event.type}"` +
      (outcome.event.reference ? ` for ${outcome.event.reference}` : "") +
      (outcome.event.failureReason ? ` (${outcome.event.failureReason})` : "")
  );

  return NextResponse.json({ success: true, type: outcome.event.type });
}
