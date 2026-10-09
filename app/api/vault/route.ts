import { NextResponse } from "next/server";
import { db, VaultItemRecord } from "@/lib/state/mockDatabase";

// GET /api/vault - Retrieve all zero-knowledge encrypted note records
export async function GET() {
  const items = db.getVaultItems();
  return NextResponse.json({
    success: true,
    count: items.length,
    items,
  });
}

/**
 * POST /api/vault - Store or replace an encrypted ciphertext blob.
 *
 * An `id` that already exists is treated as an edit: the record is patched in
 * place so createdAt and the original id survive. An unknown or absent id
 * creates a new note.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      title,
      subcategoryId,
      mimeType,
      ciphertextHex,
      ivHex,
      encryptedChestKeyHex,
      assignedBeneficiaryIds,
    } = body;

    if (!title || !ciphertextHex || !ivHex) {
      return NextResponse.json(
        { success: false, error: "Missing required ciphertext payload parameters." },
        { status: 400 }
      );
    }

    if (!subcategoryId) {
      return NextResponse.json(
        { success: false, error: "Missing subcategoryId." },
        { status: 400 }
      );
    }

    if (id && db.getVaultItem(id)) {
      const updated = db.updateVaultItem(id, {
        title,
        subcategoryId,
        mimeType: mimeType || "text/plain",
        ciphertextHex,
        ivHex,
        ...(encryptedChestKeyHex ? { encryptedChestKeyHex } : {}),
        ...(assignedBeneficiaryIds ? { assignedBeneficiaryIds } : {}),
      });

      return NextResponse.json({
        success: true,
        item: updated,
        message: "Encrypted ciphertext blob replaced successfully.",
      });
    }

    const now = new Date().toISOString();
    const itemRecord: VaultItemRecord = {
      id: id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      subcategoryId,
      mimeType: mimeType || "text/plain",
      ciphertextHex,
      ivHex,
      encryptedChestKeyHex: encryptedChestKeyHex || "",
      createdAt: now,
      updatedAt: now,
      assignedBeneficiaryIds: assignedBeneficiaryIds || [],
    };

    db.addVaultItem(itemRecord);

    return NextResponse.json({
      success: true,
      item: itemRecord,
      message: "Encrypted ciphertext blob saved successfully.",
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/vault?id=xyz - Delete an encrypted note record
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing item ID parameter." }, { status: 400 });
  }

  const deleted = db.deleteVaultItem(id);
  return NextResponse.json({ success: deleted });
}
