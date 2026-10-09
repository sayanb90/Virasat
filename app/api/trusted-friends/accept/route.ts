import { NextResponse } from "next/server";
import { db } from "@/lib/state/mockDatabase";

/** Called when an invited person opens their invite link and accepts. */
export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ success: false, error: "Missing invite token." }, { status: 400 });
    }

    const friend = db.acceptTrustedFriend(String(token));
    if (!friend) {
      return NextResponse.json(
        { success: false, error: "That invitation link is not valid, or it has been withdrawn." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, friend });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
