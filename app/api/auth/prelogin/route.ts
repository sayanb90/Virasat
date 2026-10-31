import { prelogin } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";
import { limitByAddress } from "@/lib/auth/rateLimit";

/** POST /api/auth/prelogin — the salt and cost for this email's password. */
export async function POST(req: Request) {
  const limited = limitByAddress(req, "prelogin");
  if (limited) return limited;
  const body = await readJson(req);
  return respond(prelogin(body.email));
}
