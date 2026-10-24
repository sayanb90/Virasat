import { startSignup } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/signup/start — emails a code to confirm the address. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(await startSignup(body.email));
}
