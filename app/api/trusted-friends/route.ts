import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isResponse, requireSession } from "@/lib/auth/http";
import { TrustedFriendRecord } from "@/lib/state/mockDatabase";
import { sendEmail, templateContext } from "@/lib/email";
import { trustedFriendInvite } from "@/lib/email/templates";

export async function GET(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  const db = caller.vault;
  return NextResponse.json({
    success: true,
    friends: db.getTrustedFriends(),
    enabled: db.getSettings().trustedFriendsEnabled,
  });
}

export async function POST(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  const db = caller.vault;
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

    // Until now the token was minted, stored, and never sent — the invite
    // link had to be copy-pasted by hand. A failed send does not fail the
    // invite: the record exists, and the link is still shown in the UI.
    const delivery = await sendEmail(
      trustedFriendInvite(templateContext(), {
        friendName: friend.name,
        friendEmail: friend.email,
        ownerName: caller.user.name,
        inviteToken: friend.inviteToken,
      })
    );

    return NextResponse.json({
      success: true,
      friend,
      emailed: delivery.ok,
      ...(delivery.ok ? {} : { emailError: delivery.error }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const caller = requireSession(req);
  if (isResponse(caller)) return caller;
  const db = caller.vault;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id." }, { status: 400 });
  }
  return NextResponse.json({ success: db.deleteTrustedFriend(id) });
}
