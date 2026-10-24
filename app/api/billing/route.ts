import { NextResponse } from "next/server";
import { isResponse, requireSession } from "@/lib/auth/http";
import { billingStatus, listLedger } from "@/lib/billing";

/**
 * GET /api/billing - how billing is configured, and what has been processed.
 *
 * Reports shape only: `ready` says whether credentials are present, never
 * what they are.
 */
export async function GET(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  return NextResponse.json({ success: true, status: billingStatus(), ledger: listLedger() });
}
