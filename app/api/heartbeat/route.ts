import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";
import { getPhaseFromElapsedDays, generateNotificationsForElapsedDays } from "@/lib/state/heartbeatMachine";

// GET /api/heartbeat - Current safety state, honouring the user's settings
export async function GET() {
  // No scheduler here, so an expired hold is closed out the next time anyone
  // looks. Doing it before reading settings means the credit is already
  // applied to what we report.
  db.settleVacationIfExpired();

  const { checkInCycleDays, vacationUntil } = db.getSettings();
  const onVacation = db.isOnVacation();

  // A vacation hold freezes the clock: the user keeps the elapsed days they
  // had, but escalation does not advance and no reminders are generated.
  const elapsedDays = db.simulatedElapsedDays;
  const phaseInfo = getPhaseFromElapsedDays(onVacation ? 0 : elapsedDays, checkInCycleDays);
  const notifications = onVacation ? [] : generateNotificationsForElapsedDays(elapsedDays);

  return NextResponse.json({
    success: true,
    lastCheckInDate: db.lastCheckInDate,
    simulatedElapsedDays: elapsedDays,
    phaseInfo,
    notifications,
    onVacation,
    vacationUntil,
    checkInCycleDays,
  });
}

// POST /api/heartbeat - Record a check-in ("I am safe and well")
export async function POST() {
  const previousDays = db.simulatedElapsedDays;
  const { checkInCycleDays } = db.getSettings();

  db.simulatedElapsedDays = 0;
  db.lastCheckInDate = new Date().toISOString();

  db.logAudit(
    "Heartbeat Check-In Recorded",
    "Heartbeat",
    `User reset the safety timer from Day ${previousDays} back to Day 0. ${checkInCycleDays}-day cycle restarted.`
  );

  return NextResponse.json({
    success: true,
    message: "Check-in recorded. Your safety timer has restarted.",
    lastCheckInDate: db.lastCheckInDate,
    simulatedElapsedDays: 0,
    phaseInfo: getPhaseFromElapsedDays(0, checkInCycleDays),
    checkInCycleDays,
  });
}
