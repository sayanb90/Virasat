import { verifySignupCode } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/signup/verify — checks the code, returns a sign-up ticket. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(
    verifySignupCode({ email: body.email, code: body.code, socialTicket: body.socialTicket })
  );
}
