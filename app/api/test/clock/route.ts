import { NextResponse } from "next/server";
import { advanceClockForTesting } from "@/lib/auth/clock";

/**
 * POST /api/test/clock — moves sign-in time forward, so the 72-hour recovery
 * hold can be tested without waiting. 404 unless VIRASAT_E2E=1.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.VIRASAT_E2E !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const ms = Number(body.advanceMs ?? 0);
  if (!Number.isFinite(ms) || ms < 0) {
    return NextResponse.json({ success: false, error: "advanceMs must be positive." }, { status: 400 });
  }
  advanceClockForTesting(ms);
  return NextResponse.json({ success: true });
}
