import { NextResponse } from "next/server";
import { billingStatus, listLedger } from "@/lib/billing";

/**
 * GET /api/billing - how billing is configured, and what has been processed.
 *
 * Reports shape only: `ready` says whether credentials are present, never
 * what they are.
 */
export async function GET() {
  return NextResponse.json({ success: true, status: billingStatus(), ledger: listLedger() });
}
