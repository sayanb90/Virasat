/**
 * Virasat - Push notifications to the Owner's phones.
 *
 * Email stays the channel that must arrive; a push is the one most likely
 * to be seen in time. So a push never fails the flow that sends it: a
 * failure is logged, and a token the service says is gone is forgotten.
 *
 * Configuration:
 *   PUSH_DRIVER   console (default) | native
 *     native: iOS through APNs (APNS_* in ./drivers/apns.ts), Android
 *     through FCM (FCM_SERVICE_ACCOUNT_JSON in ./drivers/fcm.ts). A platform
 *     whose settings are missing is logged and skipped.
 */

import { apnsConfigFromEnv, createApnsDriver } from "./drivers/apns";
import { createConsolePushDriver } from "./drivers/console";
import { createFcmDriver, fcmConfigFromEnv } from "./drivers/fcm";
import type { PushDriver, PushMessage, PushResult } from "./types";

function notConfigured(platform: string, setting: string): PushDriver {
  return {
    name: `unconfigured:${platform}`,
    async send() {
      return { ok: false, error: `Push to ${platform} is not set up: ${setting} is missing.` };
    },
  };
}

/** Sends each message through the platform's own service. */
export function createNativePushDriver(env: Record<string, string | undefined> = process.env): PushDriver {
  const apns = apnsConfigFromEnv(env);
  const fcm = fcmConfigFromEnv(env);
  const ios = apns ? createApnsDriver(apns) : notConfigured("iOS", "APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID or APNS_TOPIC");
  const android = fcm ? createFcmDriver(fcm) : notConfigured("Android", "FCM_SERVICE_ACCOUNT_JSON");
  return {
    name: "native",
    send: (message) => (message.platform === "ios" ? ios : android).send(message),
  };
}

let override: PushDriver | null = null;

/** Tests: send through this driver until cleared. */
export function setPushDriverForTesting(driver: PushDriver | null): void {
  override = driver;
}

export function resolvePushDriver(): PushDriver {
  if (override) return override;
  return (process.env.PUSH_DRIVER ?? "console").toLowerCase() === "native"
    ? createNativePushDriver()
    : createConsolePushDriver();
}

/** Sends one message; never throws. */
export async function sendPush(message: PushMessage): Promise<PushResult> {
  try {
    const result = await resolvePushDriver().send(message);
    if (!result.ok) console.warn(`[push] not delivered to ${message.platform}: ${result.error}`);
    return result;
  } catch (err) {
    console.warn(`[push] failed: ${(err as Error).message}`);
    return { ok: false, error: (err as Error).message };
  }
}

export type { PushDriver, PushMessage, PushPlatform, PushResult } from "./types";
