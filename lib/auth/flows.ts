/**
 * Virasat - Sign-in, device unlock and recovery.
 *
 * The rules of docs/authentication.md, as plain functions over the store, so
 * Cucumber can exercise every one without HTTP and the routes stay thin.
 *
 * The shape of every sign-in:
 *
 *   tier one   (password, or a social provider)        → a *pending* session
 *   tier two   (device proof, or an email code)         → a *full* session
 *
 * A pending session is good for one thing: completing what it `needs`. The
 * server, not the app, decides when that is done, so a modified app that
 * skips the Face ID prompt still cannot reach anyone's notes.
 */

import { verify as verifySignature } from "node:crypto";
import { authStore as store } from "./store";
import { now, nowMs } from "./clock";
import {
  burnSlowHash,
  randomHex,
  randomToken,
  serverHmac,
  sha256,
  sixDigitCode,
  slowHash,
  slowVerify,
} from "./secrets";
import { resolveIdentityDriver } from "./providers";
import { sendEmail, templateContext } from "../email";
import {
  alreadyRegistered,
  newDeviceSignedIn,
  passwordChanged,
  recoveryStarted,
  verificationCode,
} from "../email/templates";
import type {
  CodePurpose,
  DeviceRecord,
  KdfParams,
  PublicKeyJwk,
  Requirement,
  SessionPurpose,
  SessionRecord,
  SignupTicket,
  SocialProvider,
  UserRecord,
  WrappedKey,
} from "./types";

/* ---------------------------------------------------------------------- */
/* Policy                                                                 */
/* ---------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const POLICY = {
  pendingTtlMs: 5 * MINUTE,
  accessTtlMs: 15 * MINUTE,
  resetTtlMs: 10 * MINUTE,
  refreshTtlMs: 30 * DAY,
  codeTtlMs: 10 * MINUTE,
  codeAttempts: 5,
  ticketTtlMs: 30 * MINUTE,
  nonceTtlMs: 10 * MINUTE,
  pinAttempts: 5,
  loginFailures: 5,
  loginLockMs: 15 * MINUTE,
  recoveryAttempts: 5,
  recoveryHoldMs: 72 * HOUR,
  /** OWASP's floor for PBKDF2-HMAC-SHA256. */
  minIterations: 600_000,
} as const;

/* ---------------------------------------------------------------------- */
/* Results                                                                */
/* ---------------------------------------------------------------------- */

export type Outcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; detail?: Record<string, unknown> };

function ok<T>(data: T): Outcome<T> {
  return { ok: true, data };
}

function fail<T = never>(
  status: number,
  error: string,
  detail?: Record<string, unknown>
): Outcome<T> {
  return { ok: false, status, error, detail };
}

/** One message for every wrong email/password pair, known account or not. */
const WRONG_LOGIN = "That email and password do not match. Please try again.";

export type Stage = "pending" | "full" | "reset";

export function stageOf(session: SessionRecord): Stage {
  if (session.needs.length > 0) return "pending";
  return session.purpose === "login" ? "full" : "reset";
}

/** What the client is told about its session after every step. */
export interface SessionGrant {
  accessToken: string;
  accessExpiresAt: number;
  stage: Stage;
  needs: Requirement[];
  /** Only once a full session is bound to an enrolled device. */
  refreshToken?: string;
  deviceId: string | null;
}

/* ---------------------------------------------------------------------- */
/* Validation helpers                                                     */
/* ---------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

const HEX_RE = /^[0-9a-f]+$/i;

function isHex(value: unknown, bytes?: number): value is string {
  if (typeof value !== "string" || !HEX_RE.test(value) || value.length % 2 !== 0) return false;
  return bytes === undefined || value.length === bytes * 2;
}

function isWrappedKey(value: unknown): value is WrappedKey {
  const v = value as WrappedKey;
  return !!v && isHex(v.ivHex, 12) && isHex(v.ciphertextHex) && v.ciphertextHex.length >= 64;
}

function isKdf(value: unknown): value is KdfParams {
  const v = value as KdfParams;
  return (
    !!v &&
    isHex(v.saltHex, 16) &&
    Number.isInteger(v.iterations) &&
    v.iterations >= POLICY.minIterations
  );
}

function isPublicKeyJwk(value: unknown): value is PublicKeyJwk {
  const v = value as PublicKeyJwk;
  return (
    !!v &&
    v.kty === "EC" &&
    v.crv === "P-256" &&
    typeof v.x === "string" &&
    typeof v.y === "string"
  );
}

const PIN_RE = /^\d{6}$/;

/* ---------------------------------------------------------------------- */
/* Sessions                                                               */
/* ---------------------------------------------------------------------- */

function newSession(args: {
  userId: string;
  deviceId: string | null;
  purpose: SessionPurpose;
  needs: Requirement[];
  family?: string;
}): { session: SessionRecord; accessToken: string } {
  const accessToken = randomToken();
  const session: SessionRecord = {
    id: randomHex(8),
    userId: args.userId,
    deviceId: args.deviceId,
    purpose: args.purpose,
    needs: [...args.needs],
    accessHash: sha256(accessToken),
    accessExpiresAt: nowMs() + ttlFor(args.purpose, args.needs),
    family: args.family ?? randomHex(8),
    challenge: null,
    createdAt: nowMs(),
  };
  store.sessions.set(session.accessHash, session);
  return { session, accessToken };
}

function ttlFor(purpose: SessionPurpose, needs: Requirement[]): number {
  if (needs.length > 0) return POLICY.pendingTtlMs;
  return purpose === "login" ? POLICY.accessTtlMs : POLICY.resetTtlMs;
}

/** A new access token for the same session. Old one stops working. */
function rotateAccess(session: SessionRecord): string {
  store.sessions.delete(session.accessHash);
  const accessToken = randomToken();
  session.accessHash = sha256(accessToken);
  session.accessExpiresAt = nowMs() + ttlFor(session.purpose, session.needs);
  store.sessions.set(session.accessHash, session);
  return accessToken;
}

function issueRefresh(session: SessionRecord): string | undefined {
  if (!session.deviceId) return undefined;
  const token = randomToken();
  store.refreshTokens.set(sha256(token), {
    hash: sha256(token),
    family: session.family,
    userId: session.userId,
    deviceId: session.deviceId,
    expiresAt: nowMs() + POLICY.refreshTtlMs,
    usedAt: null,
  });
  return token;
}

function grant(session: SessionRecord, accessToken: string, refreshToken?: string): SessionGrant {
  return {
    accessToken,
    accessExpiresAt: session.accessExpiresAt,
    stage: stageOf(session),
    needs: [...session.needs],
    deviceId: session.deviceId,
    ...(refreshToken ? { refreshToken } : {}),
  };
}

/**
 * Called after a requirement is met. Privilege changed, so the access token
 * changes too; a full login session bound to a device also gets its refresh
 * token now, and not before.
 */
function advance(session: SessionRecord, met: Requirement): SessionGrant {
  session.needs = session.needs.filter((n) => n !== met);
  session.challenge = null;
  const accessToken = rotateAccess(session);
  const refreshToken =
    stageOf(session) === "full" ? issueRefresh(session) : undefined;
  return grant(session, accessToken, refreshToken);
}

/** Finds the live session for a bearer token, or nothing. */
export function sessionForToken(accessToken: string | null): SessionRecord | null {
  if (!accessToken) return null;
  const session = store.sessions.get(sha256(accessToken));
  if (!session) return null;
  if (session.accessExpiresAt <= nowMs()) {
    store.sessions.delete(session.accessHash);
    return null;
  }
  return session;
}

export function userFor(session: SessionRecord): UserRecord | null {
  return store.users.get(session.userId) ?? null;
}

/* ---------------------------------------------------------------------- */
/* Email codes                                                            */
/* ---------------------------------------------------------------------- */

async function sendCode(purpose: CodePurpose, email: string): Promise<void> {
  const code = sixDigitCode();
  store.emailCodes.set(store.codeKey(purpose, email), {
    codeHash: slowHash(code),
    attempts: 0,
    expiresAt: nowMs() + POLICY.codeTtlMs,
  });
  if (process.env.VIRASAT_E2E === "1" || store.captureCodesForTesting) {
    store.lastCodesForTesting.set(email, code);
  }
  await sendEmail(
    verificationCode(templateContext(), { email, code, purpose, sendId: randomHex(8) })
  );
}

function checkCode(purpose: CodePurpose, email: string, code: unknown): Outcome<true> {
  const key = store.codeKey(purpose, email);
  const record = store.emailCodes.get(key);
  if (!record || record.expiresAt <= nowMs()) {
    store.emailCodes.delete(key);
    return fail(400, "That code has expired. Please ask for a new one.");
  }
  if (record.attempts >= POLICY.codeAttempts) {
    store.emailCodes.delete(key);
    return fail(429, "Too many wrong codes. Please ask for a new one.");
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code.replace(/\s/g, ""))) {
    record.attempts += 1;
    return fail(400, "Please enter the six numbers from the email.");
  }
  if (!slowVerify(code.replace(/\s/g, ""), record.codeHash)) {
    record.attempts += 1;
    return fail(400, "That code is not right. Please check the email and try again.", {
      remaining: POLICY.codeAttempts - record.attempts,
    });
  }
  store.emailCodes.delete(key);
  return ok(true);
}

/* ---------------------------------------------------------------------- */
/* Before sign-in                                                         */
/* ---------------------------------------------------------------------- */

/**
 * The salt and cost to derive keys from the password. An unknown email gets
 * a salt that is stable for that address and indistinguishable from a real
 * one, so this endpoint does not say who has an account.
 */
export function prelogin(rawEmail: unknown): Outcome<KdfParams> {
  const email = normaliseEmail(rawEmail);
  if (!email) return fail(400, "Please enter a valid email address.");
  const user = store.userByEmail(email);
  if (user) return ok({ ...user.kdf });
  return ok({
    saltHex: serverHmac("fake-salt", email).slice(0, 32),
    iterations: POLICY.minIterations,
  });
}

/* ---------------------------------------------------------------------- */
/* Sign-up (docs/authentication.md 3.1, 3.2)                              */
/* ---------------------------------------------------------------------- */

/**
 * Sends a code to confirm the address. If the address already has an
 * account, it gets a "you already have an account" email instead, and the
 * caller cannot tell the difference.
 */
export async function startSignup(rawEmail: unknown): Promise<Outcome<{ sent: true }>> {
  const email = normaliseEmail(rawEmail);
  if (!email) return fail(400, "Please enter a valid email address.");
  if (store.userByEmail(email)) {
    await sendEmail(alreadyRegistered(templateContext(), { email, sendId: randomHex(8) }));
    return ok({ sent: true });
  }
  await sendCode("signup", email);
  return ok({ sent: true });
}

function putSignupTicket(ticket: Omit<SignupTicket, "expiresAt">): string {
  const token = randomToken();
  store.signupTickets.set(sha256(token), { ...ticket, expiresAt: nowMs() + POLICY.ticketTtlMs });
  return token;
}

function takeSignupTicket(token: unknown, consume: boolean) {
  if (typeof token !== "string") return null;
  const hash = sha256(token);
  const ticket = store.signupTickets.get(hash);
  if (!ticket || ticket.expiresAt <= nowMs()) {
    store.signupTickets.delete(hash);
    return null;
  }
  if (consume) store.signupTickets.delete(hash);
  return ticket;
}

/**
 * Confirms the code. `socialTicket`, when present, is a social sign-up whose
 * provider gave no verified email; the identity carries over.
 */
export function verifySignupCode(args: {
  email: unknown;
  code: unknown;
  socialTicket?: unknown;
}): Outcome<{ signupTicket: string; email: string; name: string | null }> {
  const email = normaliseEmail(args.email);
  if (!email) return fail(400, "Please enter a valid email address.");
  const checked = checkCode("signup", email, args.code);
  if (!checked.ok) return checked;

  const social = args.socialTicket ? takeSignupTicket(args.socialTicket, true) : null;
  const signupTicket = putSignupTicket({
    email,
    name: social?.name ?? null,
    emailVerified: true,
    identity: social?.identity ?? null,
  });
  return ok({ signupTicket, email, name: social?.name ?? null });
}

export interface SignupInput {
  signupTicket: unknown;
  name: unknown;
  kdf: unknown;
  authKeyHex: unknown;
  wrappedVaultKey: unknown;
  /** Optional: the Recovery Kit may be postponed (3.1 step 5). */
  recovery?: { wrappedVaultKey: unknown; verifierHex: unknown } | null;
}

export async function completeSignup(input: SignupInput): Promise<Outcome<SessionGrant>> {
  const ticket = takeSignupTicket(input.signupTicket, false);
  if (!ticket || !ticket.emailVerified || !ticket.email) {
    return fail(400, "This sign-up has expired. Please start again.");
  }
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) return fail(400, "Please tell us your name.");
  if (!isKdf(input.kdf)) return fail(400, "The key settings are not acceptable.");
  if (!isHex(input.authKeyHex, 32)) return fail(400, "The sign-in proof is missing.");
  if (!isWrappedKey(input.wrappedVaultKey)) return fail(400, "The vault key is missing.");
  const recovery = input.recovery
    ? parseRecovery(input.recovery)
    : null;
  if (input.recovery && !recovery) return fail(400, "The Recovery Kit is not acceptable.");

  // The ticket could have been used in another tab between our two reads.
  if (store.userByEmail(ticket.email)) {
    takeSignupTicket(input.signupTicket, true);
    return fail(409, "There is already an account for this email. Please sign in.");
  }
  takeSignupTicket(input.signupTicket, true);

  const user: UserRecord = {
    id: `user-${randomHex(8)}`,
    name,
    email: ticket.email,
    emailVerifiedAt: now().toISOString(),
    kdf: { saltHex: (input.kdf as KdfParams).saltHex, iterations: (input.kdf as KdfParams).iterations },
    authHash: slowHash(input.authKeyHex as string),
    wrappedVaultKey: input.wrappedVaultKey as WrappedKey,
    recovery,
    createdAt: now().toISOString(),
  };
  store.addUser(user);

  if (ticket.identity) {
    store.addIdentity({
      ...ticket.identity,
      userId: user.id,
      email: ticket.email,
      linkedAt: now().toISOString(),
    });
  }

  // Email code + password are this session's two tiers. It has no device
  // yet, so no refresh token until the phone is enrolled.
  const { session, accessToken } = newSession({
    userId: user.id,
    deviceId: null,
    purpose: "login",
    needs: [],
  });
  return ok(grant(session, accessToken));
}

function parseRecovery(raw: { wrappedVaultKey: unknown; verifierHex: unknown }) {
  if (!isWrappedKey(raw.wrappedVaultKey) || !isHex(raw.verifierHex, 32)) return null;
  return { wrappedVaultKey: raw.wrappedVaultKey, verifierHash: slowHash(raw.verifierHex) };
}

/* ---------------------------------------------------------------------- */
/* Sign-in with a password (3.3, 3.4)                                     */
/* ---------------------------------------------------------------------- */

function deviceUsable(device: DeviceRecord | undefined, userId: string): device is DeviceRecord {
  return (
    !!device &&
    device.userId === userId &&
    !device.revokedAt &&
    (!!device.biometricPublicKey || !!device.serverShareHex)
  );
}

function loginLocked(email: string): boolean {
  const f = store.loginFailures.get(email);
  if (!f) return false;
  if (nowMs() - f.windowStart > POLICY.loginLockMs) {
    store.loginFailures.delete(email);
    return false;
  }
  return f.count >= POLICY.loginFailures;
}

function noteLoginFailure(email: string): void {
  const f = store.loginFailures.get(email);
  if (!f || nowMs() - f.windowStart > POLICY.loginLockMs) {
    store.loginFailures.set(email, { count: 1, windowStart: nowMs() });
  } else {
    f.count += 1;
  }
}

export interface LoginResult extends SessionGrant {
  user: { name: string; email: string };
  /** Useless without the password, which the caller just proved it has. */
  wrappedVaultKey: WrappedKey;
  /** True when a social account was linked by this sign-in (3.5). */
  linked: boolean;
}

export async function login(args: {
  email: unknown;
  authKeyHex: unknown;
  deviceId?: unknown;
  linkTicket?: unknown;
}): Promise<Outcome<LoginResult>> {
  const email = normaliseEmail(args.email);
  if (!email) return fail(400, "Please enter a valid email address.");
  if (loginLocked(email)) {
    return fail(429, "Too many tries. Please wait 15 minutes and try again.");
  }

  const user = store.userByEmail(email);
  const proof = isHex(args.authKeyHex, 32) ? args.authKeyHex : "";
  if (!user) {
    burnSlowHash(proof || "x");
    noteLoginFailure(email);
    return fail(401, WRONG_LOGIN);
  }
  if (!proof || !slowVerify(proof, user.authHash)) {
    noteLoginFailure(email);
    return fail(401, WRONG_LOGIN);
  }
  store.loginFailures.delete(email);

  let linked = false;
  if (args.linkTicket) {
    const hash = sha256(String(args.linkTicket));
    const ticket = store.linkTickets.get(hash);
    store.linkTickets.delete(hash);
    if (ticket && ticket.expiresAt > nowMs() && ticket.userId === user.id) {
      if (!store.identity(ticket.identity.provider, ticket.identity.subject)) {
        store.addIdentity({ ...ticket.identity, userId: user.id, linkedAt: now().toISOString() });
        linked = true;
      }
    }
  }

  const device = typeof args.deviceId === "string" ? store.devices.get(args.deviceId) : undefined;
  const known = deviceUsable(device, user.id);
  const { session, accessToken } = newSession({
    userId: user.id,
    deviceId: known ? device!.id : null,
    purpose: "login",
    needs: [known ? "device" : "email-code"],
  });
  if (!known) await sendCode("new-device", user.email);

  return ok({
    ...grant(session, accessToken),
    user: { name: user.name, email: user.email },
    wrappedVaultKey: user.wrappedVaultKey,
    linked,
  });
}

/* ---------------------------------------------------------------------- */
/* Tier two: an email code                                                */
/* ---------------------------------------------------------------------- */

const CODE_PURPOSE: Record<SessionPurpose, CodePurpose> = {
  login: "new-device",
  "reset-with-device": "reset",
  "recover-with-kit": "recover",
};

export function verifySessionCode(session: SessionRecord, code: unknown): Outcome<SessionGrant> {
  if (!session.needs.includes("email-code")) return fail(409, "No code is needed here.");
  const user = userFor(session);
  if (!user) return fail(401, "Please sign in again.");
  const checked = checkCode(CODE_PURPOSE[session.purpose], user.email, code);
  if (!checked.ok) return checked;
  return ok(advance(session, "email-code"));
}

export async function resendSessionCode(session: SessionRecord): Promise<Outcome<{ sent: true }>> {
  if (!session.needs.includes("email-code")) return fail(409, "No code is needed here.");
  const user = userFor(session);
  if (!user) return fail(401, "Please sign in again.");
  await sendCode(CODE_PURPOSE[session.purpose], user.email);
  return ok({ sent: true });
}

/* ---------------------------------------------------------------------- */
/* Devices (docs/authentication.md §4)                                    */
/* ---------------------------------------------------------------------- */

export interface EnrolResult extends SessionGrant {
  serverShareHex: string;
}

/**
 * Registers this phone. Needs a full session: the person has just proved the
 * password and an email code (or a device, if re-enrolling).
 */
export async function enrolDevice(
  session: SessionRecord,
  args: {
    name: unknown;
    platform: unknown;
    signingPublicKey: unknown;
    biometricPublicKey?: unknown;
    pin: unknown;
    replacesDeviceId?: unknown;
  }
): Promise<Outcome<EnrolResult>> {
  if (stageOf(session) !== "full") return fail(403, "Please finish signing in first.");
  const user = userFor(session);
  if (!user) return fail(401, "Please sign in again.");
  if (!isPublicKeyJwk(args.signingPublicKey)) return fail(400, "The device key is missing.");
  if (args.biometricPublicKey != null && !isPublicKeyJwk(args.biometricPublicKey)) {
    return fail(400, "The Face ID key is not acceptable.");
  }
  if (typeof args.pin !== "string" || !PIN_RE.test(args.pin)) {
    return fail(400, "Please choose a PIN of six numbers.");
  }
  const platform =
    args.platform === "ios" || args.platform === "android" ? args.platform : "browser";

  const previous = store.devicesFor(user.id).filter((d) => !d.revokedAt);

  if (typeof args.replacesDeviceId === "string") {
    const old = store.devices.get(args.replacesDeviceId);
    if (old && old.userId === user.id && !old.revokedAt) {
      old.revokedAt = now().toISOString();
      if (old.id !== session.deviceId) store.revokeDevice(old.id);
    }
  }

  const pinPepper = randomHex(16);
  const device: DeviceRecord = {
    id: `dev-${randomHex(8)}`,
    userId: user.id,
    name: String(args.name ?? "").trim().slice(0, 60) || "Phone",
    platform,
    signingPublicKey: args.signingPublicKey,
    biometricPublicKey: (args.biometricPublicKey as PublicKeyJwk | undefined) ?? null,
    pinHash: slowHash(args.pin, pinPepper),
    pinPepper,
    serverShareHex: randomHex(32),
    pinFailures: 0,
    createdAt: now().toISOString(),
    lastSeenAt: now().toISOString(),
    revokedAt: null,
  };
  store.devices.set(device.id, device);

  session.deviceId = device.id;
  const accessToken = rotateAccess(session);
  const refreshToken = issueRefresh(session);

  // The first phone is the sign-up itself; every later one is news (3.4).
  const isNewPhone = previous.some((d) => d.id !== args.replacesDeviceId);
  if (isNewPhone) {
    await sendEmail(
      newDeviceSignedIn(templateContext(), {
        email: user.email,
        name: user.name,
        deviceName: device.name,
        deviceId: device.id,
      })
    );
  }

  return ok({ ...grant(session, accessToken, refreshToken), serverShareHex: device.serverShareHex! });
}

/** A fresh, single-use challenge for the device to sign. */
export function deviceChallenge(session: SessionRecord): Outcome<{ challenge: string }> {
  if (!session.needs.includes("device") || !session.deviceId) {
    return fail(409, "No device check is needed here.");
  }
  session.challenge = randomToken();
  return ok({ challenge: session.challenge });
}

/** Raw r‖s, base64url, over the challenge as UTF-8. Exported for the specs. */
export function signatureValid(jwk: PublicKeyJwk, challenge: string, signatureB64: unknown): boolean {
  if (typeof signatureB64 !== "string") return false;
  try {
    return verifySignature(
      "sha256",
      Buffer.from(challenge, "utf8"),
      { key: jwk, format: "jwk", dsaEncoding: "ieee-p1363" },
      Buffer.from(signatureB64, "base64url")
    );
  } catch {
    return false;
  }
}

export interface DeviceProofResult extends SessionGrant {
  /** Present on the PIN path: the half of the PIN key the phone does not hold. */
  serverShareHex?: string;
}

/**
 * Tier two on an enrolled phone. Face ID / Touch ID signs with the
 * biometric-gated key; the PIN path signs with the device key *and* the
 * server checks the PIN. Five wrong PINs delete the server's share, after
 * which only the password can bring this phone back (3.4).
 */
export function proveDevice(
  session: SessionRecord,
  args: { method: unknown; signature: unknown; pin?: unknown }
): Outcome<DeviceProofResult> {
  if (!session.needs.includes("device") || !session.deviceId) {
    return fail(409, "No device check is needed here.");
  }
  const device = store.devices.get(session.deviceId);
  if (!device || device.revokedAt || device.userId !== session.userId) {
    return fail(401, "This phone has been removed from your account. Please sign in again.");
  }
  const challenge = session.challenge;
  session.challenge = null;
  if (!challenge) return fail(400, "Please try again.");

  if (args.method === "biometric") {
    if (!device.biometricPublicKey) return fail(400, "Face ID is not set up on this phone.");
    if (!signatureValid(device.biometricPublicKey, challenge, args.signature)) {
      return fail(401, "Face ID could not be confirmed. Please try again or use your PIN.");
    }
    device.lastSeenAt = now().toISOString();
    return ok(advance(session, "device"));
  }

  if (args.method === "pin") {
    if (!device.serverShareHex) {
      return fail(423, "Your PIN is locked after too many tries. Please sign in with your password.", {
        locked: true,
      });
    }
    if (!signatureValid(device.signingPublicKey, challenge, args.signature)) {
      return fail(401, "This phone could not be confirmed. Please sign in again.");
    }
    if (typeof args.pin !== "string" || !slowVerify(args.pin, device.pinHash, device.pinPepper)) {
      device.pinFailures += 1;
      const remaining = POLICY.pinAttempts - device.pinFailures;
      if (remaining <= 0) {
        device.serverShareHex = null;
        return fail(423, "Your PIN is locked after too many tries. Please sign in with your password.", {
          locked: true,
        });
      }
      return fail(401, `That PIN is not right. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`, {
        remaining,
      });
    }
    device.pinFailures = 0;
    device.lastSeenAt = now().toISOString();
    return ok({ ...advance(session, "device"), serverShareHex: device.serverShareHex });
  }

  return fail(400, "Please choose Face ID or your PIN.");
}

/* ---------------------------------------------------------------------- */
/* Staying signed in                                                      */
/* ---------------------------------------------------------------------- */

/**
 * Exchanges a refresh token for a *pending* session. Remembering the sign-in
 * remembers tier one only: every app open still asks for Face ID or the PIN
 * (§4, "When tier two is asked again").
 *
 * Refresh tokens are single use. Presenting one twice means it was copied, so
 * the whole sign-in is ended on every device that shares it.
 */
export function refresh(args: { refreshToken: unknown; deviceId: unknown }): Outcome<SessionGrant & { refreshToken: string }> {
  if (typeof args.refreshToken !== "string") return fail(401, "Please sign in again.");
  const hash = sha256(args.refreshToken);
  const record = store.refreshTokens.get(hash);
  if (!record) return fail(401, "Please sign in again.");
  if (record.usedAt !== null) {
    store.revokeFamily(record.family);
    return fail(401, "Please sign in again.");
  }
  if (record.expiresAt <= nowMs() || record.deviceId !== args.deviceId) {
    store.refreshTokens.delete(hash);
    return fail(401, "Please sign in again.");
  }
  const device = store.devices.get(record.deviceId);
  if (!deviceUsable(device, record.userId)) {
    store.revokeFamily(record.family);
    return fail(401, "Please sign in again.");
  }

  record.usedAt = nowMs();
  // Older sessions of this sign-in end here; the app is starting over.
  for (const [h, s] of store.sessions) if (s.family === record.family) store.sessions.delete(h);

  const { session, accessToken } = newSession({
    userId: record.userId,
    deviceId: record.deviceId,
    purpose: "login",
    needs: ["device"],
    family: record.family,
  });
  const next = randomToken();
  store.refreshTokens.set(sha256(next), {
    ...record,
    hash: sha256(next),
    expiresAt: nowMs() + POLICY.refreshTtlMs,
    usedAt: null,
  });
  return ok({ ...grant(session, accessToken), refreshToken: next });
}

/** Keeps an in-use full session alive without asking for Face ID again. */
export function extend(session: SessionRecord): Outcome<SessionGrant> {
  if (stageOf(session) !== "full") return fail(403, "Please finish signing in first.");
  return ok(grant(session, rotateAccess(session)));
}

export function logout(session: SessionRecord): void {
  store.revokeFamily(session.family);
}

/* ---------------------------------------------------------------------- */
/* Social sign-in (3.2, 3.5, §6)                                          */
/* ---------------------------------------------------------------------- */

export function socialNonce(): { nonce: string } {
  const nonce = randomToken(16);
  store.socialNonces.set(nonce, nowMs() + POLICY.nonceTtlMs);
  return { nonce };
}

export type SocialOutcome =
  /** Known identity on an enrolled phone: tier two next. */
  | ({ status: "signed-in"; user: { name: string; email: string } } & SessionGrant)
  /** Known identity, but this phone has never held the vault key (§1). */
  | { status: "password-required"; email: string }
  /** The email matches an account that has not linked this provider (3.5). */
  | { status: "link-required"; email: string; linkTicket: string }
  /** Nobody we know. */
  | {
      status: "signup";
      signupTicket: string;
      email: string | null;
      name: string | null;
      emailVerified: boolean;
    };

const PROVIDERS: SocialProvider[] = ["apple", "google", "facebook"];

export async function socialSignIn(args: {
  provider: unknown;
  token: unknown;
  nonce: unknown;
  deviceId?: unknown;
}): Promise<Outcome<SocialOutcome>> {
  if (!PROVIDERS.includes(args.provider as SocialProvider)) {
    return fail(400, "Please choose Apple, Google or Facebook.");
  }
  const provider = args.provider as SocialProvider;
  const nonce = typeof args.nonce === "string" ? args.nonce : "";
  const expires = store.socialNonces.get(nonce);
  store.socialNonces.delete(nonce);
  if (!expires || expires <= nowMs()) return fail(400, "This sign-in has expired. Please try again.");

  const driver = resolveIdentityDriver();
  if (!driver.ready) return fail(503, driver.notReadyReason ?? "Social sign-in is not available.");
  const verified = await driver.verify(provider, String(args.token ?? ""), nonce);
  if (!verified.ok) return fail(401, verified.error);
  const identity = verified.identity;

  const known = store.identity(provider, identity.subject);
  if (known) {
    const user = store.users.get(known.userId);
    if (!user) return fail(401, "Please sign in again.");
    const device = typeof args.deviceId === "string" ? store.devices.get(args.deviceId) : undefined;
    if (!deviceUsable(device, user.id)) return ok({ status: "password-required", email: user.email });
    const { session, accessToken } = newSession({
      userId: user.id,
      deviceId: device.id,
      purpose: "login",
      needs: ["device"],
    });
    return ok({
      status: "signed-in",
      user: { name: user.name, email: user.email },
      ...grant(session, accessToken),
    });
  }

  const byEmail = identity.email ? store.userByEmail(identity.email) : undefined;
  if (byEmail) {
    // Never link on email alone: the password proves it is the same person.
    const linkTicket = randomToken();
    store.linkTickets.set(sha256(linkTicket), {
      userId: byEmail.id,
      identity: { provider, subject: identity.subject, email: identity.email },
      expiresAt: nowMs() + POLICY.ticketTtlMs,
    });
    return ok({ status: "link-required", email: byEmail.email, linkTicket });
  }

  const signupTicket = putSignupTicket({
    email: identity.email ?? "",
    name: identity.name,
    emailVerified: identity.emailVerified,
    identity: { provider, subject: identity.subject },
  });
  return ok({
    status: "signup",
    signupTicket,
    email: identity.email,
    name: identity.name,
    emailVerified: identity.emailVerified,
  });
}

/* ---------------------------------------------------------------------- */
/* Recovery Kit, set or replaced from a full session                      */
/* ---------------------------------------------------------------------- */

export function setRecoveryKit(
  session: SessionRecord,
  raw: { wrappedVaultKey: unknown; verifierHex: unknown }
): Outcome<{ saved: true }> {
  if (stageOf(session) !== "full") return fail(403, "Please finish signing in first.");
  const user = userFor(session);
  if (!user) return fail(401, "Please sign in again.");
  const recovery = parseRecovery(raw);
  if (!recovery) return fail(400, "The Recovery Kit is not acceptable.");
  user.recovery = recovery;
  return ok({ saved: true });
}

/* ---------------------------------------------------------------------- */
/* Forgotten password, path A: the phone still works (3.6)                */
/* ---------------------------------------------------------------------- */

export async function startDeviceReset(args: {
  email: unknown;
  deviceId: unknown;
}): Promise<Outcome<SessionGrant>> {
  const email = normaliseEmail(args.email);
  if (!email) return fail(400, "Please enter a valid email address.");
  const user = store.userByEmail(email);
  const device = typeof args.deviceId === "string" ? store.devices.get(args.deviceId) : undefined;
  if (!user || !deviceUsable(device, user.id)) {
    return fail(404, "This phone is not set up for that account. Please use your Recovery Kit.");
  }
  const { session, accessToken } = newSession({
    userId: user.id,
    deviceId: device.id,
    purpose: "reset-with-device",
    needs: ["device", "email-code"],
  });
  await sendCode("reset", user.email);
  return ok(grant(session, accessToken));
}

/* ---------------------------------------------------------------------- */
/* Forgotten password, path B: the Recovery Kit (3.6)                     */
/* ---------------------------------------------------------------------- */

/**
 * Step one: an email code. An unknown address gets a token that can never
 * be completed, so this does not reveal who has an account.
 */
export async function startKitRecovery(rawEmail: unknown): Promise<Outcome<SessionGrant>> {
  const email = normaliseEmail(rawEmail);
  if (!email) return fail(400, "Please enter a valid email address.");
  const user = store.userByEmail(email);
  if (!user) {
    return ok({
      accessToken: randomToken(),
      accessExpiresAt: nowMs() + POLICY.pendingTtlMs,
      stage: "pending",
      needs: ["email-code"],
      deviceId: null,
    });
  }
  const { session, accessToken } = newSession({
    userId: user.id,
    deviceId: null,
    purpose: "recover-with-kit",
    needs: ["email-code"],
  });
  await sendCode("recover", user.email);
  return ok(grant(session, accessToken));
}

export interface RecoveryHold {
  recoveryToken: string;
  releasableAt: number;
}

/**
 * Step two: prove the Recovery Kit code (by a verifier derived from it, never
 * the code itself) and start the 72-hour hold. The Owner is emailed a link
 * that cancels it.
 */
export async function beginKitRecovery(
  session: SessionRecord,
  verifierHex: unknown
): Promise<Outcome<RecoveryHold>> {
  if (session.purpose !== "recover-with-kit" || stageOf(session) !== "reset") {
    return fail(403, "Please confirm your email first.");
  }
  const user = userFor(session);
  if (!user) return fail(401, "Please start again.");
  if (!user.recovery) return fail(409, "This account has no Recovery Kit.");

  const failures = store.recoveryFailures.get(user.id) ?? 0;
  if (failures >= POLICY.recoveryAttempts) {
    return fail(429, "Too many wrong recovery codes. Please contact us for help.");
  }
  if (!isHex(verifierHex, 32) || !slowVerify(verifierHex, user.recovery.verifierHash)) {
    store.recoveryFailures.set(user.id, failures + 1);
    return fail(401, "That recovery code is not right. Please check your Recovery Kit.", {
      remaining: POLICY.recoveryAttempts - failures - 1,
    });
  }
  store.recoveryFailures.delete(user.id);

  const existing = store.activeRecoveryFor(user.id);
  if (existing) existing.cancelledAt = nowMs();

  const recoveryToken = randomToken();
  const cancelToken = randomToken();
  const record = {
    id: `rec-${randomHex(8)}`,
    userId: user.id,
    tokenHash: sha256(recoveryToken),
    cancelTokenHash: sha256(cancelToken),
    startedAt: nowMs(),
    releasableAt: nowMs() + POLICY.recoveryHoldMs,
    cancelledAt: null,
    completedAt: null,
  };
  store.recoveries.set(record.id, record);
  logout(session);
  if (process.env.VIRASAT_E2E === "1" || store.captureCodesForTesting) {
    store.lastCancelTokensForTesting.set(user.email, cancelToken);
  }

  await sendEmail(
    recoveryStarted(templateContext(), {
      email: user.email,
      name: user.name,
      releasableAt: new Date(record.releasableAt),
      cancelToken,
      recoveryId: record.id,
    })
  );

  return ok({ recoveryToken, releasableAt: record.releasableAt });
}

function recoveryByToken(token: unknown) {
  if (typeof token !== "string") return undefined;
  const hash = sha256(token);
  return [...store.recoveries.values()].find((r) => r.tokenHash === hash);
}

export type RecoveryState = "waiting" | "ready" | "cancelled" | "completed";

export function recoveryStatus(
  token: unknown
): Outcome<{ state: RecoveryState; releasableAt: number }> {
  const r = recoveryByToken(token);
  if (!r) return fail(404, "We could not find that recovery.");
  const state: RecoveryState = r.cancelledAt
    ? "cancelled"
    : r.completedAt
      ? "completed"
      : r.releasableAt <= nowMs()
        ? "ready"
        : "waiting";
  return ok({ state, releasableAt: r.releasableAt });
}

/** The Owner's veto. A link alone is enough: cancelling can only delay. */
export function cancelRecovery(cancelToken: unknown): Outcome<{ cancelled: true }> {
  if (typeof cancelToken !== "string") return fail(400, "This link is not complete.");
  const hash = sha256(cancelToken);
  const r = [...store.recoveries.values()].find((x) => x.cancelTokenHash === hash);
  if (!r) return fail(404, "We could not find that recovery.");
  if (!r.completedAt) r.cancelledAt = r.cancelledAt ?? nowMs();
  return ok({ cancelled: true });
}

/** Also from the app, by a signed-in Owner. */
export function cancelRecoveryForUser(session: SessionRecord): Outcome<{ cancelled: boolean }> {
  if (stageOf(session) !== "full") return fail(403, "Please finish signing in first.");
  const r = store.activeRecoveryFor(session.userId);
  if (r) r.cancelledAt = nowMs();
  return ok({ cancelled: !!r });
}

/**
 * After the hold: hands back K_vault wrapped by the kit code, and a session
 * that may only set a new password. Repeatable until the password is set, so
 * a dropped connection here does not cost the user another 72 hours.
 */
export function completeKitRecovery(
  token: unknown
): Outcome<SessionGrant & { wrappedVaultKey: WrappedKey; user: { name: string; email: string } }> {
  const status = recoveryStatus(token);
  if (!status.ok) return status;
  if (status.data.state === "waiting") {
    return fail(425, "Your account is not ready yet.", { releasableAt: status.data.releasableAt });
  }
  if (status.data.state !== "ready") return fail(410, "This recovery has ended.");
  const r = recoveryByToken(token)!;
  const user = store.users.get(r.userId);
  if (!user?.recovery) return fail(410, "This recovery has ended.");

  const { session, accessToken } = newSession({
    userId: user.id,
    deviceId: null,
    purpose: "recover-with-kit",
    needs: [],
  });
  return ok({
    ...grant(session, accessToken),
    wrappedVaultKey: user.recovery.wrappedVaultKey,
    user: { name: user.name, email: user.email },
  });
}

/* ---------------------------------------------------------------------- */
/* Setting the new password (both recovery paths)                          */
/* ---------------------------------------------------------------------- */

export async function resetPassword(
  session: SessionRecord,
  input: {
    kdf: unknown;
    authKeyHex: unknown;
    wrappedVaultKey: unknown;
    recovery?: { wrappedVaultKey: unknown; verifierHex: unknown } | null;
  }
): Promise<Outcome<SessionGrant>> {
  if (stageOf(session) !== "reset") return fail(403, "Please confirm it is you first.");
  const user = userFor(session);
  if (!user) return fail(401, "Please start again.");
  if (!isKdf(input.kdf)) return fail(400, "The key settings are not acceptable.");
  if (!isHex(input.authKeyHex, 32)) return fail(400, "The sign-in proof is missing.");
  if (!isWrappedKey(input.wrappedVaultKey)) return fail(400, "The vault key is missing.");

  // The kit just used is spent. A recovery by kit must hand over a new one.
  let recovery = user.recovery;
  if (session.purpose === "recover-with-kit") {
    const fresh = input.recovery ? parseRecovery(input.recovery) : null;
    if (!fresh) return fail(400, "Please save your new Recovery Kit first.");
    recovery = fresh;
    const active = store.activeRecoveryFor(user.id);
    if (active) active.completedAt = nowMs();
  } else if (input.recovery) {
    recovery = parseRecovery(input.recovery) ?? recovery;
  }

  user.kdf = { ...(input.kdf as KdfParams) };
  user.authHash = slowHash(input.authKeyHex as string);
  user.wrappedVaultKey = input.wrappedVaultKey as WrappedKey;
  user.recovery = recovery;

  store.revokeAllFor(user.id, session.family);
  await sendEmail(
    passwordChanged(templateContext(), { email: user.email, name: user.name, sendId: randomHex(8) })
  );

  session.purpose = "login";
  const accessToken = rotateAccess(session);
  return ok(grant(session, accessToken, issueRefresh(session)));
}

/* ---------------------------------------------------------------------- */
/* Introspection                                                          */
/* ---------------------------------------------------------------------- */

export function describeSession(session: SessionRecord) {
  const user = userFor(session);
  return {
    stage: stageOf(session),
    needs: [...session.needs],
    deviceId: session.deviceId,
    user: user
      ? {
          name: user.name,
          email: user.email,
          hasRecoveryKit: !!user.recovery,
          linkedProviders: store.identitiesFor(user.id).map((i) => i.provider),
        }
      : null,
    device: session.deviceId
      ? (() => {
          const d = store.devices.get(session.deviceId!);
          return d
            ? { id: d.id, name: d.name, biometric: !!d.biometricPublicKey, pinLocked: !d.serverShareHex }
            : null;
        })()
      : null,
    recoveryInProgress: !!store.activeRecoveryFor(session.userId),
  };
}
