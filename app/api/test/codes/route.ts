import { NextResponse } from "next/server";
import { authStore } from "@/lib/auth/store";

/**
 * GET /api/test/codes?email= — the last code, and the last recovery cancel
 * link, emailed to an address.
 *
 * Tests cannot read an inbox. 404 unless VIRASAT_E2E=1, like /api/test/reset.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.VIRASAT_E2E !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const email = (new URL(req.url).searchParams.get("email") ?? "").toLowerCase();
  const code = authStore.lastCodesForTesting.get(email) ?? null;
  const cancelToken = authStore.lastCancelTokensForTesting.get(email) ?? null;
  return NextResponse.json({ success: true, code, cancelToken });
}
