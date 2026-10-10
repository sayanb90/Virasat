import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db, TrustedFriendRecord } from "@/lib/state/mockDatabase";

export async function GET() {
  return NextResponse.json({
    success: true,
    friends: db.getTrustedFriends(),
    enabled: db.getSettings().trustedFriendsEnabled,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (db.getTrustedFriends().some((f) => f.email.toLowerCase() === email.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: "You have already invited that person." },
        { status: 409 }
      );
    }

    const friend: TrustedFriendRecord = {
      id: `tf-${Date.now()}-${randomBytes(3).toString("hex")}`,
      name: name || email.split("@")[0],
      email,
      status: "Invited",
      inviteToken: randomBytes(32).toString("base64url"),
      createdAt: new Date().toISOString(),
    };

    db.addTrustedFriend(friend);
    return NextResponse.json({ success: true, friend });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id." }, { status: 400 });
  }
  return NextResponse.json({ success: db.deleteTrustedFriend(id) });
}
