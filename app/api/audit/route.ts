import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";

// GET /api/audit - Fetch audit logs
export async function GET() {
  const logs = db.getAuditLogs();
  return NextResponse.json({
    success: true,
    logs,
  });
}
