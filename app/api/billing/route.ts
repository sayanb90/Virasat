import { NextResponse } from "next/server";
import { isResponse, requireSession } from "@/lib/auth/http";
import { billingStatus, listLedger } from "@/lib/billing";

/**
 * GET /api/billing - how billing is configured, and what has been processed.
 *
 * Reports shape only: `ready` says whether credentials are present, never
 * what they are.
 *
 * The ledger holds every account's payment events, so it is only listed to
 * the test harness (VIRASAT_E2E=1), like the email outbox.
 */
export async function GET(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  return NextResponse.json({
    success: true,
    status: billingStatus(),
    ...(process.env.VIRASAT_E2E === "1" ? { ledger: listLedger() } : {}),
  });
}
