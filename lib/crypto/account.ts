/**
 * Virasat - The device-side half of sign-up, sign-in and recovery.
 *
 * Each function returns exactly what the server is allowed to see, plus what
 * stays on the device. Keeping that split in one place is the point: a
 * screen cannot accidentally send the password or K_vault, because nothing
 * here returns them in the "send" half.
 */

import {
  deriveAccountKeys,
  deriveRecoveryKeys,
  generateRecoveryCode,
  generateVaultKeyBytes,
  newKdfParams,
  unwrapBytes,
  wrapBytes,
  type KdfParams,
  type WrappedKey,
} from "./keys";

export interface RecoveryKitPayload {
  /** For the printed page only. Never sent. */
  code: string;
  send: { wrappedVaultKey: WrappedKey; verifierHex: string };
}

export async function buildRecoveryKit(vaultKeyBytes: Uint8Array): Promise<RecoveryKitPayload> {
  const code = generateRecoveryCode();
  const { wrapKey, verifierHex } = await deriveRecoveryKeys(code);
  return { code, send: { wrappedVaultKey: await wrapBytes(vaultKeyBytes, wrapKey), verifierHex } };
}

export interface PasswordPayload {
  vaultKeyBytes: Uint8Array;
  send: { kdf: KdfParams; authKeyHex: string; wrappedVaultKey: WrappedKey };
}

/** A new account: a fresh K_vault, wrapped by the new password. */
export async function buildNewAccount(password: string): Promise<PasswordPayload> {
  return wrapWithPassword(password, generateVaultKeyBytes());
}

/** The same K_vault under a new password: a reset, or a change. No note is touched. */
export async function wrapWithPassword(
  password: string,
  vaultKeyBytes: Uint8Array
): Promise<PasswordPayload> {
  const kdf = newKdfParams();
  const { authKeyHex, wrapKey } = await deriveAccountKeys(password, kdf);
  return {
    vaultKeyBytes,
    send: { kdf, authKeyHex, wrappedVaultKey: await wrapBytes(vaultKeyBytes, wrapKey) },
  };
}

/** The login proof for an existing account, from the salt the server gave. */
export async function loginProof(password: string, kdf: KdfParams) {
  return deriveAccountKeys(password, kdf);
}

/** Opens K_vault with the password, after a successful sign-in. */
export async function openWithPassword(
  password: string,
  kdf: KdfParams,
  wrapped: WrappedKey
): Promise<Uint8Array> {
  const { wrapKey } = await deriveAccountKeys(password, kdf);
  return unwrapBytes(wrapped, wrapKey);
}

/** Opens K_vault with the Recovery Kit code, after the 72-hour hold. */
export async function openWithRecoveryCode(code: string, wrapped: WrappedKey): Promise<Uint8Array> {
  const { wrapKey } = await deriveRecoveryKeys(code);
  return unwrapBytes(wrapped, wrapKey);
}

export async function recoveryVerifier(code: string): Promise<string> {
  return (await deriveRecoveryKeys(code)).verifierHex;
}
