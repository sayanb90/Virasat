import { login } from "@/lib/auth/flows";
import { readJson, respond } from "@/lib/auth/http";

/** POST /api/auth/login — tier one by password. Answers with a pending session. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(
    await login({
      email: body.email,
      authKeyHex: body.authKeyHex,
      deviceId: body.deviceId,
      linkTicket: body.linkTicket,
    })
  );
}
