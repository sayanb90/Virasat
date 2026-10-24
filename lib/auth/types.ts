/**
 * Virasat - Sign-in records.
 *
 * See docs/authentication.md §5. None of these hold a password, a vault key
 * or a PIN: only slow hashes, hashes of random tokens, and blobs the server
 * cannot open.
 */

/** A key wrapped with AES-GCM on the device. Opaque to the server. */
export interface WrappedKey {
  ivHex: string;
  ciphertextHex: string;
}

export interface KdfParams {
  saltHex: string;
  iterations: number;
}

export interface UserRecord {
  id: string;
  name: string;
  /** Lower-cased. */
  email: string;
  emailVerifiedAt: string;
  kdf: KdfParams;
  /** slowHash(K_auth). */
  authHash: string;
  /** K_vault wrapped by K_wrap (from the password). */
  wrappedVaultKey: WrappedKey;
  /**
   * K_vault wrapped by the Recovery Kit code, and a slow hash of a verifier
   * derived from the same code. Null once a kit has been spent and not yet
   * replaced.
   */
  recovery: { wrappedVaultKey: WrappedKey; verifierHash: string } | null;
  createdAt: string;
}

export type SocialProvider = "apple" | "google" | "facebook";

export interface IdentityRecord {
  provider: SocialProvider;
  /** The provider's permanent `sub`. Never the email. */
  subject: string;
  userId: string;
  email: string | null;
  linkedAt: string;
}

/** Public half of a P-256 key, as WebCrypto exports it. */
export type PublicKeyJwk = { kty: "EC"; crv: "P-256"; x: string; y: string };

export interface DeviceRecord {
  id: string;
  userId: string;
  name: string;
  platform: "ios" | "android" | "browser";
  /** Signs challenges on the PIN path. Not biometric-gated. */
  signingPublicKey: PublicKeyJwk;
  /** Signs challenges on the biometric path. Absent without biometrics. */
  biometricPublicKey: PublicKeyJwk | null;
  pinHash: string;
  pinPepper: string;
  /** Half of the PIN key. Deleted after five wrong PINs, and never returned until the PIN is right. */
  serverShareHex: string | null;
  pinFailures: number;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

/** What a session still has to prove before it is good for anything. */
export type Requirement = "device" | "email-code";

/**
 * Why the session exists. A login ends in a full session; a recovery ends in
 * a session that may only set a new password.
 */
export type SessionPurpose = "login" | "reset-with-device" | "recover-with-kit";

export interface SessionRecord {
  id: string;
  userId: string;
  deviceId: string | null;
  purpose: SessionPurpose;
  needs: Requirement[];
  accessHash: string;
  accessExpiresAt: number;
  /** Refresh tokens and sessions of one sign-in share a family, revoked together. */
  family: string;
  /** Challenge issued for the device proof, single use. */
  challenge: string | null;
  createdAt: number;
}

export interface RefreshRecord {
  hash: string;
  family: string;
  userId: string;
  deviceId: string;
  expiresAt: number;
  usedAt: number | null;
}

export type CodePurpose = "signup" | "new-device" | "reset" | "recover";

export interface EmailCodeRecord {
  codeHash: string;
  attempts: number;
  expiresAt: number;
}

/** Handed to the client between steps of sign-up, so no step is skippable. */
export interface SignupTicket {
  email: string;
  name: string | null;
  emailVerified: boolean;
  identity: { provider: SocialProvider; subject: string } | null;
  expiresAt: number;
}

export interface LinkTicket {
  userId: string;
  identity: { provider: SocialProvider; subject: string; email: string | null };
  expiresAt: number;
}

export interface RecoveryRecord {
  id: string;
  userId: string;
  tokenHash: string;
  cancelTokenHash: string;
  startedAt: number;
  releasableAt: number;
  cancelledAt: number | null;
  completedAt: number | null;
}
