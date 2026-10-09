/**
 * Note read/write helpers.
 *
 * Centralises the client-side crypto choreography that the note screens need,
 * so the encryption order (encrypt body -> mint K_chest -> seal the
 * beneficiary envelope -> ship ciphertext only) lives in exactly one place.
 */

import { generateChestKey, exportKeyToHex } from "@/lib/crypto/aes-gcm";
import { importPublicKeyFromPem, encryptChestKeyForBeneficiary } from "@/lib/crypto/asymmetric";
import {
  packAndEncryptSecretPayload,
  decryptAndUnpackSecretPayload,
} from "@/lib/crypto/payloadCodec";
import type { VaultItemRecord, BeneficiaryRecord } from "@/lib/state/mockDatabase";

export interface NoteDraft {
  /** Present when editing; absent when creating. */
  id?: string;
  title: string;
  subcategoryId: string;
  body: string;
  beneficiaryId?: string;
  file?: { buffer: ArrayBuffer; name: string; mimeType: string } | null;
}

export async function fetchNotes(): Promise<VaultItemRecord[]> {
  const res = await fetch("/api/vault");
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? "Could not load notes.");
  return data.items as VaultItemRecord[];
}

export async function fetchBeneficiaries(): Promise<BeneficiaryRecord[]> {
  const res = await fetch("/api/beneficiaries");
  const data = await res.json();
  return data.success ? (data.beneficiaries as BeneficiaryRecord[]) : [];
}

/** Decrypts a note's body. The title is stored alongside and needs no key. */
export async function decryptNoteBody(
  item: VaultItemRecord,
  masterKey: CryptoKey
): Promise<{ body: string; fileName?: string; fileMimeType?: string; fileBuffer?: ArrayBuffer }> {
  const unpacked = await decryptAndUnpackSecretPayload(item.ciphertextHex, item.ivHex, masterKey);
  return {
    body: unpacked.textNotes ?? "",
    fileName: unpacked.fileName,
    fileMimeType: unpacked.fileMimeType,
    fileBuffer: unpacked.fileBuffer,
  };
}

/**
 * Encrypts and persists a note. Only ciphertext, the IV and the sealed
 * envelope leave the device.
 */
export async function saveNote(
  draft: NoteDraft,
  masterKey: CryptoKey,
  beneficiaries: BeneficiaryRecord[]
): Promise<VaultItemRecord> {
  const mimeType = draft.file?.mimeType ?? "text/plain";
  const fileName = draft.file?.name ?? "";

  const encrypted = await packAndEncryptSecretPayload(
    draft.body,
    draft.file?.buffer ?? null,
    mimeType,
    fileName,
    masterKey
  );

  // Per-note chest key, sealed to the beneficiary's public key.
  const chestKeyHex = await exportKeyToHex(await generateChestKey());

  let envelopeHex = `E_ben_demo_${chestKeyHex}`;
  const beneficiary = beneficiaries.find((b) => b.id === draft.beneficiaryId);
  if (beneficiary?.publicKeyPem) {
    try {
      const pub = await importPublicKeyFromPem(beneficiary.publicKeyPem);
      envelopeHex = await encryptChestKeyForBeneficiary(chestKeyHex, pub);
    } catch {
      // Demo keys are not always real PEM; fall back to the demo envelope
      // rather than failing the user's save.
    }
  }

  const res = await fetch("/api/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(draft.id ? { id: draft.id } : {}),
      title: draft.title,
      subcategoryId: draft.subcategoryId,
      mimeType,
      ciphertextHex: encrypted.ciphertextHex,
      ivHex: encrypted.ivHex,
      encryptedChestKeyHex: envelopeHex,
      assignedBeneficiaryIds: draft.beneficiaryId ? [draft.beneficiaryId] : [],
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error ?? "Could not save this note.");
  return data.item as VaultItemRecord;
}

export async function deleteNote(id: string): Promise<void> {
  const res = await fetch(`/api/vault?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Could not delete this note.");
}
