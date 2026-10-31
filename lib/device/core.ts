/**
 * Virasat - What a phone holds, and how tier two uses it (the Authentication design page (Notion) §4).
 *
 * Pure crypto, no storage and no screens. The platform decides where the keys
 * live and what stands in front of them, through KeyOps (./keyops.ts):
 *
 *   | Key                  | iOS                                   | Android                                  | Browser harness        |
 *   | signingKey           | Secure Enclave, no biometric gate     | Keystore (StrongBox if present)          | IndexedDB              |
 *   | biometricSigningKey  | Secure Enclave, .biometryCurrentSet   | Keystore, BIOMETRIC_STRONG, invalidated  | IndexedDB, fake prompt |
 *   | biometricWrapKey     | Secure Enclave, .biometryCurrentSet   |   by a new fingerprint or face           | IndexedDB, fake prompt |
 *
 * Every function takes the KeyOps to use and defaults to the browser's, so
 * the Cucumber specs exercise exactly these functions.
 */

import {
  derivePinKey,
  randomSecretHex,
  unwrapBytes,
  wrapBytes,
  type PublicKeyJwk,
  type WrappedKey,
} from "../crypto/keys";
import { webCryptoKeyOps, type DeviceKey, type KeyOps } from "./keyops";

export interface DeviceState {
  deviceId: string;
  /** The account this phone belongs to, so sign-in can offer it by name. */
  email: string;
  signingKey: DeviceKey;
  biometricSigningKey: DeviceKey | null;
  biometricWrapKey: DeviceKey | null;
  /** This phone's half of the PIN key. */
  deviceSecretHex: string;
  /** K_vault, wrapped by HKDF(device secret ‖ server share). */
  pinCopy: WrappedKey;
  /**
   * K_vault, wrapped by the biometric-gated key. On a phone the hardware's
   * own format (ECIES on iOS, RSA-OAEP on Android) in `ciphertextHex`, with
   * no separate IV. It never leaves the phone.
   */
  biometricCopy: WrappedKey | null;
}

export interface PreparedEnrolment {
  signingKey: DeviceKey;
  signingPublicKey: PublicKeyJwk;
  biometricSigningKey: DeviceKey | null;
  biometricPublicKey: PublicKeyJwk | null;
  biometricWrapKey: DeviceKey | null;
  deviceSecretHex: string;
}

/**
 * Hardware keys are found again by alias. A fresh prefix per enrolment means
 * re-enrolling never overwrites keys the current enrolment still uses; the
 * old ones are discarded once the new enrolment is saved.
 */
function newAliasPrefix(): string {
  return `virasat.${randomSecretHex(8)}`;
}

/** Step one: make this phone's keys. The public halves go to the server. */
export async function prepareEnrolment(
  withBiometrics: boolean,
  ops: KeyOps = webCryptoKeyOps
): Promise<PreparedEnrolment> {
  const prefix = newAliasPrefix();
  const signing = await ops.createSigningKey(`${prefix}.signing`, false);
  const biometric = withBiometrics ? await ops.createSigningKey(`${prefix}.biometric`, true) : null;
  const biometricWrapKey = withBiometrics ? await ops.createWrapKey(`${prefix}.wrap`, true) : null;
  return {
    signingKey: signing.key,
    signingPublicKey: signing.publicJwk,
    biometricSigningKey: biometric?.key ?? null,
    biometricPublicKey: biometric?.publicJwk ?? null,
    biometricWrapKey,
    deviceSecretHex: randomSecretHex(),
  };
}

/** Step two: with the server's share in hand, wrap this phone's copies of K_vault. */
export async function finishEnrolment(
  prepared: PreparedEnrolment,
  args: { deviceId: string; email: string; serverShareHex: string; vaultKeyBytes: Uint8Array },
  ops: KeyOps = webCryptoKeyOps
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
      ? await ops.wrap(prepared.biometricWrapKey, args.vaultKeyBytes)
      : null,
  };
}

/** Every key an enrolment made, for discarding it. */
export function keysOf(state: Pick<DeviceState, "signingKey" | "biometricSigningKey" | "biometricWrapKey">): DeviceKey[] {
  return [state.signingKey, state.biometricSigningKey, state.biometricWrapKey].filter(
    (k): k is DeviceKey => k !== null
  );
}

/**
 * Face ID / Touch ID / fingerprint: one prompt releases both the signing key
 * (for the server) and the wrap key (for this phone's copy of K_vault).
 * Resolves null if the person cancelled. Throws BiometricsChangedError if a
 * face or fingerprint has been added since enrolment.
 *
 * The copy is opened at the prompt, before the server has seen the
 * signature: on a phone the two cannot be separated without a second prompt.
 * The caller keeps the bytes only if the server accepts.
 */
export async function unlockWithBiometrics(
  state: DeviceState,
  challenge: string,
  reason = "Open your notes",
  ops: KeyOps = webCryptoKeyOps
): Promise<{ signature: string; vaultKeyBytes: Uint8Array } | null> {
  if (!state.biometricSigningKey || !state.biometricWrapKey || !state.biometricCopy) {
    throw new Error("Face ID is not set up on this phone.");
  }
  return ops.biometricUnlock({
    signingKey: state.biometricSigningKey,
    wrapKey: state.biometricWrapKey,
    copy: state.biometricCopy,
    challenge,
    reason,
  });
}

/** PIN path, part one: prove the phone. The server checks the PIN itself. */
export async function signForPin(state: DeviceState, challenge: string, ops: KeyOps = webCryptoKeyOps): Promise<string> {
  return ops.sign(state.signingKey, challenge);
}

/** PIN path, part two: the server's share has come back; open the PIN copy. */
export async function openPinCopy(state: DeviceState, serverShareHex: string): Promise<Uint8Array> {
  const pinKey = await derivePinKey(state.deviceSecretHex, serverShareHex);
  return unwrapBytes(state.pinCopy, pinKey);
}
