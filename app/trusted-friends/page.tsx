"use client";

import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";

export default function TrustedFriendsPage() {
  return (
    <div className="pb-10">
      <Eyebrow>Trusted Friends</Eyebrow>
      <PageTitle>Trusted Friends</PageTitle>
      <EmptyState
        title="You have not invited anyone yet"
        body="A Trusted Friend is someone who can confirm you are well if you stop answering our check-ins. Invite at least one person — we suggest two. Each person has to accept before they count."
        action={
          <Button size="lg" variant="secondary" disabled>
            Invite a Trusted Friend
          </Button>
        }
      />
      <p className="mt-2 text-center text-[15px] text-[var(--text-faint)]">
        Invitations are coming in the next release.
      </p>
    </div>
  );
}
