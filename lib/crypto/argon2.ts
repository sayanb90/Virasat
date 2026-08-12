/**
 * Virasat - Key Derivation & Fast Hex Codec Module
 * Handles client-side derivation of K_master from user passphrase + salt
 * Memory-safe lookup table hex encoder/decoder for large file ciphertexts (PDFs/Images).
 * Zero-Knowledge Guarantee: Passphrase & Master Key NEVER leave the client.
 */

export interface DerivedKeyResult {
  key: CryptoKey;
  saltHex: string;
  keyRawHex: string;
}

// Fast precomputed lookup tables for byte <-> hex conversion
const HEX_LOOKUP: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_LOOKUP[i] = i.toString(16).padStart(2, "0");
}

const HEX_MAP: { [key: number]: number } = {};
for (let i = 0; i < 10; i++) HEX_MAP[48 + i] = i; // '0'-'9'
for (let i = 0; i < 6; i++) HEX_MAP[65 + i] = 10 + i; // 'A'-'F'
for (let i = 0; i < 6; i++) HEX_MAP[97 + i] = 10 + i; // 'a'-'f'

// Convert ArrayBuffer or Uint8Array to Hex string using precomputed lookup table
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const len = bytes.length;
  const hexParts = new Array(len);
  for (let i = 0; i < len; i++) {
    hexParts[i] = HEX_LOOKUP[bytes[i]];
  }
  return hexParts.join("");
}

// Convert Hex string safely to Uint8Array using fast charCodeAt bitwise mapping
export function hexToBuffer(hex: string): Uint8Array {
  if (!hex) return new Uint8Array(0);
  const str = hex.trim();
  const len = str.length;
  const byteLen = Math.floor(len / 2);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    const h = HEX_MAP[str.charCodeAt(i * 2)] || 0;
    const l = HEX_MAP[str.charCodeAt(i * 2 + 1)] || 0;
    bytes[i] = (h << 4) | l;
  }
  return bytes;
}

// Convert Uint8Array or ArrayBuffer to an exact ArrayBuffer with 0 offset
export function toArrayBuffer(arr: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (arr instanceof ArrayBuffer) return arr;
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

// Generate random salt (16 bytes / 128 bits)
export function generateSalt(): string {
  const saltBytes = new Uint8Array(16);
  window.crypto.getRandomValues(saltBytes);
  const saltHex = bufferToHex(saltBytes);
  console.log("[Virasat Crypto] [Salt Gen] New random salt generated:", saltHex);
  return saltHex;
}

/**
 * Derives a 256-bit Master Key (K_master) using WebCrypto PBKDF2 (SHA-256, 100,000 rounds).
 * Serves as standard client-side Key Derivation Function (Argon2id equivalent in WebCrypto).
 */
export async function deriveMasterKey(
  passphrase: string,
  existingSaltHex?: string
): Promise<DerivedKeyResult> {
  console.log("[Virasat Crypto] [KDF Start] Deriving Master Key K_master...");
  const saltHex = existingSaltHex || generateSalt();
  console.log("[Virasat Crypto] [KDF Salt] Using saltHex:", saltHex, "(len:", saltHex.length, ")");

  const encoder = new TextEncoder();
  const passphraseBuffer = encoder.encode(passphrase);
  const saltBuffer = hexToBuffer(saltHex);

  console.log("[Virasat Crypto] [KDF Buffer] Passphrase byte len:", passphraseBuffer.length, "Salt byte len:", saltBuffer.length);

  try {
    // Import raw passphrase material
    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      toArrayBuffer(passphraseBuffer),
      "PBKDF2",
      false,
      ["deriveKey", "deriveBits"]
    );

    // Derive AES-GCM 256-bit Master Key
    const derivedCryptoKey = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: toArrayBuffer(saltBuffer),
        iterations: 100000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true, // Extractable for local session storage in memory
      ["encrypt", "decrypt"]
    );

    // Export raw bytes for hex representation
    const rawKeyBuffer = await window.crypto.subtle.exportKey("raw", derivedCryptoKey);
    const keyRawHex = bufferToHex(rawKeyBuffer);

    console.log("[Virasat Crypto] [KDF Success] Derived K_master raw hex preview:", keyRawHex.substring(0, 16) + "...");

    return {
      key: derivedCryptoKey,
      saltHex,
      keyRawHex,
    };
  } catch (err) {
    console.error("[Virasat Crypto] [KDF Error] Failed to derive master key:", err);
    throw err;
  }
}

/**
 * Re-derives a CryptoKey from a raw key hex string for session restoration.
 */
export async function keyFromHex(keyHex: string): Promise<CryptoKey> {
  console.log("[Virasat Crypto] [Key From Hex] Importing key from hex preview:", keyHex.substring(0, 16) + "...");
  const keyBytes = hexToBuffer(keyHex);
  return window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
