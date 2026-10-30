import { recoveryStatus } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/recovery/kit/status — waiting, ready, or cancelled. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(recoveryStatus(body.recoveryToken));
}
