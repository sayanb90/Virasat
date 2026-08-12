import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";
import { getPhaseFromElapsedDays, generateNotificationsForElapsedDays } from "@/lib/state/heartbeatMachine";

// GET /api/heartbeat - Get current heartbeat state & escalation phase
export async function GET() {
  const elapsedDays = db.simulatedElapsedDays;
  const phaseInfo = getPhaseFromElapsedDays(elapsedDays);
  const notifications = generateNotificationsForElapsedDays(elapsedDays);

  return NextResponse.json({
    success: true,
    lastCheckInDate: db.lastCheckInDate,
    simulatedElapsedDays: elapsedDays,
    phaseInfo,
    notifications,
  });
}

// POST /api/heartbeat - Record heartbeat check-in ("I am alive")
export async function POST() {
  const previousDays = db.simulatedElapsedDays;
  db.simulatedElapsedDays = 0;
  db.lastCheckInDate = new Date().toISOString();

  db.logAudit(
    "Heartbeat Check-In Recorded",
    "Heartbeat",
    `User reset heartbeat timer from Day ${previousDays} back to Day 0 (Silent Period). 1-year timer restarted.`
  );

  const phaseInfo = getPhaseFromElapsedDays(0);

  return NextResponse.json({
    success: true,
    message: "Heartbeat successfully recorded. 1-Year Silent Period restarted.",
    lastCheckInDate: db.lastCheckInDate,
    simulatedElapsedDays: 0,
    phaseInfo,
  });
}
