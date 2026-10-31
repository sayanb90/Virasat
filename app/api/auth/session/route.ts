import { NextResponse } from "next/server";
import { describeSession } from "@/lib/auth/flows";
import { isResponse, requireSession } from "@/lib/auth/http";

/** GET /api/auth/session — who is signed in, and what is still needed. */
export async function GET(req: Request) {
  const caller = requireSession(req, ["pending", "full", "reset"]);
  if (isResponse(caller)) return caller;
  return NextResponse.json({ success: true, ...describeSession(caller.session) });
}
