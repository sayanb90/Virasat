import { NextResponse } from "next/server";
import { isResponse, requireSession } from "@/lib/auth/http";

// GET /api/audit - Fetch audit logs
export async function GET(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  const db = caller.vault;
  const logs = db.getAuditLogs();
  return NextResponse.json({
    success: true,
    logs,
  });
}
