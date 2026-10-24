import { startDeviceReset } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/recovery/device/start — forgot password, on a phone already set up. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(await startDeviceReset({ email: body.email, deviceId: body.deviceId }));
}
