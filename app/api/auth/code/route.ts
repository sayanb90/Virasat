import { verifySessionCode } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/code — tier two by email code (a new phone, or a recovery). */
export async function POST(req: Request) {
  const caller = requireSession(req, "pending");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(verifySessionCode(caller.session, body.code));
}
