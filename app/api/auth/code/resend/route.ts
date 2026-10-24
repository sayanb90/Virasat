import { resendSessionCode } from "@/lib/auth/flows";
import { isResponse, requireSession, respond } from "@/lib/auth/http";
import { limitByAddress } from "@/lib/auth/rateLimit";

/** POST /api/auth/code/resend — sends the code again. */
export async function POST(req: Request) {
  const limited = limitByAddress(req, "code");
  if (limited) return limited;
  const caller = requireSession(req, "pending");
  if (isResponse(caller)) return caller;
  return respond(await resendSessionCode(caller.session));
}
