/**
 * Apple Push Notification service, with a provider token (.p8 key).
 *
 *   APNS_KEY_P8     the key's contents (PEM)
 *   APNS_KEY_ID     its id, from the Apple Developer portal
 *   APNS_TEAM_ID    the team id
 *   APNS_TOPIC      the app's bundle id (com.virasat.app)
 *   APNS_SANDBOX    "1" for development builds
 *
 * APNs speaks only HTTP/2. The provider token is an ES256 JWT, reused for up
 * to 50 minutes (Apple refuses one older than an hour, and one renewed more
 * often than every 20 minutes).
 */

import { connect, constants, type ClientHttp2Session } from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
import type { PushDriver, PushMessage, PushResult } from "../types";

export interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  topic: string;
  sandbox: boolean;
}

export function apnsConfigFromEnv(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const { APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC } = env;
  if (!APNS_KEY_P8 || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_TOPIC) return null;
  return {
    keyP8: APNS_KEY_P8.replace(/\\n/g, "\n"),
    keyId: APNS_KEY_ID,
    teamId: APNS_TEAM_ID,
    topic: APNS_TOPIC,
    sandbox: env.APNS_SANDBOX === "1",
  };
}

/** One request to APNs. Swapped in tests. */
export type ApnsTransport = (args: {
  origin: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; body: string }>;

export const http2Transport: ApnsTransport = ({ origin, path, headers, body }) =>
  new Promise((resolve, reject) => {
    const client: ClientHttp2Session = connect(origin);
    client.on("error", reject);
    const req = client.request({ [constants.HTTP2_HEADER_METHOD]: "POST", [constants.HTTP2_HEADER_PATH]: path, ...headers });
    let status = 0;
    let data = "";
    req.setEncoding("utf8");
    req.on("response", (h) => (status = Number(h[constants.HTTP2_HEADER_STATUS])));
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      client.close();
      resolve({ status, body: data });
    });
    req.on("error", (err) => {
      client.close();
      reject(err);
    });
    req.end(body);
  });

const TOKEN_LIFETIME_S = 50 * 60;

export function createApnsDriver(
  config: ApnsConfig,
  transport: ApnsTransport = http2Transport,
  now: () => number = () => Math.floor(Date.now() / 1000)
): PushDriver {
  let cached: { jwt: string; issuedAt: number } | null = null;
  const providerToken = async () => {
    const t = now();
    if (cached && t - cached.issuedAt < TOKEN_LIFETIME_S) return cached.jwt;
    const key = await importPKCS8(config.keyP8, "ES256");
    const jwt = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: config.keyId }).setIssuer(config.teamId).setIssuedAt(t).sign(key);
    cached = { jwt, issuedAt: t };
    return jwt;
  };

  return {
    name: "apns",
    async send(message: PushMessage): Promise<PushResult> {
      try {
        const res = await transport({
          origin: config.sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com",
          path: `/3/device/${encodeURIComponent(message.token)}`,
          headers: {
            authorization: `bearer ${await providerToken()}`,
            "apns-topic": config.topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
          },
          body: JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: "default" }, ...message.data }),
        });
        if (res.status === 200) return { ok: true };
        const reason = (() => {
          try {
            return (JSON.parse(res.body) as { reason?: string }).reason ?? `HTTP ${res.status}`;
          } catch {
            return `HTTP ${res.status}`;
          }
        })();
        // 410: the app was removed. BadDeviceToken: a token from the other
        // environment, or not a token at all. Neither will ever work.
        const gone = res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered";
        if (reason === "ExpiredProviderToken") cached = null;
        return { ok: false, error: `APNs: ${reason}`, gone };
      } catch (err) {
        return { ok: false, error: `APNs unreachable: ${(err as Error).message}` };
      }
    },
  };
}
