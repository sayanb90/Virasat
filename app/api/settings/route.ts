import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";
import { CYCLE_OPTIONS } from "@/lib/state/heartbeatMachine";

export async function GET() {
  return NextResponse.json({
    success: true,
    settings: db.getSettings(),
    onVacation: db.isOnVacation(),
    cycleOptions: CYCLE_OPTIONS,
  });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const patch: Record<string, unknown> = {};

    if (body.checkInCycleDays !== undefined) {
      const days = Number(body.checkInCycleDays);
      const allowed = CYCLE_OPTIONS.some((o) => o.days === days);
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: "That check-in interval is not one of the available options." },
          { status: 400 }
        );
      }
      patch.checkInCycleDays = days;
    }

    if (body.vacationUntil !== undefined) {
      if (body.vacationUntil === null) {
        patch.vacationUntil = null;
      } else {
        const when = new Date(body.vacationUntil);
        if (Number.isNaN(when.getTime())) {
          return NextResponse.json(
            { success: false, error: "That is not a valid date." },
            { status: 400 }
          );
        }
        patch.vacationUntil = when.toISOString();
      }
    }

    if (body.trustedFriendsEnabled !== undefined) {
      patch.trustedFriendsEnabled = Boolean(body.trustedFriendsEnabled);
    }

    const settings = db.updateSettings(patch);
    return NextResponse.json({ success: true, settings, onVacation: db.isOnVacation() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
