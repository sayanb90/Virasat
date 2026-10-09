"use client";

import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";

export default function HelpPage() {
  return (
    <div className="pb-10">
      <Eyebrow>Help Centre</Eyebrow>
      <PageTitle>Help Centre</PageTitle>
      <EmptyState
        body="Guides on setting up your notes, choosing a Beneficiary and understanding the check-in will live here."
      />
    </div>
  );
}
