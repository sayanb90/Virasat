/**
 * Firebase Cloud Messaging, HTTP v1, for Android.
 *
 *   FCM_SERVICE_ACCOUNT_JSON   the service account key file's contents
 *
 * Its private key signs an OAuth assertion, exchanged for an access token
 * that is reused until a minute before it expires.
 */

import { SignJWT, importPKCS8 } from "jose";
import type { PushDriver, PushMessage, PushResult } from "../types";

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export function fcmConfigFromEnv(env: Record<string, string | undefined> = process.env): FcmConfig | null {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as { project_id?: string; client_email?: string; private_key?: string };
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
  } catch {
    return null;
  }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export function createFcmDriver(
  config: FcmConfig,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
  now: () => number = () => Math.floor(Date.now() / 1000)
): PushDriver {
  let cached: { token: string; expiresAt: number } | null = null;

  const accessToken = async (): Promise<string> => {
    if (cached && cached.expiresAt - 60 > now()) return cached.token;
    const key = await importPKCS8(config.privateKey, "RS256");
    const t = now();
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(config.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt(t)
      .setExpirationTime(t + 3600)
      .sign(key);
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) throw new Error(`token exchange failed (HTTP ${res.status})`);
    cached = { token: body.access_token, expiresAt: t + (body.expires_in ?? 3600) };
    return cached.token;
  };

  return {
    name: "fcm",
    async send(message: PushMessage): Promise<PushResult> {
      try {
        const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: message.data ?? {},
              android: { priority: "HIGH" },
            },
          }),
        });
        if (res.ok) return { ok: true };
        const err = (await res.json().catch(() => ({}))) as {
          error?: { status?: string; details?: Array<{ errorCode?: string }> };
        };
        const code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status ?? `HTTP ${res.status}`;
        if (res.status === 401) cached = null;
        // Only UNREGISTERED: a 404 can also mean a wrong project id, which
        // must not delete every token.
        return { ok: false, error: `FCM: ${code}`, gone: code === "UNREGISTERED" };
      } catch (err) {
        return { ok: false, error: `FCM unreachable: ${(err as Error).message}` };
      }
    },
  };
}
