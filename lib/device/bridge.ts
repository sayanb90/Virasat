/**
 * Virasat - Where this phone keeps its keys and its remembered sign-in.
 *
 * One interface, two implementations:
 *
 * - **Native (phase 3, not built yet):** Keychain on iOS and Keystore on
 *   Android, with Face ID / Touch ID as the OS's own gate on the biometric
 *   keys (docs/authentication.md §4).
 * - **Browser harness (this file):** IndexedDB, and a stand-in for the Face ID
 *   prompt. It exists so `next dev`, Playwright and Simulation Lab can run
 *   the whole flow. The shipped app replaces it entirely; nothing here is a
 *   security boundary, because a browser has no secure enclave.
 *
 * CryptoKeys are stored as CryptoKey objects. IndexedDB can hold them without
 * ever exporting the private halves, which is the nearest a browser gets to
 * a hardware-backed key.
 */

import type { DeviceState } from "./core";

export interface DeviceBridge {
  /** Short name for logs and the Settings screen. */
  readonly platform: "ios" | "android" | "browser";
  /** Whether this phone can do Face ID / Touch ID at all. */
  biometricsAvailable(): Promise<boolean>;
  /** What to call it on screen: "Face ID", "Touch ID", "fingerprint". */
  biometricLabel(): string;
  /** Asks the person to look at the phone. Resolves false if they cancel. */
  promptBiometrics(reason: string): Promise<boolean>;
  loadDevice(): Promise<DeviceState | null>;
  saveDevice(state: DeviceState): Promise<void>;
  forgetDevice(): Promise<void>;
  loadRefreshToken(): Promise<string | null>;
  saveRefreshToken(token: string | null): Promise<void>;
  /** A pending Recovery Kit recovery survives closing the app for 72 hours. */
  loadRecoveryToken(): Promise<string | null>;
  saveRecoveryToken(token: string | null): Promise<void>;
  defaultDeviceName(): string;
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
    async biometricsAvailable() {
      return true;
    },
    biometricLabel() {
      return "Face ID";
    },
    // The browser harness has no sensor. The unlock screen labels this as
    // simulated, and the server still requires the biometric key's
    // signature, so the flow is the real one end to end.
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
    defaultDeviceName() {
      return "This browser";
    },
  };
}

let bridge: DeviceBridge | null = null;

export function deviceBridge(): DeviceBridge {
  if (!bridge) bridge = createBrowserBridge();
  return bridge;
}
