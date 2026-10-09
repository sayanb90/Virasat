import { NextResponse } from "next/server";

/**
 * Notes left to this user by someone who named them as Beneficiary.
 *
 * Returning an empty list is the honest answer today: releases happen between
 * two different accounts, and this build has a single-user in-memory store
 * with no cross-account delivery. The route exists so the screen reads real
 * state rather than a hard-coded placeholder, and so wiring a real backend
 * later changes nothing above it.
 */
export async function GET() {
  return NextResponse.json({ success: true, notes: [], releasesPending: 0 });
}
