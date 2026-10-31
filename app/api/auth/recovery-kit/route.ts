import { setRecoveryKit } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** PUT /api/auth/recovery-kit — saves a new Recovery Kit, replacing any old one. */
export async function PUT(req: Request) {
  const caller = requireSession(req, "full");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(
    setRecoveryKit(caller.session, {
      wrappedVaultKey: body.wrappedVaultKey,
      verifierHex: body.verifierHex,
    })
  );
}
