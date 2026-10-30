import { NextResponse } from "next/server";
import { isResponse, requireSession } from "@/lib/auth/http";
import { listOutbox, mailerStatus } from "@/lib/email";

/**
 * GET /api/email - how email is configured, and what has been sent.
 *
 * Deliberately reports configuration *shape* and never a key: `ready` says
 * whether a key is present, not what it is.
 *
 * The outbox spans every account (who was written to, and about what), so it
 * is only listed to the test harness (VIRASAT_E2E=1). A signed-in Owner sees
 * the configuration and nothing of anyone else's mail.
 */
export async function GET(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  return NextResponse.json({
    success: true,
    status: mailerStatus(),
    ...(process.env.VIRASAT_E2E === "1" ? { outbox: listOutbox() } : {}),
  });
}
