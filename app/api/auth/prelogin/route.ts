import { prelogin } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/prelogin — the salt and cost for this email's password. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(prelogin(body.email));
}
