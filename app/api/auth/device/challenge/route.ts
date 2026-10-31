import { deviceChallenge } from "@/lib/auth/flows";
import { isResponse, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/device/challenge — something for the phone to sign. */
export async function POST(req: Request) {
  const caller = requireSession(req, "pending");
  if (isResponse(caller)) return caller;
  return respond(deviceChallenge(caller.session));
}
