import { NextResponse } from "next/server";
import { socialNonce } from "@/lib/auth/flows";
import { limitByAddress } from "@/lib/auth/rateLimit";

/** POST /api/auth/social/nonce — a one-time value the provider's token must echo. */
export async function POST(req: Request) {
  const limited = limitByAddress(req, "social");
  if (limited) return limited;
  return NextResponse.json({ success: true, ...socialNonce() });
}
