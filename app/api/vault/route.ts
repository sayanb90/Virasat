import { NextResponse } from "next/server";
import { db, VaultItemRecord } from "@/lib/state/mockDatabase";

// GET /api/vault - Retrieve all zero-knowledge encrypted vault item records
export async function GET() {
  const items = db.getVaultItems();
  return NextResponse.json({
    success: true,
    count: items.length,
    items,
  });
}

// POST /api/vault - Save or update encrypted ciphertext blob
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, title, category, mimeType, ciphertextHex, ivHex, encryptedChestKeyHex, assignedBeneficiaryIds } = body;

    if (!title || !ciphertextHex || !ivHex) {
      return NextResponse.json(
        { success: false, error: "Missing required ciphertext payload parameters." },
        { status: 400 }
      );
    }

    const itemRecord: VaultItemRecord = {
      id: id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title,
      category: category || "Credentials",
      mimeType: mimeType || "text/plain",
      ciphertextHex,
      ivHex,
      encryptedChestKeyHex: encryptedChestKeyHex || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

// DELETE /api/vault?id=xyz - Delete encrypted vault item
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing item ID parameter." }, { status: 400 });
  }

  const deleted = db.deleteVaultItem(id);
  return NextResponse.json({ success: deleted });
}
