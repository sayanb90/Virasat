import { extend } from "@/lib/auth/flows";
import { isResponse, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/extend — keeps an unlocked session alive while in use. */
export async function POST(req: Request) {
  const caller = requireSession(req, "full");
  if (isResponse(caller)) return caller;
  return respond(extend(caller.session));
}
