import { proveDevice } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** POST /api/auth/device/prove — tier two by Face ID / Touch ID or PIN. */
export async function POST(req: Request) {
  const caller = requireSession(req, "pending");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(
    proveDevice(caller.session, { method: body.method, signature: body.signature, pin: body.pin })
  );
}
