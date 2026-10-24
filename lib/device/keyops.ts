/**
 * Virasat - What a phone can DO with its keys.
 *
 * Storage is not enough. On a real phone the biometric keys live in the
 * Secure Enclave (iOS) or Keystore (Android) and their private halves never
 * leave the hardware — so JavaScript cannot hold them as CryptoKeys, and
 * cannot sign or unwrap with them. It can only ask the platform to.
 *
 * So the operations are the interface, and a key is whatever the platform
 * needs to find it again:
 *
 *   browser harness   a WebCrypto CryptoKey (webCryptoKeyOps, below)
 *   phone             the alias of a hardware key (lib/device/native.ts)
 *
 * Biometrics belong to the key, not to a separate prompt. Using a key made
 * with .biometryCurrentSet IS what shows Face ID; an Android key that needs
 * user authentication IS what BiometricPrompt unlocks. That is why
 * `biometricUnlock` is one call: one prompt, both operations.
 */

import {
  generateSigningKey,
  signChallenge,
  unwrapBytes,
  wrapBytes,
  type PublicKeyJwk,
  type WrappedKey,
} from "../crypto/keys";

/** A key held by this phone. Never the private key material itself on a phone. */
export type DeviceKey = CryptoKey | NativeKeyRef;

/** A hardware key, found by alias. JSON-safe, so it can be stored. */
export interface NativeKeyRef {
  alias: string;
}

export function isNativeKey(key: DeviceKey): key is NativeKeyRef {
  return typeof (key as NativeKeyRef).alias === "string";
}

/**
 * Thrown when someone has added a face or fingerprint since Face ID was set
 * up. The OS has invalidated the biometric keys — deliberately: a new face
 * must not inherit access. The app falls back to the PIN and says why.
 */
export class BiometricsChangedError extends Error {
  constructor() {
    super(
      "Your Face ID or fingerprint settings have changed, so Virasat needs your PIN this time. " +
        "You can turn Face ID back on in Settings."
    );
    this.name = "BiometricsChangedError";
  }
}

export interface KeyOps {
  /** A P-256 signing key. `biometric` keys need Face ID / fingerprint for every use. */
  createSigningKey(alias: string, biometric: boolean): Promise<{ key: DeviceKey; publicJwk: PublicKeyJwk }>;
  /** A key that wraps K_vault. Only ever used for the biometric copy. */
  createWrapKey(alias: string, biometric: boolean): Promise<DeviceKey>;
  /** Signs the server's challenge; raw r‖s, base64url. */
  sign(key: DeviceKey, challenge: string): Promise<string>;
  /** Wraps K_vault with a wrap key. Called once, at enrolment. */
  wrap(key: DeviceKey, bytes: Uint8Array): Promise<WrappedKey>;
  /**
   * One prompt, both operations: sign the challenge with the biometric
   * signing key, and unwrap the biometric copy of K_vault. Resolves null if
   * the person cancelled. Throws BiometricsChangedError if the keys have been
   * invalidated.
   */
  biometricUnlock(args: {
    signingKey: DeviceKey;
    wrapKey: DeviceKey;
    copy: WrappedKey;
    challenge: string;
    reason: string;
  }): Promise<{ signature: string; vaultKeyBytes: Uint8Array } | null>;
  /** Deletes hardware keys that are no longer needed. A no-op in the browser. */
  discard(keys: DeviceKey[]): Promise<void>;
}

function asCryptoKey(key: DeviceKey): CryptoKey {
  if (isNativeKey(key)) {
    throw new Error("A phone's hardware key reached the browser key operations.");
  }
  return key;
}

/**
 * The browser harness. Exactly the behaviour this app had before key
 * operations moved behind an interface, so Cucumber and Playwright exercise
 * the same flows as before. Not a security boundary: a browser has no
 * secure enclave, and the "prompt" is a stand-in.
 */
export function createWebCryptoKeyOps(prompt: (reason: string) => Promise<boolean> = async () => true): KeyOps {
  return {
    async createSigningKey() {
      const { privateKey, publicJwk } = await generateSigningKey();
      return { key: privateKey, publicJwk };
    },
    async createWrapKey() {
      return globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ]);
    },
    // async, so a wrong key is a rejected promise like any other failure,
    // not a synchronous throw that skips the caller's .catch().
    async sign(key, challenge) {
      return signChallenge(asCryptoKey(key), challenge);
    },
    async wrap(key, bytes) {
      return wrapBytes(bytes, asCryptoKey(key));
    },
    async biometricUnlock({ signingKey, wrapKey, copy, challenge, reason }) {
      if (!(await prompt(reason))) return null;
      const signature = await signChallenge(asCryptoKey(signingKey), challenge);
      const vaultKeyBytes = await unwrapBytes(copy, asCryptoKey(wrapKey));
      return { signature, vaultKeyBytes };
    },
    async discard() {
      /* CryptoKeys are garbage-collected with the state that held them */
    },
  };
}

export const webCryptoKeyOps: KeyOps = createWebCryptoKeyOps();
