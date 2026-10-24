import { NextResponse } from "next/server";
import { isResponse, requireSession } from "@/lib/auth/http";
import { getPhaseFromElapsedDays, generateNotificationsForElapsedDays } from "@/lib/state/heartbeatMachine";
import { dispatchDueEmails } from "@/lib/email/dispatch";

// GET /api/heartbeat - Current safety state, honouring the user's settings
export async function GET(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  const db = caller.vault;
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
  const notifications = onVacation
    ? []
    : generateNotificationsForElapsedDays(elapsedDays, checkInCycleDays);

  // There is no scheduler in this build, so a read is also the trigger. The
  // dispatcher is idempotent and never throws, so this cannot send twice and
  // cannot stop a user from telling us they are alive.
  const emails = await dispatchDueEmails(db, { name: caller.user.name, email: caller.user.email });

  return NextResponse.json({
    success: true,
    lastCheckInDate: db.lastCheckInDate,
    simulatedElapsedDays: elapsedDays,
    phaseInfo,
    notifications,
    onVacation,
    vacationUntil,
    checkInCycleDays,
    emails,
  });
}

// POST /api/heartbeat - Record a check-in ("I am safe and well")
export async function POST(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  const db = caller.vault;
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
