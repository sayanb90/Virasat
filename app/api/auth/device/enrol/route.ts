import { enrolDevice } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/device/enrol — registers this phone for Face ID and PIN. */
export async function POST(req: Request) {
  const caller = requireSession(req, "full");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(
    await enrolDevice(caller.session, {
      name: body.name,
      platform: body.platform,
      signingPublicKey: body.signingPublicKey,
      biometricPublicKey: body.biometricPublicKey,
      pin: body.pin,
      replacesDeviceId: body.replacesDeviceId,
    })
  );
}
