/**
 * Virasat - In-memory sign-in store.
 *
 * Same contract as `lib/state/mockDatabase.ts`: in memory, reset on restart,
 * and narrow enough that persistence can go behind it without touching a
 * caller. Restarting logs everyone out, which is the forcing function for a
 * real database noted in docs/authentication.md §8.
 *
 * Lookups only. What a record *means* lives in `flows.ts`.
 */

import type {
  CodePurpose,
  DeviceRecord,
  EmailCodeRecord,
  IdentityRecord,
  LinkTicket,
  RecoveryRecord,
  RefreshRecord,
  SessionRecord,
  SignupTicket,
  UserRecord,
} from "./types";
import { resetRateLimitsForTesting } from "./rateLimit";

class AuthStore {
  /** device id → where to push to it. One token per phone, replaced on refresh. */
  pushTokens = new Map<string, { token: string; platform: "ios" | "android"; updatedAt: string }>();
  users = new Map<string, UserRecord>();
  /** email → user id */
  usersByEmail = new Map<string, string>();
  /** `${provider}:${subject}` → identity */
  identities = new Map<string, IdentityRecord>();
  devices = new Map<string, DeviceRecord>();
  /** accessHash → session */
  sessions = new Map<string, SessionRecord>();
  /** hash → refresh token */
  refreshTokens = new Map<string, RefreshRecord>();
  /** `${purpose}:${email}` → code */
  emailCodes = new Map<string, EmailCodeRecord>();
  /** ticket hash → ticket */
  signupTickets = new Map<string, SignupTicket>();
  linkTickets = new Map<string, LinkTicket>();
  /** nonce → expiry */
  socialNonces = new Map<string, number>();
  recoveries = new Map<string, RecoveryRecord>();
  /** email → failed attempts in the current window */
  loginFailures = new Map<string, { count: number; windowStart: number }>();
  /** user id → wrong recovery codes */
  recoveryFailures = new Map<string, number>();
  /**
   * The last code sent per address, readable only through the
   * VIRASAT_E2E-gated test route. Tests cannot read an inbox.
   */
  lastCodesForTesting = new Map<string, string>();
  /** The cancel link of the last recovery started, per address. Same rules. */
  lastCancelTokensForTesting = new Map<string, string>();
  /** Set by the Cucumber steps, which run without the VIRASAT_E2E harness. */
  captureCodesForTesting = false;

  userByEmail(email: string): UserRecord | undefined {
    const id = this.usersByEmail.get(email.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }

  addUser(user: UserRecord): void {
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
  }

  identity(provider: string, subject: string): IdentityRecord | undefined {
    return this.identities.get(`${provider}:${subject}`);
  }

  addIdentity(identity: IdentityRecord): void {
    this.identities.set(`${identity.provider}:${identity.subject}`, identity);
  }

  identitiesFor(userId: string): IdentityRecord[] {
    return [...this.identities.values()].filter((i) => i.userId === userId);
  }

  devicesFor(userId: string): DeviceRecord[] {
    return [...this.devices.values()].filter((d) => d.userId === userId);
  }

  codeKey(purpose: CodePurpose, email: string): string {
    return `${purpose}:${email.toLowerCase()}`;
  }

  /** Ends every session and refresh token of a sign-in. */
  revokeFamily(family: string): void {
    for (const [hash, s] of this.sessions) if (s.family === family) this.sessions.delete(hash);
    for (const [hash, r] of this.refreshTokens) if (r.family === family) this.refreshTokens.delete(hash);
  }

  /** Ends every sign-in of a user, optionally sparing one. */
  revokeAllFor(userId: string, exceptFamily?: string): void {
    const families = new Set<string>();
    for (const s of this.sessions.values()) if (s.userId === userId) families.add(s.family);
    for (const r of this.refreshTokens.values()) if (r.userId === userId) families.add(r.family);
    families.delete(exceptFamily ?? "");
    for (const f of families) this.revokeFamily(f);
  }

  /** Ends every sign-in made from one device. */
  revokeDevice(deviceId: string): void {
    const families = new Set<string>();
    for (const s of this.sessions.values()) if (s.deviceId === deviceId) families.add(s.family);
    for (const r of this.refreshTokens.values()) if (r.deviceId === deviceId) families.add(r.family);
    for (const f of families) this.revokeFamily(f);
  }

  activeRecoveryFor(userId: string): RecoveryRecord | undefined {
    return [...this.recoveries.values()].find(
      (r) => r.userId === userId && !r.cancelledAt && !r.completedAt
    );
  }

  resetForTesting(): void {
    this.users.clear();
    this.usersByEmail.clear();
    this.identities.clear();
    this.devices.clear();
    this.sessions.clear();
    this.refreshTokens.clear();
    this.emailCodes.clear();
    this.signupTickets.clear();
    this.linkTickets.clear();
    this.socialNonces.clear();
    this.recoveries.clear();
    this.loginFailures.clear();
    this.recoveryFailures.clear();
    this.lastCodesForTesting.clear();
    this.lastCancelTokensForTesting.clear();
    this.pushTokens.clear();
    resetRateLimitsForTesting();
  }
}

export const authStore = new AuthStore();
