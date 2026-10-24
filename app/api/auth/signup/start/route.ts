import { startSignup } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";
import { limitByAddress } from "@/lib/auth/rateLimit";

/** POST /api/auth/signup/start — emails a code to confirm the address. */
export async function POST(req: Request) {
  const limited = limitByAddress(req, "signup");
  if (limited) return limited;
  const body = await readJson(req);
  return respond(await startSignup(body.email));
}
