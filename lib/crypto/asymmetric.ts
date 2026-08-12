/**
 * Virasat - Asymmetric Key Exchange & Beneficiary Envelope Module
 * Manages beneficiary key pair generation (RSA-OAEP 2048/4096 / WebCrypto)
 * Encrypts Chest Key K_chest using beneficiary public key: E_ben(K_chest)
 * Decrypts Chest Key when beneficiary claims their digital inheritance with SK_ben.
 */

import { bufferToHex, hexToBuffer, toArrayBuffer } from "./argon2";

export interface KeyPairResult {
  publicKeyPem: string;
  privateKeyPem: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/**
 * Converts ArrayBuffer to PEM formatted string
 */
function arrayBufferToPem(buffer: ArrayBuffer, type: "PUBLIC KEY" | "PRIVATE KEY"): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  const base64 = btoa(binary);
  const formatted = base64.match(/.{1,64}/g)?.join("\n") || base64;
  return `-----BEGIN ${type}-----\n${formatted}\n-----END ${type}-----`;
}

/**
 * Parses PEM string into ArrayBuffer
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const lines = pem.split("\n");
  const base64 = lines
    .filter((line) => !line.startsWith("-----"))
    .map((line) => line.trim())
    .join("");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return toArrayBuffer(bytes);
}

/**
 * Generates an RSA-OAEP 2048-bit key pair for a designated beneficiary.
 */
export async function generateBeneficiaryKeyPair(): Promise<KeyPairResult> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const spkiBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const pkcs8Buffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKeyPem: arrayBufferToPem(spkiBuffer, "PUBLIC KEY"),
    privateKeyPem: arrayBufferToPem(pkcs8Buffer, "PRIVATE KEY"),
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Imports a beneficiary public key from PEM format.
 */
export async function importPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  const spkiBuffer = pemToArrayBuffer(pem);
  return window.crypto.subtle.importKey(
    "spki",
    spkiBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

/**
 * Imports a beneficiary private key from PEM format.
 */
export async function importPrivateKeyFromPem(pem: string): Promise<CryptoKey> {
  const pkcs8Buffer = pemToArrayBuffer(pem);
  return window.crypto.subtle.importKey(
    "pkcs8",
    pkcs8Buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}

/**
 * Encrypts Chest Key hex string (K_chest) using beneficiary public key: E_ben(K_chest).
 */
export async function encryptChestKeyForBeneficiary(
  chestKeyHex: string,
  beneficiaryPublicKey: CryptoKey
): Promise<string> {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(chestKeyHex);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    beneficiaryPublicKey,
    toArrayBuffer(data)
  );

  return bufferToHex(encryptedBuffer);
}

/**
 * Decrypts E_ben(K_chest) envelope using beneficiary private key (SK_ben).
 */
export async function decryptChestKeyWithBeneficiaryPrivateKey(
  encryptedChestKeyHex: string,
  beneficiaryPrivateKey: CryptoKey
): Promise<string> {
  const encryptedBuffer = hexToBuffer(encryptedChestKeyHex);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    beneficiaryPrivateKey,
    toArrayBuffer(encryptedBuffer)
  );

  return new TextDecoder().decode(decryptedBuffer);
}
