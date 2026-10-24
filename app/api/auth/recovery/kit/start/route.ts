import { startKitRecovery } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/recovery/kit/start — forgot password and lost phone: an email code first. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(await startKitRecovery(body.email));
}
