import { completeKitRecovery } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/recovery/kit/complete — after the hold, the way back in. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(completeKitRecovery(body.recoveryToken));
}
