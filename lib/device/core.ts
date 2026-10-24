/**
 * Virasat - What a phone holds, and how tier two uses it (docs/authentication.md §4).
 *
 * Pure crypto, no storage and no prompts. The platform decides where the
 * keys live and what stands in front of them:
 *
 *   | Key                  | Native (phase 3)                        | Browser harness        |
 *   | signingKey           | Keychain / Keystore, no biometric gate  | IndexedDB              |
 *   | biometricSigningKey  | Secure Enclave, .biometryCurrentSet     | IndexedDB, fake prompt |
 *   | biometricWrapKey     | Keychain, .biometryCurrentSet           | IndexedDB, fake prompt |
 *
 * The same functions run under Cucumber, so the specs exercise what ships.
 */

import {
  derivePinKey,
  generateSigningKey,
  randomSecretHex,
  signChallenge,
  unwrapBytes,
  wrapBytes,
  type PublicKeyJwk,
  type WrappedKey,
} from "../crypto/keys";

export interface DeviceState {
  deviceId: string;
  /** The account this phone belongs to, so sign-in can offer it by name. */
  email: string;
  signingKey: CryptoKey;
  biometricSigningKey: CryptoKey | null;
  biometricWrapKey: CryptoKey | null;
  /** This phone's half of the PIN key. */
  deviceSecretHex: string;
  /** K_vault, wrapped by HKDF(device secret ‖ server share). */
  pinCopy: WrappedKey;
  /** K_vault, wrapped by the biometric-gated key. */
  biometricCopy: WrappedKey | null;
}

export interface PreparedEnrolment {
  signingKey: CryptoKey;
  signingPublicKey: PublicKeyJwk;
  biometricSigningKey: CryptoKey | null;
  biometricPublicKey: PublicKeyJwk | null;
  biometricWrapKey: CryptoKey | null;
  deviceSecretHex: string;
}

/** Step one: make this phone's keys. The public halves go to the server. */
export async function prepareEnrolment(withBiometrics: boolean): Promise<PreparedEnrolment> {
  const signing = await generateSigningKey();
  const biometric = withBiometrics ? await generateSigningKey() : null;
  const biometricWrapKey = withBiometrics
    ? await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ])
    : null;
  return {
    signingKey: signing.privateKey,
    signingPublicKey: signing.publicJwk,
    biometricSigningKey: biometric?.privateKey ?? null,
    biometricPublicKey: biometric?.publicJwk ?? null,
    biometricWrapKey,
    deviceSecretHex: randomSecretHex(),
  };
}

/** Step two: with the server's share in hand, wrap this phone's copies of K_vault. */
export async function finishEnrolment(
  prepared: PreparedEnrolment,
  args: { deviceId: string; email: string; serverShareHex: string; vaultKeyBytes: Uint8Array }
): Promise<DeviceState> {
  const pinKey = await derivePinKey(prepared.deviceSecretHex, args.serverShareHex);
  return {
    deviceId: args.deviceId,
    email: args.email,
    signingKey: prepared.signingKey,
    biometricSigningKey: prepared.biometricSigningKey,
    biometricWrapKey: prepared.biometricWrapKey,
    deviceSecretHex: prepared.deviceSecretHex,
    pinCopy: await wrapBytes(args.vaultKeyBytes, pinKey),
    biometricCopy: prepared.biometricWrapKey
      ? await wrapBytes(args.vaultKeyBytes, prepared.biometricWrapKey)
      : null,
  };
}

/**
 * Face ID / Touch ID: one prompt releases both the signing key (for the
 * server) and the wrap key (for this phone's copy of K_vault).
 */
export async function unlockWithBiometrics(
  state: DeviceState,
  challenge: string
): Promise<{ signature: string; open: () => Promise<Uint8Array> }> {
  if (!state.biometricSigningKey || !state.biometricWrapKey || !state.biometricCopy) {
    throw new Error("Face ID is not set up on this phone.");
  }
  const signature = await signChallenge(state.biometricSigningKey, challenge);
  const wrapKey = state.biometricWrapKey;
  const copy = state.biometricCopy;
  return { signature, open: () => unwrapBytes(copy, wrapKey) };
}

/** PIN path, part one: prove the phone. The server checks the PIN itself. */
export async function signForPin(state: DeviceState, challenge: string): Promise<string> {
  return signChallenge(state.signingKey, challenge);
}

/** PIN path, part two: the server's share has come back; open the PIN copy. */
export async function openPinCopy(state: DeviceState, serverShareHex: string): Promise<Uint8Array> {
  const pinKey = await derivePinKey(state.deviceSecretHex, serverShareHex);
  return unwrapBytes(state.pinCopy, pinKey);
}
