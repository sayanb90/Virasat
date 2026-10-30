import { resetPassword } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/password/reset — the new password, after either recovery path. */
export async function POST(req: Request) {
  const caller = requireSession(req, "reset");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(
    await resetPassword(caller.session, {
      kdf: body.kdf,
      authKeyHex: body.authKeyHex,
      wrappedVaultKey: body.wrappedVaultKey,
      recovery: (body.recovery as { wrappedVaultKey: unknown; verifierHex: unknown } | null) ?? null,
    })
  );
}
