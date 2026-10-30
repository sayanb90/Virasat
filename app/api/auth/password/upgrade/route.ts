import { upgradeKdf } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";
import { limitByAddress } from "@/lib/auth/rateLimit";

/** POST /api/auth/password/upgrade — the same password, moved to Argon2id after sign-in. */
export async function POST(req: Request) {
  const limited = limitByAddress(req, "login");
  if (limited) return limited;
  const caller = requireSession(req, "full");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(
    upgradeKdf(caller.session, {
      currentAuthKeyHex: body.currentAuthKeyHex,
      kdf: body.kdf,
      authKeyHex: body.authKeyHex,
      wrappedVaultKey: body.wrappedVaultKey,
    })
  );
}
