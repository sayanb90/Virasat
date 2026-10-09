"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";
import type { VaultItemRecord } from "@/lib/state/mockDatabase";

export default function InheritedNotesPage() {
  const [notes, setNotes] = useState<VaultItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inherited");
        const data = await res.json();
        if (!cancelled && data.success) setNotes(data.notes);
      } catch (err) {
        console.error("Could not load inherited notes:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pb-12">
      <Eyebrow>Inherited notes</Eyebrow>
      <PageTitle>Notes left to you</PageTitle>

      {loading ? (
        <p className="py-10 text-center text-[17px] text-[var(--text-muted)]">Loading…</p>
      ) : notes.length === 0 ? (
        <EmptyState
          body="Notes from people who named you as their Beneficiary will appear here once they are ready to read. They show up only when the moment of transfer arrives."
          action={
            <Link
              href="/help"
              className="text-[18px] font-semibold text-[var(--action)] hover:underline"
            >
              Learn how this works
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-[16px] border border-[var(--border)] bg-white p-4"
            >
              <p className="text-[19px] font-bold text-[var(--text)]">{note.title}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
