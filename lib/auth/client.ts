"use client";

/**
 * Virasat - The app's side of signing in.
 *
 * One external store for "who is signed in, and is the vault open", read with
 * useSyncExternalStore. The access token and K_vault live in this module's
 * memory only; the refresh token and the device keys live with the device
 * bridge (Keychain on a phone, IndexedDB in the browser harness).
 *
 *   signed-out ──tier one──▶ pending ──tier two──▶ unlocked
 *                               ▲                     │
 *                               └── locked ◀──────────┘  cold start, 5 minutes away, "Lock now"
 */

import { apiUrl } from "@/lib/config";
import { useSyncExternalStore } from "react";
import { bufferToHex, hexToBuffer } from "@/lib/crypto/argon2";
import { importVaultKey } from "@/lib/crypto/keys";
import {
  buildNewAccount,
  buildRecoveryKit,
  loginProof,
  openWithPassword,
  openWithRecoveryCode,
  recoveryVerifier,
  wrapWithPassword,
} from "@/lib/crypto/account";
import {
  finishEnrolment,
  keysOf,
  openPinCopy,
  prepareEnrolment,
  signForPin,
  unlockWithBiometrics,
  type DeviceState,
} from "@/lib/device/core";
import { deviceBridge } from "@/lib/device/bridge";
import { BiometricsChangedError } from "@/lib/device/keyops";
import { mintStubToken } from "@/lib/auth/providers/stub";
import { socialSheets, type SocialSheets } from "@/lib/auth/socialSheets";
import type { KdfParams, WrappedKey } from "@/lib/crypto/keys";
import { kdfNeedsUpgrade, pickKdf } from "@/lib/crypto/kdfPolicy";

/* ---------------------------------------------------------------------- */
/* State                                                                  */
/* ---------------------------------------------------------------------- */

export type AuthStatus =
  /** Still reading the device. Render nothing. */
  | "starting"
  /** Nobody is signed in on this phone. */
  | "signed-out"
  /** Tier one is done (or remembered); tier two is next. */
  | "locked"
  /** Signed in and verified, but this phone has no Face ID / PIN yet. */
  | "needs-device"
  /** Open. */
  | "unlocked";

export type Requirement = "device" | "email-code";

export interface AuthState {
  status: AuthStatus;
  needs: Requirement[];
  user: { name: string; email: string } | null;
  device: { biometric: boolean; email: string } | null;
  vaultKey: CryptoKey | null;
  vaultKeyHex: string;
}

const INITIAL: AuthState = {
  status: "starting",
  needs: [],
  user: null,
  device: null,
  vaultKey: null,
  vaultKeyHex: "",
};

let state: AuthState = INITIAL;
const listeners = new Set<() => void>();

let accessToken: string | null = null;
let accessExpiresAt = 0;
let stage: "pending" | "full" | "reset" | null = null;
/**
 * K_vault, opened during tier one with the password or a Recovery Kit, held
 * until tier two is done. Never sent anywhere.
 */
let pendingVaultBytes: Uint8Array | null = null;
let deviceCache: DeviceState | null | undefined;

function set(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

const SERVER_STATE: AuthState = INITIAL;

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState, () => SERVER_STATE);
}

/* ---------------------------------------------------------------------- */
/* Talking to the API                                                     */
/* ---------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>
  ) {
    super(message);
  }
}

/**
 * fetch(), with this session's token. Every screen uses this instead of
 * fetch for /api, so no request can leave without it.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(apiUrl(input), { ...init, headers });
  if (res.status === 401 && accessToken && state.status === "unlocked") {
    // The session ended under us (signed out elsewhere, password changed).
    clearSession();
    set({ status: (await deviceBridge().loadRefreshToken()) ? "locked" : "signed-out", vaultKey: null, vaultKeyHex: "" });
  }
  return res;
}

async function call<T = Record<string, unknown>>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.success === false) {
    throw new ApiError(String(data.error ?? "Something went wrong. Please try again."), res.status, data);
  }
  return data as T;
}

interface Grant {
  accessToken: string;
  accessExpiresAt: number;
  stage: "pending" | "full" | "reset";
  needs: Requirement[];
  refreshToken?: string;
  deviceId: string | null;
}

async function applyGrant(grant: Grant): Promise<void> {
  accessToken = grant.accessToken;
  accessExpiresAt = grant.accessExpiresAt;
  stage = grant.stage;
  if (grant.refreshToken) await deviceBridge().saveRefreshToken(grant.refreshToken);
  scheduleExtend();
}

function clearSession(): void {
  accessToken = null;
  accessExpiresAt = 0;
  stage = null;
  pendingVaultBytes = null;
  if (extendTimer) clearTimeout(extendTimer);
}

async function loadDevice(): Promise<DeviceState | null> {
  if (deviceCache === undefined) deviceCache = await deviceBridge().loadDevice();
  return deviceCache;
}

async function openVault(bytes: Uint8Array): Promise<void> {
  const key = await importVaultKey(bytes);
  set({ status: "unlocked", needs: [], vaultKey: key, vaultKeyHex: bufferToHex(bytes) });
  pendingVaultBytes = null;
  if (pendingUpgrade) await sendKdfUpgrade();
}

/**
 * An account made with PBKDF2 moves to Argon2id at sign-in. The new keys
 * are made from the password while tier two goes on, and sent only once
 * the session is full: the server will not take them earlier, so someone
 * with the password but not the phone cannot replace the vault key.
 */
let pendingUpgrade: Promise<{ currentAuthKeyHex: string; kdf: KdfParams; authKeyHex: string; wrappedVaultKey: WrappedKey }> | null = null;

async function sendKdfUpgrade(): Promise<void> {
  const prepared = pendingUpgrade;
  pendingUpgrade = null;
  try {
    await call("/api/auth/password/upgrade", await prepared);
  } catch {
    /* the old settings still work; the next sign-in tries again */
  }
}

/** Status after a grant, for screens that do not open the vault themselves. */
function statusAfter(grant: Grant): AuthStatus {
  if (grant.stage === "pending") return "locked";
  if (grant.stage === "full" && !grant.deviceId) return "needs-device";
  return state.status;
}

/* ---------------------------------------------------------------------- */
/* Start-up, locking, staying alive                                       */
/* ---------------------------------------------------------------------- */

let booting: Promise<void> | null = null;

/**
 * Cold start. A remembered sign-in comes back as a *pending* session: Face ID
 * or the PIN is asked every time the app opens (the Authentication design page (Notion) §4).
 */
export function boot(): Promise<void> {
  if (!booting) booting = doBoot().finally(() => (booting = null));
  return booting;
}

async function doBoot(): Promise<void> {
  if (state.status === "unlocked" || state.status === "needs-device") return;
  if (accessToken && stage === "pending") return;
  const device = await loadDevice();
  set({ device: device ? { biometric: !!device.biometricCopy, email: device.email } : null });
  const refreshToken = await deviceBridge().loadRefreshToken();
  if (!device || !refreshToken) {
    set({ status: "signed-out" });
    return;
  }
  try {
    const grant = await call<Grant>("/api/auth/refresh", { refreshToken, deviceId: device.deviceId });
    await applyGrant(grant);
    const me = await call<{ user: AuthState["user"] }>("/api/auth/session", undefined, "GET");
    set({ status: "locked", needs: grant.needs, user: me.user });
  } catch {
    await deviceBridge().saveRefreshToken(null);
    set({ status: "signed-out" });
  }
}

/** Forgets K_vault and the access token. The next screen asks for Face ID. */
export function lock(): void {
  clearSession();
  set({ status: "locked", needs: ["device"], vaultKey: null, vaultKeyHex: "" });
  void boot();
}

const BACKGROUND_LOCK_MS = 5 * 60_000;
let hiddenAt: number | null = null;

/** Locks after five minutes in the background. Call once, from the app shell. */
export function watchBackground(): () => void {
  const onChange = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
    } else if (hiddenAt !== null) {
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      if (away > BACKGROUND_LOCK_MS && state.status === "unlocked") lock();
    }
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

let extendTimer: ReturnType<typeof setTimeout> | null = null;

/** Keeps an open session alive while the app is in use, without asking again. */
function scheduleExtend(): void {
  if (extendTimer) clearTimeout(extendTimer);
  if (stage !== "full") return;
  const delay = Math.max(10_000, accessExpiresAt - Date.now() - 2 * 60_000);
  extendTimer = setTimeout(async () => {
    if (stage !== "full" || document.visibilityState === "hidden") return;
    try {
      await applyGrant(await call<Grant>("/api/auth/extend"));
    } catch {
      /* the next request will find out */
    }
  }, delay);
}

/* ---------------------------------------------------------------------- */
/* Tier two on this phone                                                 */
/* ---------------------------------------------------------------------- */

async function challenge(): Promise<string> {
  return (await call<{ challenge: string }>("/api/auth/device/challenge")).challenge;
}

/**
 * Face ID / Touch ID. Resolves false if the person cancelled the prompt.
 *
 * The prompt belongs to the key operation: using the biometric keys is what
 * shows it, once, for both the signature and this phone's copy of K_vault.
 */
export async function unlockWithFaceId(): Promise<boolean> {
  const device = await loadDevice();
  if (!device) throw new Error("This phone is not set up yet.");
  const bridge = deviceBridge();
  let unlocked: Awaited<ReturnType<typeof unlockWithBiometrics>>;
  try {
    unlocked = await unlockWithBiometrics(device, await challenge(), "Open your notes", bridge.keys);
  } catch (err) {
    if (err instanceof BiometricsChangedError) await dropBiometrics(device);
    throw err;
  }
  if (!unlocked) return false;
  const { signature, vaultKeyBytes: bytes } = unlocked;
  const grant = await call<Grant>("/api/auth/device/prove", { method: "biometric", signature });
  await applyGrant(grant);
  if (grant.stage === "full") await openVault(bytes);
  else {
    pendingVaultBytes = bytes;
    set({ needs: grant.needs });
  }
  return true;
}

/**
 * A face or fingerprint was added since Face ID was set up, and the OS has
 * destroyed the biometric keys. Forget them here too, so the unlock screen
 * offers the PIN alone until the person turns Face ID on again.
 */
async function dropBiometrics(device: DeviceState): Promise<void> {
  const bridge = deviceBridge();
  const stale = keysOf(device).filter((key) => key !== device.signingKey);
  const next: DeviceState = { ...device, biometricSigningKey: null, biometricWrapKey: null, biometricCopy: null };
  await bridge.saveDevice(next);
  deviceCache = next;
  set({ device: { biometric: false, email: next.email } });
  await bridge.keys.discard(stale).catch(() => {});
}

function capitalise(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function unlockWithPin(pin: string): Promise<void> {
  const device = await loadDevice();
  if (!device) throw new Error("This phone is not set up yet.");
  const signature = await signForPin(device, await challenge(), deviceBridge().keys);
  const result = await call<Grant & { serverShareHex: string }>("/api/auth/device/prove", {
    method: "pin",
    signature,
    pin,
  });
  await applyGrant(result);
  const bytes = await openPinCopy(device, result.serverShareHex);
  if (result.stage === "full") await openVault(bytes);
  else {
    pendingVaultBytes = bytes;
    set({ needs: result.needs });
  }
}

/** Tier two by email code: a new phone, or a recovery. */
export async function submitCode(code: string): Promise<void> {
  const grant = await call<Grant>("/api/auth/code", { code });
  await applyGrant(grant);
  set({ needs: grant.needs, status: statusAfter(grant) });
}

export async function resendCode(): Promise<void> {
  await call("/api/auth/code/resend");
}

/**
 * Sets up Face ID and the PIN on this phone, and opens the vault. Called
 * right after sign-up, and on a new phone after the email code.
 */
export async function setUpThisPhone(args: { pin: string; useBiometrics: boolean }): Promise<void> {
  if (!pendingVaultBytes) throw new Error("Please sign in again.");
  const bridge = deviceBridge();
  const biometrics = await bridge.biometrics();
  const withBiometrics = args.useBiometrics && biometrics.available;
  if (withBiometrics && !(await bridge.promptBiometrics(`Turn on ${biometrics.label} for Virasat`))) {
    throw new Error(`${capitalise(biometrics.label)} was not turned on. You can use your PIN instead.`);
  }
  const previous = await loadDevice();
  const prepared = await prepareEnrolment(withBiometrics, bridge.keys);
  const result = await call<Grant & { serverShareHex: string }>("/api/auth/device/enrol", {
    name: await bridge.defaultDeviceName(),
    platform: bridge.platform,
    signingPublicKey: prepared.signingPublicKey,
    biometricPublicKey: prepared.biometricPublicKey,
    pin: args.pin,
    replacesDeviceId: previous?.deviceId,
  });
  await applyGrant(result);
  const device = await finishEnrolment(prepared, {
    deviceId: result.deviceId!,
    email: state.user?.email ?? "",
    serverShareHex: result.serverShareHex,
    vaultKeyBytes: pendingVaultBytes,
  }, bridge.keys);
  await bridge.saveDevice(device);
  deviceCache = device;
  // The enrolment this one replaces made its own hardware keys. They open
  // nothing now (the server has dropped that device), so delete them.
  if (previous) await bridge.keys.discard(keysOf(previous)).catch(() => {});
  set({ device: { biometric: !!device.biometricCopy, email: device.email } });
  await openVault(pendingVaultBytes);
}

/**
 * Sets up this phone again from an open vault: to turn Face ID back on after
 * a new face or fingerprint switched it off, or to change the PIN. The
 * caller then shows SetUpPhone, which finishes through setUpThisPhone.
 */
export function prepareToSetUpAgain(): void {
  if (state.status !== "unlocked" || !state.vaultKeyHex) throw new Error("Please unlock Virasat first.");
  pendingVaultBytes = hexToBuffer(state.vaultKeyHex);
}

/* ---------------------------------------------------------------------- */
/* Tier one                                                               */
/* ---------------------------------------------------------------------- */

async function prelogin(email: string): Promise<KdfParams> {
  // Only the KDF's own fields: the reply also carries `success`.
  return pickKdf(await call<KdfParams>("/api/auth/prelogin", { email }));
}

/** Email and password. Next is Face ID / PIN, or a code on a new phone. */
export async function signInWithPassword(email: string, password: string, linkTicket?: string): Promise<void> {
  const kdf = await prelogin(email);
  const { authKeyHex } = await loginProof(password, kdf);
  const device = await loadDevice();
  const usable = device && device.email.toLowerCase() === email.trim().toLowerCase();
  const result = await call<Grant & { user: { name: string; email: string }; wrappedVaultKey: WrappedKey }>(
    "/api/auth/login",
    { email, authKeyHex, deviceId: usable ? device.deviceId : undefined, linkTicket }
  );
  pendingVaultBytes = await openWithPassword(password, kdf, result.wrappedVaultKey);
  if (kdfNeedsUpgrade(kdf)) {
    const vaultKeyBytes = pendingVaultBytes;
    pendingUpgrade = wrapWithPassword(password, vaultKeyBytes).then((next) => ({
      currentAuthKeyHex: authKeyHex,
      ...next.send,
    }));
    // A failure here only means no upgrade this time.
    pendingUpgrade.catch(() => (pendingUpgrade = null));
  }
  await applyGrant(result);
  set({ user: result.user, needs: result.needs, status: "locked" });
}

/**
 * A new password, from Settings. The vault key is open, so it is wrapped
 * again here with keys from the new password; the server sees neither.
 * Every other phone and session is signed out.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (state.status !== "unlocked" || !state.vaultKeyHex || !state.user) throw new Error("Please unlock Virasat first.");
  const kdf = await prelogin(state.user.email);
  const { authKeyHex: currentAuthKeyHex } = await loginProof(currentPassword, kdf);
  const next = await wrapWithPassword(newPassword, hexToBuffer(state.vaultKeyHex));
  await call("/api/auth/password/change", { currentAuthKeyHex, ...next.send });
}

export async function startSignUp(email: string): Promise<void> {
  await call("/api/auth/signup/start", { email });
}

export async function verifySignUpCode(email: string, code: string, socialTicket?: string) {
  return call<{ signupTicket: string; email: string; name: string | null }>("/api/auth/signup/verify", {
    email,
    code,
    socialTicket,
  });
}

/**
 * Creates the account. Returns the Recovery Kit code, which exists only on
 * this screen and the page the person prints.
 */
export async function finishSignUp(args: {
  signupTicket: string;
  name: string;
  email: string;
  password: string;
}): Promise<{ recoveryCode: string }> {
  const account = await buildNewAccount(args.password);
  const kit = await buildRecoveryKit(account.vaultKeyBytes);
  const grant = await call<Grant>("/api/auth/signup/complete", {
    signupTicket: args.signupTicket,
    name: args.name,
    ...account.send,
    recovery: kit.send,
  });
  await applyGrant(grant);
  pendingVaultBytes = account.vaultKeyBytes;
  set({ user: { name: args.name, email: args.email }, status: "needs-device", needs: [] });
  return { recoveryCode: kit.code };
}

/* --- Social ------------------------------------------------------------ */

export type SocialProvider = "apple" | "google" | "facebook";

export type SocialResult =
  | { status: "signed-in"; user: { name: string; email: string }; needs: Requirement[] }
  | { status: "password-required"; email: string }
  | { status: "link-required"; email: string; linkTicket: string }
  | { status: "signup"; signupTicket: string; email: string | null; name: string | null; emailVerified: boolean };

/**
 * Continue with a provider. Until the native sheets exist (phase 4) the only
 * driver is the stub, and `identity` is what the test sheet collected.
 */
/**
 * The browser harness's test sheet: the identity a provider would have sent,
 * as a stub token. The server accepts it only from the stub driver.
 */
export async function continueWithProvider(
  provider: SocialProvider,
  identity: { email: string | null; name: string; emailVerified: boolean }
): Promise<SocialResult> {
  const { nonce } = await call<{ nonce: string }>("/api/auth/social/nonce");
  const token = mintStubToken({
    provider,
    subject: `${provider}:${identity.email ?? identity.name}`,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name: identity.name,
    nonce,
  });
  return submitSocial(provider, nonce, token, null);
}

/**
 * The provider's own sheet, in the iOS or Android app. Resolves null if the
 * person closed it. The token goes to the server unread.
 */
export async function continueWithProviderSheet(
  provider: SocialProvider,
  sheets?: SocialSheets
): Promise<SocialResult | null> {
  const using = sheets ?? (await socialSheets());
  const { nonce } = await call<{ nonce: string }>("/api/auth/social/nonce");
  const sheet = await using.signIn(provider, nonce);
  if (!sheet) return null;
  return submitSocial(provider, nonce, sheet.token, sheet.name);
}

async function submitSocial(
  provider: SocialProvider,
  nonce: string,
  token: string,
  name: string | null
): Promise<SocialResult> {
  const device = await loadDevice();
  const result = await call<SocialResult & Partial<Grant>>("/api/auth/social", {
    provider,
    token,
    nonce,
    deviceId: device?.deviceId,
    ...(name ? { name } : {}),
  });
  if (result.status === "signed-in") {
    await applyGrant(result as unknown as Grant);
    set({ user: result.user, needs: result.needs, status: "locked" });
  }
  return result;
}

/* ---------------------------------------------------------------------- */
/* Forgotten password (the Authentication design page (Notion) 3.6)                        */
/* ---------------------------------------------------------------------- */

/** Path A. Face ID / PIN, then the email code, then a new password. */
export async function startResetOnThisPhone(email: string): Promise<void> {
  const device = await loadDevice();
  if (!device) throw new Error("This phone is not set up for Virasat.");
  const grant = await call<Grant>("/api/auth/recovery/device/start", { email, deviceId: device.deviceId });
  await applyGrant(grant);
  set({ needs: grant.needs, user: { name: "", email } });
}

export async function chooseNewPassword(password: string): Promise<void> {
  if (stage !== "reset" || !pendingVaultBytes) throw new Error("Please confirm it is you first.");
  const payload = await wrapWithPassword(password, pendingVaultBytes);
  const grant = await call<Grant>("/api/auth/password/reset", payload.send);
  await applyGrant(grant);
  await openVault(payload.vaultKeyBytes);
}

/** Path B, step one: a code to the account email. */
export async function startKitRecovery(email: string): Promise<void> {
  const grant = await call<Grant>("/api/auth/recovery/kit/start", { email });
  await applyGrant(grant);
}

/** Path B, step two: the Recovery Kit code. Starts the 72-hour hold. */
export async function beginKitRecovery(code: string): Promise<{ releasableAt: number }> {
  const verifierHex = await recoveryVerifier(code);
  const hold = await call<{ recoveryToken: string; releasableAt: number }>("/api/auth/recovery/kit/begin", {
    verifierHex,
  });
  await deviceBridge().saveRecoveryToken(hold.recoveryToken);
  clearSession();
  return { releasableAt: hold.releasableAt };
}

export type RecoveryState = "none" | "waiting" | "ready" | "cancelled" | "completed";

export async function kitRecoveryStatus(): Promise<{ state: RecoveryState; releasableAt?: number }> {
  const recoveryToken = await deviceBridge().loadRecoveryToken();
  if (!recoveryToken) return { state: "none" };
  try {
    return await call<{ state: RecoveryState; releasableAt: number }>("/api/auth/recovery/kit/status", {
      recoveryToken,
    });
  } catch {
    return { state: "none" };
  }
}

/**
 * Path B, after the hold: the same Recovery Kit code opens K_vault, a new
 * password wraps it, and a new kit replaces the spent one. Returns the new
 * kit's code to show and print.
 */
export async function completeKitRecovery(code: string, newPassword: string): Promise<{ recoveryCode: string }> {
  const recoveryToken = await deviceBridge().loadRecoveryToken();
  const done = await call<Grant & { wrappedVaultKey: WrappedKey; user: { name: string; email: string } }>(
    "/api/auth/recovery/kit/complete",
    { recoveryToken }
  );
  await applyGrant(done);
  const vaultKeyBytes = await openWithRecoveryCode(code, done.wrappedVaultKey);
  const payload = await wrapWithPassword(newPassword, vaultKeyBytes);
  const kit = await buildRecoveryKit(vaultKeyBytes);
  const grant = await call<Grant>("/api/auth/password/reset", { ...payload.send, recovery: kit.send });
  await applyGrant(grant);
  await deviceBridge().saveRecoveryToken(null);
  pendingVaultBytes = vaultKeyBytes;
  set({ user: done.user, status: "needs-device", needs: [] });
  return { recoveryCode: kit.code };
}

export async function forgetKitRecovery(): Promise<void> {
  await deviceBridge().saveRecoveryToken(null);
}

export async function cancelRecoveryByLink(cancelToken: string): Promise<void> {
  await call("/api/auth/recovery/kit/cancel", { cancelToken });
}

/* ---------------------------------------------------------------------- */
/* From an open app                                                       */
/* ---------------------------------------------------------------------- */

/** A new Recovery Kit, replacing the old one. Returns the code to show. */
export async function makeNewRecoveryKit(): Promise<{ recoveryCode: string }> {
  if (!state.vaultKey) throw new Error("Please unlock Virasat first.");
  const bytes = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", state.vaultKey));
  const kit = await buildRecoveryKit(bytes);
  await call("/api/auth/recovery-kit", kit.send, "PUT");
  return { recoveryCode: kit.code };
}

/** Signs out on this phone. Face ID and PIN stay set up for next time. */
export async function signOut(): Promise<void> {
  try {
    if (accessToken) await call("/api/auth/logout");
  } catch {
    /* already gone */
  }
  clearSession();
  await deviceBridge().saveRefreshToken(null);
  set({ status: "signed-out", needs: [], user: null, vaultKey: null, vaultKeyHex: "" });
}

/* ---------------------------------------------------------------------- */
/* The phones on this account, and a recovery someone else started        */
/* ---------------------------------------------------------------------- */

export interface PhoneSummary {
  id: string;
  name: string;
  platform: "ios" | "android" | "browser";
  biometric: boolean;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export async function listPhones(): Promise<PhoneSummary[]> {
  return (await call<{ devices: PhoneSummary[] }>("/api/auth/devices", undefined, "GET")).devices;
}

/** Takes a lost or sold phone off the account. Not this phone: that is sign out. */
export async function removePhone(deviceId: string): Promise<void> {
  await call("/api/auth/devices", { deviceId }, "DELETE");
}

/** Whether someone is using the Recovery Kit to get into this account. */
export async function recoveryInProgress(): Promise<boolean> {
  return (await call<{ recoveryInProgress: boolean }>("/api/auth/session", undefined, "GET")).recoveryInProgress;
}

/** The Owner's veto, from inside the app. Resolves whether there was one to stop. */
export async function stopRecovery(): Promise<boolean> {
  return (await call<{ cancelled: boolean }>("/api/auth/recovery/kit/cancel", {})).cancelled;
}

/** This phone's push token, for alerts (lib/push/alerts.ts). */
export async function sendPushToken(token: string): Promise<void> {
  await call("/api/push/register", { token });
}
