import { beginKitRecovery } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/recovery/kit/begin — checks the kit and starts the 72-hour hold. */
export async function POST(req: Request) {
  const caller = requireSession(req, "reset");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(await beginKitRecovery(caller.session, body.verifierHex));
}
