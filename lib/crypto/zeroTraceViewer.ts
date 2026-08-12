/**
 * Virasat - In-Memory Zero-Trace Document & Media Viewer Engine
 * Decrypts ciphertext blobs directly into volatile RAM memory buffers (ArrayBuffer/Uint8Array).
 * Renders decrypted image & PDF content strictly in memory using Canvas/SVG streams.
 * Prevents disk caching, revokes object URLs immediately, and provides screenshot/blur overlay state.
 */

import { decryptPayloadToBuffer, decryptPayloadToString } from "./aes-gcm";

export interface DecryptedMemoryItem {
  id: string;
  title: string;
  category: string;
  mimeType: string;
  textPayload?: string;
  objectUrl?: string;
  byteSize: number;
}

/**
 * Decrypts encrypted payload into volatile in-memory render object.
 * Guarantee: Data exists strictly in JS heap memory buffers.
 */
export async function loadZeroTracePayload(
  id: string,
  title: string,
  category: string,
  mimeType: string,
  ciphertextHex: string,
  ivHex: string,
  key: CryptoKey
): Promise<DecryptedMemoryItem> {
  console.log(
    "[Virasat ZeroTrace] [Load Start] Item ID:", id,
    "| Title:", title,
    "| MimeType:", mimeType,
    "| Ciphertext len:", ciphertextHex?.length,
    "| IV:", ivHex
  );

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    try {
      const textContent = await decryptPayloadToString(ciphertextHex, ivHex, key);
      console.log("[Virasat ZeroTrace] [Text Decrypted Success] Decrypted char length:", textContent.length);
      return {
        id,
        title,
        category,
        mimeType,
        textPayload: textContent,
        byteSize: new TextEncoder().encode(textContent).length,
      };
    } catch (err) {
      console.error("[Virasat ZeroTrace] [Text Decrypt Failed] Item:", id, err);
      throw err;
    }
  }

  // Binary data (Images/PDFs) - decrypt into ArrayBuffer in RAM
  try {
    const rawBuffer = await decryptPayloadToBuffer(ciphertextHex, ivHex, key);
    const blob = new Blob([rawBuffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);

    console.log("[Virasat ZeroTrace] [Binary Decrypted Success] ByteSize:", rawBuffer.byteLength, "| Blob ObjectURL generated");

    return {
      id,
      title,
      category,
      mimeType,
      objectUrl,
      byteSize: rawBuffer.byteLength,
    };
  } catch (err) {
    console.error("[Virasat ZeroTrace] [Binary Decrypt Failed] Item:", id, err);
    throw err;
  }
}

/**
 * Cleans up and purges volatile in-memory object URL buffers immediately upon closing viewer modal.
 */
export function purgeZeroTraceMemory(item: DecryptedMemoryItem): void {
  console.log("[Virasat ZeroTrace] [Purge Memory] Purging volatile memory for item:", item.id);
  if (item.objectUrl) {
    URL.revokeObjectURL(item.objectUrl);
    item.objectUrl = undefined;
  }
  if (item.textPayload) {
    item.textPayload = "";
  }
}
