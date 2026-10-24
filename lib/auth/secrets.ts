/**
 * Virasat - Server-side secret handling for sign-in.
 *
 * Everything the server keeps about a credential is a slow hash or a hash of
 * a random token, never the thing itself. `node:crypto` only: no new
 * dependency for primitives the platform already ships.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/** 32 random bytes, URL-safe. Used for session, refresh and ticket tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Tokens are high-entropy, so a fast hash is enough to store them safely. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A six-digit code, uniformly drawn. */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

/**
 * Slow hash for low-entropy or replayable secrets: the login proof `K_auth`,
 * PINs, email codes. Format: `scrypt$<saltHex>$<hashHex>`.
 */
export function slowHash(secret: string, pepper = ""): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pepper + secret, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function slowVerify(secret: string, stored: string, pepper = ""): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pepper + secret, Buffer.from(saltHex, "hex"), expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}

/**
 * A hash computed and thrown away, so a login for an unknown email costs the
 * same time as one for a real account.
 */
const DUMMY_HASH = slowHash(randomHex());
export function burnSlowHash(secret: string): void {
  slowVerify(secret, DUMMY_HASH);
}

/**
 * The server's own secret, for values that must be stable across calls but
 * unguessable: the fake salt for unknown emails. A fresh random secret per
 * process is correct for the in-memory store, which also forgets everything
 * on restart. With persistence this must come from configuration.
 */
const SERVER_SECRET = process.env.AUTH_SERVER_SECRET ?? randomHex();

export function serverHmac(label: string, value: string): string {
  return createHmac("sha256", SERVER_SECRET).update(`${label}:${value}`).digest("hex");
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}
