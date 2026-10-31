import { refresh } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/refresh — a remembered sign-in, back to tier two. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(refresh({ refreshToken: body.refreshToken, deviceId: body.deviceId }));
}
