import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";
import { CYCLE_OPTIONS, MAX_VACATION_DAYS, VACATION_PRESETS } from "@/lib/state/heartbeatMachine";

export async function GET() {
  return NextResponse.json({
    success: true,
    settings: db.getSettings(),
    onVacation: db.isOnVacation(),
    cycleOptions: CYCLE_OPTIONS,
    vacationPresets: VACATION_PRESETS,
    maxVacationDays: MAX_VACATION_DAYS,
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

    // Vacation is set as a number of days, and ended by passing null. The cap
    // is enforced here rather than only in the UI: a client-side limit is not
    // a limit, and an unbounded pause silently disables the whole product.
    if (body.vacationDays !== undefined) {
      if (body.vacationDays === null) {
        const settings = db.settleVacation();
        return NextResponse.json({ success: true, settings, onVacation: db.isOnVacation() });
      }

      const days = Number(body.vacationDays);
      if (!Number.isFinite(days) || days < 1) {
        return NextResponse.json(
          { success: false, error: "Please choose how long you will be away." },
          { status: 400 }
        );
      }
      if (days > MAX_VACATION_DAYS) {
        return NextResponse.json(
          {
            success: false,
            error: `Vacation mode can be set for at most ${MAX_VACATION_DAYS} days (6 months) at a time. You can extend it again when you are back.`,
          },
          { status: 400 }
        );
      }

      const until = new Date(Date.now() + days * 86_400_000);
      const settings = db.startVacation(until);
      return NextResponse.json({ success: true, settings, onVacation: db.isOnVacation() });
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
