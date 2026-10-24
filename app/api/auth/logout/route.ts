import { NextResponse } from "next/server";
import { logout } from "@/lib/auth/flows";
import { isResponse, requireSession } from "@/lib/auth/http";

/** POST /api/auth/logout — ends this sign-in on this phone. */
export async function POST(req: Request) {
  const caller = requireSession(req, ["pending", "full", "reset"]);
  if (isResponse(caller)) return caller;
  logout(caller.session);
  return NextResponse.json({ success: true });
}
