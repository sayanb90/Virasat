import { NextResponse } from "next/server";
import { db, BeneficiaryRecord } from "@/lib/state/mockDatabase";

// GET /api/beneficiaries
export async function GET() {
  const beneficiaries = db.getBeneficiaries();
  const envelopes = db.getEnvelopes();

  return NextResponse.json({
    success: true,
    beneficiaries,
    envelopes,
  });
}

// POST /api/beneficiaries - Add beneficiary with RSA public key
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, relationship, email, publicKeyPem, privateKeyPem } = body;

    if (!name || !email || !publicKeyPem) {
      return NextResponse.json(
        { success: false, error: "Missing required beneficiary name, email, or public key." },
        { status: 400 }
      );
    }

    const newBen: BeneficiaryRecord = {
      id: `ben-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name,
      relationship: relationship || "Beneficiary",
      email,
      publicKeyPem,
      privateKeyPem,
      status: "Active",
      createdAt: new Date().toISOString(),
    };

    db.addBeneficiary(newBen);

    return NextResponse.json({
      success: true,
      beneficiary: newBen,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/beneficiaries?id=xyz
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing beneficiary ID parameter." }, { status: 400 });
  }

  const deleted = db.deleteBeneficiary(id);
  return NextResponse.json({ success: deleted });
}
