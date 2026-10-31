import { registerPushToken } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** POST /api/push/register — this phone's push token: { token }. */
export async function POST(req: Request) {
  const caller = requireSession(req, "full");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(registerPushToken(caller.session, body.token));
}
