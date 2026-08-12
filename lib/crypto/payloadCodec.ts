/**
 * Virasat - Structured Vault Secret Payload Codec
 * Serializes text notes + file attachments into a unified zero-knowledge AES-256-GCM payload.
 */

import { encryptPayload, decryptPayloadToString } from "./aes-gcm";
import { bufferToHex, hexToBuffer, toArrayBuffer } from "./argon2";

export interface VaultSecretPayload {
  textNotes: string;
  fileName?: string;
  fileMimeType?: string;
  fileDataHex?: string;
}

export interface UnpackedSecretResult {
  textNotes: string;
  fileName?: string;
  fileMimeType?: string;
  fileBuffer?: ArrayBuffer;
}

/**
 * Packs text notes & optional file buffer into JSON and encrypts with AES-256-GCM
 */
export async function packAndEncryptSecretPayload(
  textNotes: string,
  fileBuffer: ArrayBuffer | null,
  fileMimeType: string,
  fileName: string,
  key: CryptoKey
) {
  const payloadObj: VaultSecretPayload = {
    textNotes: textNotes || "",
    fileName: fileBuffer ? fileName : undefined,
    fileMimeType: fileBuffer ? fileMimeType : undefined,
    fileDataHex: fileBuffer ? bufferToHex(fileBuffer) : undefined,
  };

  const jsonString = JSON.stringify(payloadObj);
  return encryptPayload(jsonString, key);
}

/**
 * Decrypts AES-256-GCM ciphertext and unpacks text notes + file attachment
 */
export async function decryptAndUnpackSecretPayload(
  ciphertextHex: string,
  ivHex: string,
  key: CryptoKey
): Promise<UnpackedSecretResult> {
  const rawText = await decryptPayloadToString(ciphertextHex, ivHex, key);

  try {
    const parsed = JSON.parse(rawText) as VaultSecretPayload;
    if (parsed && typeof parsed.textNotes === "string") {
      let fileBuffer: ArrayBuffer | undefined = undefined;
      if (parsed.fileDataHex) {
        const u8 = hexToBuffer(parsed.fileDataHex);
        fileBuffer = toArrayBuffer(u8);
      }
      return {
        textNotes: parsed.textNotes,
        fileName: parsed.fileName,
        fileMimeType: parsed.fileMimeType,
        fileBuffer,
      };
    }
  } catch {
    // Legacy fallback if raw binary or raw string was saved
  }

  return {
    textNotes: rawText,
  };
}
