/**
 * Virasat - The one place a route learns who is calling.
 *
 * Every route under app/api/ either calls `requireSession` first, or is on
 * the public allow-list below. `e2e/auth.spec.ts` walks the route tree and
 * fails if a route is neither, so a new route cannot quietly ship open.
 */

import { NextResponse } from "next/server";
import { sessionForToken, stageOf, userFor, type Outcome, type Stage } from "./flows";
import type { SessionRecord, UserRecord } from "./types";
import { vaultFor, type MockZeroKnowledgeDatabase } from "../state/mockDatabase";

/**
 * Routes that answer without a session, and why. Paths are relative to
 * /api. Anything not listed here must call `requireSession`.
 */
export const PUBLIC_ROUTES: Record<string, string> = {
  "auth/prelogin": "Before sign-in there is no session.",
  "auth/signup/start": "Before sign-up there is no session.",
  "auth/signup/verify": "Before sign-up there is no session.",
  "auth/signup/complete": "Carries its own single-use sign-up ticket.",
  "auth/login": "Tier one itself.",
  "auth/social/nonce": "Before sign-in there is no session.",
  "auth/social": "Tier one itself, verified against the provider.",
  "auth/refresh": "Carries its own single-use refresh token.",
  "auth/recovery/device/start": "The user has forgotten their password.",
  "auth/recovery/kit/start": "The user has forgotten their password.",
  "auth/recovery/kit/status": "Carries its own recovery token.",
  "auth/recovery/kit/complete": "Carries its own recovery token.",
  "auth/recovery/kit/cancel": "The Owner's veto, by emailed link. Can only delay.",
  "trusted-friends/accept": "Opened by someone who is not a Virasat user; carries its own token.",
  "billing/webhook": "Called by the payment provider; verified by its signature.",
  "test/reset": "Test harness only; 404 unless VIRASAT_E2E=1.",
  "test/codes": "Test harness only; 404 unless VIRASAT_E2E=1.",
  "test/clock": "Test harness only; 404 unless VIRASAT_E2E=1.",
};

export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export interface Caller {
  session: SessionRecord;
  user: UserRecord;
  vault: MockZeroKnowledgeDatabase;
}

/**
 * Resolves the caller, or returns the response to send instead.
 *
 * `stage` defaults to "full": almost every route is for a signed-in, unlocked
 * Owner. The sign-in routes themselves accept "pending" or "reset".
 */
export function requireSession(
  req: Request,
  stage: Stage | Stage[] = "full"
): Caller | NextResponse {
  const session = sessionForToken(bearer(req));
  const user = session ? userFor(session) : null;
  if (!session || !user) {
    return NextResponse.json(
      { success: false, error: "Please sign in.", code: "unauthenticated" },
      { status: 401 }
    );
  }
  const allowed = Array.isArray(stage) ? stage : [stage];
  if (!allowed.includes(stageOf(session))) {
    return NextResponse.json(
      {
        success: false,
        error: "Please finish unlocking Virasat first.",
        code: "locked",
        needs: session.needs,
      },
      { status: 403 }
    );
  }
  return { session, user, vault: vaultFor(user.id) };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** Turns a flow outcome into the route's JSON answer. */
export function respond<T>(outcome: Outcome<T>): NextResponse {
  if (outcome.ok) return NextResponse.json({ success: true, ...(outcome.data as object) });
  return NextResponse.json(
    { success: false, error: outcome.error, ...(outcome.detail ?? {}) },
    { status: outcome.status }
  );
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
