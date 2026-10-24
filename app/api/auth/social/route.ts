import { socialSignIn } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/social — tier one by Apple, Google or Facebook. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(
    await socialSignIn({
      provider: body.provider,
      token: body.token,
      nonce: body.nonce,
      deviceId: body.deviceId,
      name: body.name,
    })
  );
}
