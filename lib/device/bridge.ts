/**
 * Virasat - Where this phone keeps its keys and its remembered sign-in.
 *
 * One interface, two implementations:
 *
 * - **Native (./native.ts):** the Secure Enclave and Keychain on iOS, Keystore
 *   on Android, with Face ID / Touch ID / fingerprint as the OS's own gate on
 *   the biometric keys (docs/authentication.md §4). The build that ships in
 *   the app (`NEXT_PUBLIC_NATIVE=1`) uses only this, and the browser harness
 *   below is compiled out of it.
 * - **Browser harness (this file):** IndexedDB, and a stand-in for the Face ID
 *   prompt. It exists so `next dev`, Playwright and Simulation Lab can run
 *   the whole flow. Nothing here is a security boundary, because a browser
 *   has no secure enclave.
 *
 * CryptoKeys are stored as CryptoKey objects. IndexedDB can hold them without
 * ever exporting the private halves, which is the nearest a browser gets to
 * a hardware-backed key.
 */

import type { DeviceState } from "./core";
import { createWebCryptoKeyOps, type KeyOps } from "./keyops";
import { createNativeBridge } from "./native";

export interface Biometrics {
  /** Whether this phone has Face ID / Touch ID / a fingerprint set up at all. */
  available: boolean;
  /** What to call it on screen: "Face ID", "Touch ID", "fingerprint". */
  label: string;
}

export interface DeviceBridge {
  /** Short name for logs and the Settings screen. */
  readonly platform: "ios" | "android" | "browser";
  /** What signs, wraps and unlocks with this phone's keys. */
  readonly keys: KeyOps;
  biometrics(): Promise<Biometrics>;
  /**
   * Asks the person to look at the phone, outside any key operation. Used
   * once, when turning Face ID on, so the person sees it work (and iOS asks
   * its permission) before the app relies on it. Resolves false on cancel.
   */
  promptBiometrics(reason: string): Promise<boolean>;
  loadDevice(): Promise<DeviceState | null>;
  saveDevice(state: DeviceState): Promise<void>;
  forgetDevice(): Promise<void>;
  loadRefreshToken(): Promise<string | null>;
  saveRefreshToken(token: string | null): Promise<void>;
  /** A pending Recovery Kit recovery survives closing the app for 72 hours. */
  loadRecoveryToken(): Promise<string | null>;
  saveRecoveryToken(token: string | null): Promise<void>;
  defaultDeviceName(): Promise<string>;
}

const DB_NAME = "virasat-device";
const STORE = "keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Storage blocked (private window): behave as a phone with nothing on it.
    return null;
  }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (value === null) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* storage blocked — the session still works until the tab closes */
  }
}

function createBrowserBridge(): DeviceBridge {
  return {
    platform: "browser",
    // The browser harness has no sensor. The unlock screen labels this as
    // simulated, and the server still requires the biometric key's
    // signature, so the flow is the real one end to end.
    keys: createWebCryptoKeyOps(async () => true),
    async biometrics() {
      return { available: true, label: "Face ID" };
    },
    async promptBiometrics() {
      return true;
    },
    loadDevice: () => idbGet<DeviceState>("device"),
    saveDevice: (state) => idbPut("device", state),
    async forgetDevice() {
      await idbPut("device", null);
      await idbPut("refresh", null);
    },
    loadRefreshToken: () => idbGet<string>("refresh"),
    saveRefreshToken: (token) => idbPut("refresh", token),
    loadRecoveryToken: () => idbGet<string>("recovery"),
    saveRecoveryToken: (token) => idbPut("recovery", token),
    async defaultDeviceName() {
      return "This browser";
    },
  };
}

let bridge: DeviceBridge | null = null;

export function deviceBridge(): DeviceBridge {
  // The literal env read is what Next inlines (an imported constant is not),
  // so the branch not taken, and the bridge it builds, leave the bundle. The
  // native build has no IndexedDB fallback to fall into: if the plugin is
  // missing, createNativeBridge throws.
  if (!bridge) {
    bridge = process.env.NEXT_PUBLIC_NATIVE === "1" ? createNativeBridge() : createBrowserBridge();
  }
  return bridge;
}
