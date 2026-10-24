"use client";

import React from "react";
import { Mail } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/Page";

/**
 * Where a Beneficiary used to open released notes.
 *
 * That page read the Owner's vault without signing in, which only worked
 * while the server had a single, open vault. With accounts it cannot work,
 * and by design it should not: notes are now handed over by email, as a
 * password-protected PDF and a separate email with the code
 * (docs/authentication.md §7, built in phase 3b). Older release emails still
 * link here, so the page stays and says what happens instead.
 */
export default function ClaimPage() {
  return (
    <div className="pb-12">
      <Eyebrow>For family</Eyebrow>
      <PageTitle>Notes left in your care</PageTitle>

      <div className="flex items-start gap-4 rounded-[18px] bg-[var(--action-soft)] p-5">
        <Mail className="mt-1 h-7 w-7 shrink-0 text-[var(--action)]" aria-hidden="true" />
        <div className="space-y-3 text-[17px] leading-relaxed text-[var(--text)]">
          <p>
            When someone leaves notes to you in Virasat, they reach you <strong>by email</strong>:
            one email with the notes as a locked PDF, and a separate email with the code that opens
            it.
          </p>
          <p>There is nothing to sign in to here, and you do not need the Virasat app.</p>
          <p className="text-[var(--text-muted)]">
            If you have been sent a Virasat email asking you to confirm something, please use the
            button in that email.
          </p>
        </div>
      </div>
    </div>
  );
}
