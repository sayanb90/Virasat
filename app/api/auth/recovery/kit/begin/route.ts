import { beginKitRecovery } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";
import { limitByAddress } from "@/lib/auth/rateLimit";

/** POST /api/auth/recovery/kit/begin — checks the kit and starts the 72-hour hold. */
export async function POST(req: Request) {
  const limited = limitByAddress(req, "recovery");
  if (limited) return limited;
  const caller = requireSession(req, "reset");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(await beginKitRecovery(caller.session, body.verifierHex));
}
