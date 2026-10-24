import { NextResponse } from "next/server";
import { socialNonce } from "@/lib/auth/flows";

/** POST /api/auth/social/nonce — a one-time value the provider's token must echo. */
export async function POST() {
  return NextResponse.json({ success: true, ...socialNonce() });
}
