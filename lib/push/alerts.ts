"use client";

/**
 * Virasat - Alerts on this phone: asking for permission and keeping the
 * server's copy of the push token current.
 *
 * Inside the iOS and Android apps only (@capacitor/push-notifications, loaded
 * on first use). The browser harness has no alerts; email covers it.
 */

import type { PluginListenerHandle } from "@capacitor/core";

/** The part of the plugin this app uses. */
export interface PushPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(event: "registration", fn: (token: { value: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "registrationError", fn: (error: { error: string }) => void): Promise<PluginListenerHandle>;
}

export type AlertsState = "on" | "off" | "denied";

export interface PhoneAlerts {
  state(): Promise<AlertsState>;
  /** Asks for permission (the OS shows its prompt once), then registers. */
  enable(): Promise<AlertsState>;
  /** After each unlock: the OS may have issued a new token. Never prompts. */
  refresh(): Promise<void>;
}

const REGISTRATION_TIMEOUT_MS = 15_000;

export function createPhoneAlerts(plugin: PushPlugin, sendToken: (token: string) => Promise<void>): PhoneAlerts {
  /** Registers, and resolves with the token the OS hands back. */
  const tokenFromOs = () =>
    new Promise<string>((resolve, reject) => {
      const handles: Promise<PluginListenerHandle>[] = [];
      const done = (fn: () => void) => {
        clearTimeout(timer);
        for (const h of handles) void h.then((x) => x.remove());
        fn();
      };
      const timer = setTimeout(() => done(() => reject(new Error("The phone did not answer. Please try again."))), REGISTRATION_TIMEOUT_MS);
      handles.push(plugin.addListener("registration", (t) => done(() => resolve(t.value))));
      handles.push(plugin.addListener("registrationError", (e) => done(() => reject(new Error(e.error)))));
      plugin.register().catch((err) => done(() => reject(err)));
    });

  const state = async (): Promise<AlertsState> => {
    const { receive } = await plugin.checkPermissions();
    return receive === "granted" ? "on" : receive === "denied" ? "denied" : "off";
  };

  return {
    state,
    async enable() {
      const { receive } = await plugin.requestPermissions();
      if (receive !== "granted") return receive === "denied" ? "denied" : "off";
      await sendToken(await tokenFromOs());
      return "on";
    },
    async refresh() {
      if ((await state()) !== "on") return;
      await sendToken(await tokenFromOs());
    },
  };
}

let shared: Promise<PhoneAlerts | null> | null = null;

/** This phone's alerts, or null in the browser harness. */
export function phoneAlerts(sendToken: (token: string) => Promise<void>): Promise<PhoneAlerts | null> {
  return (shared ??= (async () => {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { PushNotifications } = await import("@capacitor/push-notifications");
    return createPhoneAlerts(PushNotifications as unknown as PushPlugin, sendToken);
  })());
}
