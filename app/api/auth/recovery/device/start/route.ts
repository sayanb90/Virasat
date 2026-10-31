import { startDeviceReset } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";
import { limitByAddress } from "@/lib/auth/rateLimit";

/** POST /api/auth/recovery/device/start — forgot password, on a phone already set up. */
export async function POST(req: Request) {
  const limited = limitByAddress(req, "recovery");
  if (limited) return limited;
  const body = await readJson(req);
  return respond(await startDeviceReset({ email: body.email, deviceId: body.deviceId }));
}
