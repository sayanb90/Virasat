import { listDevices, removeDevice } from "@/lib/auth/flows";
import { isResponse, readJson, requireSession, respond } from "@/lib/auth/http";

/** GET /api/auth/devices — the phones signed in to this account. */
export async function GET(req: Request) {
  const caller = requireSession(req, "full");
  if (isResponse(caller)) return caller;
  return respond(listDevices(caller.session));
}

/** DELETE /api/auth/devices — removes another phone: { deviceId }. */
export async function DELETE(req: Request) {
  const caller = requireSession(req, "full");
  if (isResponse(caller)) return caller;
  const body = await readJson(req);
  return respond(removeDevice(caller.session, body.deviceId));
}
