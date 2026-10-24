import { cancelRecovery, cancelRecoveryForUser, sessionForToken } from "@/lib/auth/flows";
import { bearer, readJson, respond } from "@/lib/auth/http";

/**
 * POST /api/auth/recovery/kit/cancel — the Owner's veto.
 *
 * From the emailed link (carrying its cancel token), or from the app by a
 * signed-in Owner. Cancelling can only ever delay a recovery, so the link is
 * enough on its own.
 */
export async function POST(req: Request) {
  const session = sessionForToken(bearer(req));
  if (session) return respond(cancelRecoveryForUser(session));
  const body = await readJson(req);
  return respond(cancelRecovery(body.cancelToken));
}
