/**
 * Virasat - AES-256-GCM Payload Encryption Module
 * Encrypts vault payload structured items (credentials, notes) & binary files (PDFs/Images)
 * using unique Chest Key (K_chest) or Master Key (K_master).
 */

import { bufferToHex, hexToBuffer, toArrayBuffer } from "./argon2";

export interface EncryptedPayload {
  ciphertextHex: string;
  ivHex: string;
  encryptedAt: string;
  algorithm: string;
}

/**
 * Generate a random 256-bit AES-GCM Chest Key (K_chest)
 */
export async function generateChestKey(): Promise<CryptoKey> {
  console.log("[Virasat Crypto] [AES-GCM] Generating new 256-bit AES-GCM Chest Key...");
  return window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a CryptoKey to hex string for envelope storage.
 */
export async function exportKeyToHex(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const hex = bufferToHex(exported);
  console.log("[Virasat Crypto] [AES-GCM] Exported key to hex preview:", hex.substring(0, 16) + "...");
  return hex;
}

/**
 * Imports a raw hex key string back to AES-GCM CryptoKey.
 */
export async function importKeyFromHex(hexKey: string): Promise<CryptoKey> {
  console.log("[Virasat Crypto] [AES-GCM] Importing key from hex len:", hexKey?.length);
  const buffer = hexToBuffer(hexKey);
  return window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(buffer),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a text or binary buffer payload using AES-256-GCM.
 */
export async function encryptPayload(
  data: string | ArrayBuffer | Uint8Array,
  key: CryptoKey
): Promise<EncryptedPayload> {
  // Generate random 12-byte (96-bit) IV recommended for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ivHex = bufferToHex(iv);

  let dataBuffer: ArrayBuffer;
  if (typeof data === "string") {
    const encoded = new TextEncoder().encode(data);
    dataBuffer = toArrayBuffer(encoded);
  } else if (data instanceof Uint8Array) {
    dataBuffer = toArrayBuffer(data);
  } else {
    dataBuffer = data;
  }

  console.log(
    "[Virasat Crypto] [AES-GCM Encrypt] Input data byteLen:",
    dataBuffer.byteLength,
    "| Generated IV hex:",
    ivHex,
    "(byteLen:", iv.byteLength, ")"
  );

  try {
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      dataBuffer
    );

    const ciphertextHex = bufferToHex(ciphertextBuffer);

    console.log(
      "[Virasat Crypto] [AES-GCM Encrypt Success] Ciphertext byteLen:",
      ciphertextBuffer.byteLength,
      "| Ciphertext hex preview:",
      ciphertextHex.substring(0, 24) + "..."
    );

    return {
      ciphertextHex,
      ivHex,
      encryptedAt: new Date().toISOString(),
      algorithm: "AES-256-GCM",
    };
  } catch (err) {
    console.error("[Virasat Crypto] [AES-GCM Encrypt Error] Failed to encrypt payload:", err);
    throw err;
  }
}

/**
 * Decrypts AES-256-GCM payload into string or ArrayBuffer.
 */
export async function decryptPayloadToBuffer(
  ciphertextHex: string,
  ivHex: string,
  key: CryptoKey
): Promise<ArrayBuffer> {
  console.log(
    "[Virasat Crypto] [AES-GCM Decrypt Start]",
    "| ciphertextHex len:", ciphertextHex?.length,
    "| ivHex:", ivHex, "(len:", ivHex?.length, ")",
    "| Key algorithm:", key?.algorithm?.name
  );

  const ciphertextBytes = hexToBuffer(ciphertextHex);
  const ivBytes = hexToBuffer(ivHex);

  console.log(
    "[Virasat Crypto] [AES-GCM Decrypt Bytes]",
    "| ciphertextBytes byteLen:", ciphertextBytes.byteLength,
    "| ivBytes byteLen:", ivBytes.byteLength
  );

  if (ivBytes.byteLength === 0) {
    throw new Error(`[AES-GCM Decrypt Error] IV byteLength is 0 (ivHex was: "${ivHex}")`);
  }
  if (ciphertextBytes.byteLength === 0) {
    throw new Error(`[AES-GCM Decrypt Error] Ciphertext byteLength is 0 (ciphertextHex length was: ${ciphertextHex?.length})`);
  }

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
      key,
      toArrayBuffer(ciphertextBytes)
    );

    console.log(
      "[Virasat Crypto] [AES-GCM Decrypt Success] Decrypted byteLen:",
      decryptedBuffer.byteLength
    );

    return decryptedBuffer;
  } catch (err) {
    console.error(
      "[Virasat Crypto] [AES-GCM Decrypt OperationError]",
      "| Error name:", (err as Error)?.name,
      "| Message:", (err as Error)?.message,
      "| IV byteLen:", ivBytes.byteLength,
      "| Ciphertext byteLen:", ciphertextBytes.byteLength,
      "| Key type:", key?.type, key?.algorithm
    );
    throw err;
  }
}

/**
 * Decrypts AES-256-GCM payload into UTF-8 text.
 */
export async function decryptPayloadToString(
  ciphertextHex: string,
  ivHex: string,
  key: CryptoKey
): Promise<string> {
  const decryptedBuffer = await decryptPayloadToBuffer(ciphertextHex, ivHex, key);
  return new TextDecoder().decode(decryptedBuffer);
}
