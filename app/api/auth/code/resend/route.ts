import { resendSessionCode } from "@/lib/auth/flows";
import { isResponse, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/code/resend — sends the code again. */
export async function POST(req: Request) {
  const caller = requireSession(req, "pending");
  if (isResponse(caller)) return caller;
  return respond(await resendSessionCode(caller.session));
}
