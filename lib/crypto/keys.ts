/**
 * Virasat - The key hierarchy (the Authentication design page (Notion) §2).
 *
 *   password ──Argon2id(salt, 64 MiB, 2 passes)──▶ K_root   (older accounts: PBKDF2, 600k)
 *                                     ├─HKDF("auth")──▶ K_auth  → sent to the server as a login proof
 *                                     └─HKDF("wrap")──▶ K_wrap  → never leaves the device
 *
 *   K_vault (random)  wrapped by K_wrap            → stored on the server
 *                     wrapped by the Recovery Kit  → stored on the server
 *                     wrapped by the PIN key       → stored on the device
 *                     wrapped by the biometric key → stored on the device
 *
 * Runs on the device only. Uses `globalThis.crypto`, so the same code runs in
 * the browser, in the native web view, and under Node for the specs.
 */

import { argon2id } from "hash-wasm";
import { bufferToHex, hexToBuffer, toArrayBuffer } from "./argon2";

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const enc = new TextEncoder();

import { ARGON2ID, kdfAlgorithm, type KdfParams } from "./kdfPolicy";

export { ARGON2ID, KDF_ITERATIONS, kdfAlgorithm, kdfNeedsUpgrade, type KdfAlgorithm, type KdfParams } from "./kdfPolicy";

export interface WrappedKey {
  ivHex: string;
  ciphertextHex: string;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function newKdfParams(): KdfParams {
  return { algorithm: "argon2id", saltHex: bufferToHex(randomBytes(16)), ...ARGON2ID };
}

async function hkdfBase(material: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", toArrayBuffer(material), "HKDF", false, [
    "deriveBits",
    "deriveKey",
  ]);
}

function hkdfParams(info: string, salt: Uint8Array<ArrayBufferLike> = new Uint8Array(0)): HkdfParams {
  return { name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(salt), info: toArrayBuffer(enc.encode(info)) };
}

async function aesKeyFrom(base: CryptoKey, info: string, salt?: Uint8Array<ArrayBufferLike>): Promise<CryptoKey> {
  return subtle().deriveKey(hkdfParams(info, salt), base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function hexFrom(base: CryptoKey, info: string, salt?: Uint8Array<ArrayBufferLike>): Promise<string> {
  return bufferToHex(await subtle().deriveBits(hkdfParams(info, salt), base, 256));
}

/* ---------------------------------------------------------------------- */
/* From the password                                                      */
/* ---------------------------------------------------------------------- */

export interface AccountKeys {
  /** Sent to the server, which stores only a slow hash of it. */
  authKeyHex: string;
  /** Wraps K_vault. Never leaves the device. */
  wrapKey: CryptoKey;
}

async function rootKey(password: string, kdf: KdfParams): Promise<Uint8Array> {
  const salt = hexToBuffer(kdf.saltHex);
  if (kdfAlgorithm(kdf) === "argon2id") {
    return argon2id({
      password: enc.encode(password),
      salt,
      iterations: kdf.iterations,
      memorySize: kdf.memoryKiB ?? ARGON2ID.memoryKiB,
      parallelism: kdf.parallelism ?? ARGON2ID.parallelism,
      hashLength: 32,
      outputType: "binary",
    });
  }
  const pw = await subtle().importKey("raw", toArrayBuffer(enc.encode(password)), "PBKDF2", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await subtle().deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations: kdf.iterations },
      pw,
      256
    )
  );
}

export async function deriveAccountKeys(password: string, kdf: KdfParams): Promise<AccountKeys> {
  const root = await rootKey(password, kdf);
  const base = await hkdfBase(root);
  root.fill(0);
  return {
    authKeyHex: await hexFrom(base, "virasat/auth/v1"),
    wrapKey: await aesKeyFrom(base, "virasat/wrap/v1"),
  };
}

/* ---------------------------------------------------------------------- */
/* The vault key                                                          */
/* ---------------------------------------------------------------------- */

/** A new random K_vault, as raw bytes. Made once, at sign-up. */
export function generateVaultKeyBytes(): Uint8Array {
  return randomBytes(32);
}

/**
 * K_vault as the AES-GCM key the note codec uses. Extractable, because the
 * unlocked app re-wraps it for this phone's Face ID and PIN copies, and for a
 * new Recovery Kit.
 */
export async function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", toArrayBuffer(raw), { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportVaultKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle().exportKey("raw", key));
}

export async function wrapBytes(raw: Uint8Array, wrappingKey: CryptoKey): Promise<WrappedKey> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, wrappingKey, toArrayBuffer(raw));
  return { ivHex: bufferToHex(iv), ciphertextHex: bufferToHex(ct) };
}

/** Throws if the wrapping key is wrong: AES-GCM authenticates. */
export async function unwrapBytes(wrapped: WrappedKey, wrappingKey: CryptoKey): Promise<Uint8Array> {
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(hexToBuffer(wrapped.ivHex)) },
    wrappingKey,
    toArrayBuffer(hexToBuffer(wrapped.ciphertextHex))
  );
  return new Uint8Array(pt);
}

/* ---------------------------------------------------------------------- */
/* The Recovery Kit (the Authentication design page (Notion) 3.6)                          */
/* ---------------------------------------------------------------------- */

/** Crockford base32: no I, L, O or U, so nothing is misread off paper. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 20; // 100 bits

/** `7KQ4-M2XD-9PRT-…`, five groups of four. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  const chars = [...bytes].map((b) => ALPHABET[b & 31]);
  return formatRecoveryCode(chars.join(""));
}

/** Forgiving: lower case, spaces, dashes, O for 0 and I or L for 1 all work. */
export function normaliseRecoveryCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const c of cleaned) if (!ALPHABET.includes(c)) return null;
  return cleaned;
}

export function formatRecoveryCode(code: string): string {
  const clean = normaliseRecoveryCode(code) ?? code;
  return clean.match(/.{1,4}/g)!.join("-");
}

export interface RecoveryKeys {
  wrapKey: CryptoKey;
  /** Proves knowledge of the code to the server without revealing it. */
  verifierHex: string;
}

export async function deriveRecoveryKeys(code: string): Promise<RecoveryKeys> {
  const normalised = normaliseRecoveryCode(code);
  if (!normalised) throw new Error("That is not a complete recovery code.");
  const base = await hkdfBase(enc.encode(normalised));
  const salt = enc.encode("virasat/recovery/v1");
  return {
    wrapKey: await aesKeyFrom(base, "virasat/recovery/wrap/v1", salt),
    verifierHex: await hexFrom(base, "virasat/recovery/verify/v1", salt),
  };
}

/* ---------------------------------------------------------------------- */
/* The PIN key (the Authentication design page (Notion) §4)                                */
/* ---------------------------------------------------------------------- */

/**
 * K_pin = HKDF(device_secret ‖ server_share). Neither half alone opens the
 * PIN copy of K_vault, and the server releases its half only for the right
 * PIN, five tries at most.
 */
export async function derivePinKey(deviceSecretHex: string, serverShareHex: string): Promise<CryptoKey> {
  const material = new Uint8Array([...hexToBuffer(deviceSecretHex), ...hexToBuffer(serverShareHex)]);
  const base = await hkdfBase(material);
  material.fill(0);
  return aesKeyFrom(base, "virasat/pin/v1");
}

export function randomSecretHex(bytes = 32): string {
  return bufferToHex(randomBytes(bytes));
}

/* ---------------------------------------------------------------------- */
/* Device signing keys                                                    */
/* ---------------------------------------------------------------------- */

export type PublicKeyJwk = { kty: "EC"; crv: "P-256"; x: string; y: string };

/** A non-extractable P-256 key pair. Only the public half ever leaves. */
export async function generateSigningKey(): Promise<{ privateKey: CryptoKey; publicJwk: PublicKeyJwk }> {
  const pair = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const jwk = await subtle().exportKey("jwk", pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicJwk: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! },
  };
}

/** Signature as raw r‖s, base64url — what the server verifies (IEEE P1363). */
export async function signChallenge(privateKey: CryptoKey, challenge: string): Promise<string> {
  const sig = new Uint8Array(
    await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, toArrayBuffer(enc.encode(challenge)))
  );
  let binary = "";
  for (const b of sig) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
