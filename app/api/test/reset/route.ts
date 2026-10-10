import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";

/**
 * Resets the in-memory store so end-to-end specs do not leak state into one
 * another.
 *
 * This exists only for tests and is unreachable unless VIRASAT_E2E=1 is set
 * in the environment, which only the Playwright config does. Any other
 * deployment gets a 404 — the route may as well not be there.
 */
export const dynamic = "force-dynamic";

function enabled(): boolean {
  return process.env.VIRASAT_E2E === "1";
}

export async function POST() {
  if (!enabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  db.resetForTesting();
  return NextResponse.json({ success: true });
}

export async function GET() {
  if (!enabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, enabled: true });
}
