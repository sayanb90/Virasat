import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";
import { getPhaseFromElapsedDays, generateNotificationsForElapsedDays } from "@/lib/state/heartbeatMachine";

// POST /api/scheduler - Time Machine Simulator Endpoint
export async function POST(req: Request) {
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

    const phaseInfo = getPhaseFromElapsedDays(newElapsedDays);
    const notifications = generateNotificationsForElapsedDays(newElapsedDays);

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
