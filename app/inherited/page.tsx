"use client";

import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";

export default function InheritedNotesPage() {
  return (
    <div className="pb-10">
      <Eyebrow>Inherited notes</Eyebrow>
      <PageTitle>Notes left to you</PageTitle>
      <EmptyState
        body="Notes from people who named you as their Beneficiary will appear here once they are ready to read. They show up only when the moment of transfer arrives."
      />
    </div>
  );
}
