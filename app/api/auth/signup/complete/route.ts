import { completeSignup } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/**
 * POST /api/auth/signup/complete — creates the account.
 *
 * Receives the login proof K_auth and the vault key wrapped on the device.
 * Never the password, never K_vault.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(
    await completeSignup({
      signupTicket: body.signupTicket,
      name: body.name,
      kdf: body.kdf,
      authKeyHex: body.authKeyHex,
      wrappedVaultKey: body.wrappedVaultKey,
      recovery: (body.recovery as { wrappedVaultKey: unknown; verifierHex: unknown } | null) ?? null,
    })
  );
}
