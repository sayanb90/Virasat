"use client";

import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";

export default function BackupPage() {
  return (
    <div className="pb-10">
      <Eyebrow>Backup</Eyebrow>
      <PageTitle>Backup</PageTitle>
      <EmptyState
        title="You do not have a backup yet"
        body="Make your first backup to keep a copy of your notes on your own cloud storage. Your notes stay encrypted, and they are never stored on Virasat's servers."
        action={
          <Button size="lg" variant="secondary" disabled>
            Make a new backup
          </Button>
        }
      />
      <p className="mt-2 text-center text-[15px] text-[var(--text-faint)]">
        Backup to Google Drive and iCloud is coming in the next release.
      </p>
    </div>
  );
}
