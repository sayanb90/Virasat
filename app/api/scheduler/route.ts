import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";
import { getPhaseFromElapsedDays, generateNotificationsForElapsedDays } from "@/lib/state/heartbeatMachine";

/**
 * POST /api/scheduler - time machine, for tests only.
 *
 * This endpoint can advance the simulated clock past the end of the cycle,
 * which releases the vault to beneficiaries. Nothing in the UI calls it, so
 * leaving it reachable would hand any unauthenticated caller a remote
 * "release my vault now" button. Gated exactly like /api/test/reset: it 404s
 * unless VIRASAT_E2E=1, which only the Playwright config sets.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.VIRASAT_E2E !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { action, advanceDays, setToDay } = body;

    let newElapsedDays = db.simulatedElapsedDays;

    if (action === "advance") {
      newElapsedDays += advanceDays || 30;
    } else if (action === "set") {
      newElapsedDays = setToDay !== undefined ? setToDay : 0;
    } else if (action === "reset") {
      newElapsedDays = 0;
    }

    db.simulatedElapsedDays = newElapsedDays;

    // Report against the user's configured cycle, not the 365-day default.
    const { checkInCycleDays } = db.getSettings();
    const phaseInfo = getPhaseFromElapsedDays(newElapsedDays, checkInCycleDays);
    const notifications = generateNotificationsForElapsedDays(newElapsedDays, checkInCycleDays);

    db.logAudit(
      "Time Machine Simulator Triggered",
      "Escalation",
      `Fast-forwarded simulated time to Day ${newElapsedDays} (${phaseInfo.name}). ${notifications.length} escalation alerts generated.`
    );

    return NextResponse.json({
      success: true,
      simulatedElapsedDays: newElapsedDays,
      phaseInfo,
      notifications,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
