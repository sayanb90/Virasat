import { NextResponse } from "next/server";
import { allVaults } from "@/lib/state/mockDatabase";

/**
 * Called when an invited person opens their invite link and accepts.
 *
 * Public by design: the person accepting is not a Virasat user. The token is
 * 32 random bytes and is the only thing that identifies whose invitation it
 * is, so the lookup runs across every account's vault.
 */
export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ success: false, error: "Missing invite token." }, { status: 400 });
    }

    let friend = null;
    for (const { vault } of allVaults()) {
      friend = vault.acceptTrustedFriend(String(token));
      if (friend) break;
    }
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
