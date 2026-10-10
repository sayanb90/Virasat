import { NextResponse } from "next/server";
import { listOutbox, mailerStatus } from "@/lib/email";

/**
 * GET /api/email - how email is configured, and what has been sent.
 *
 * Deliberately reports configuration *shape* and never a key: `ready` says
 * whether a key is present, not what it is.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    status: mailerStatus(),
    outbox: listOutbox(),
  });
}
