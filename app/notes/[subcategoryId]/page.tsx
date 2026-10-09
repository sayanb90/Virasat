"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useLocale } from "@/lib/locale/LocaleProvider";
import { locateSubcategory } from "@/lib/taxonomy";
import { useVaultSession } from "@/lib/vault/VaultSession";
import { UnlockScreen } from "@/components/UnlockScreen";
import { Breadcrumb, EmptyState } from "@/components/ui/Page";
import { ButtonLink } from "@/components/ui/Button";
import { decryptNoteBody, fetchNotes } from "@/lib/vault/notes";
import type { VaultItemRecord } from "@/lib/state/mockDatabase";

const ALL = "__all__";

export default function SubcategoryNotesPage({
  params,
}: {
  params: Promise<{ subcategoryId: string }>;
}) {
  const { subcategoryId } = use(params);
  const { taxonomy, ready } = useLocale();
  const { masterKey } = useVaultSession();

  const [notes, setNotes] = useState<VaultItemRecord[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // The chip selection is derived from the route, with the user's override
  // scoped to the subcategory they chose it on. Navigating to a sibling
  // therefore resets the filter without needing an effect.
  const [override, setOverride] = useState<{ for: string; value: string } | null>(null);
  const filter = override?.for === subcategoryId ? override.value : subcategoryId;
  const selectFilter = (value: string) => setOverride({ for: subcategoryId, value });

  const location = locateSubcategory(taxonomy, subcategoryId);

  useEffect(() => {
    if (!masterKey) return;
    let cancelled = false;

    (async () => {
      try {
        const all = await fetchNotes();
        if (cancelled) return;
        setNotes(all);

        // Preview text lives inside the ciphertext, so each card needs a
        // decrypt. Failures are per-note and must not blank the whole list.
        const entries = await Promise.all(
          all.map(async (note) => {
            try {
              const { body } = await decryptNoteBody(note, masterKey);
              return [note.id, body] as const;
            } catch {
              return [note.id, ""] as const;
            }
          })
        );
        if (!cancelled) setPreviews(Object.fromEntries(entries));
      } catch (err) {
        console.error("Could not load notes:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [masterKey]);

  if (!masterKey) return <UnlockScreen />;
  if (!ready) return null;

  if (!location) {
    return (
      <div className="pt-4">
        <EmptyState
          title="We could not find that category"
          body="It may have been renamed, or it may not apply in the country you have selected."
          action={<ButtonLink href="/notes" size="lg">Back to categories</ButtonLink>}
        />
      </div>
    );
  }

  const { group, subcategory: sub } = location;
  const groupSubIds = new Set(group.subcategories.map((s) => s.id));
  const groupNotes = notes.filter((n) => groupSubIds.has(n.subcategoryId));

  // Only offer a chip for siblings that actually hold something, so the row
  // stays short on a phone.
  const chipSubs = group.subcategories.filter(
    (s) => s.id === subcategoryId || groupNotes.some((n) => n.subcategoryId === s.id)
  );

  const visible = filter === ALL ? groupNotes : groupNotes.filter((n) => n.subcategoryId === filter);

  return (
    <div className="pb-28">
      <Breadcrumb parent={{ label: group.label, href: "/notes" }} current={sub.label} />

      {chipSubs.length > 1 && (
        <div className="-mx-4 mb-5 flex gap-2.5 overflow-x-auto px-4 pb-1">
          <Chip label="All" active={filter === ALL} onClick={() => selectFilter(ALL)} />
          {chipSubs.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              active={filter === s.id}
              onClick={() => selectFilter(s.id)}
            />
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-[17px] text-[var(--text-muted)]">Opening your notes…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body={sub.helper}
          action={
            <ButtonLink href={`/notes/${sub.id}/new`} size="lg">
              Add your first note
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((note) => {
            const preview = previews[note.id]?.trim();
            return (
              <li key={note.id}>
                <Link
                  href={`/notes/${note.subcategoryId}/${note.id}`}
                  className="block rounded-[16px] border border-[var(--border)] bg-white p-4 transition-colors hover:border-[var(--action-border)] hover:bg-[var(--action-soft)]"
                >
                  <p className="text-[19px] font-bold leading-snug text-[var(--text)]">
                    {note.title}
                  </p>
                  {preview && (
                    <p className="mt-1 line-clamp-2 text-[17px] leading-relaxed text-[var(--text-faint)]">
                      {preview}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Floating add button, matching the reference app's anchored FAB. */}
      <Link
        href={`/notes/${sub.id}/new`}
        aria-label={`Add a note under ${sub.label}`}
        className="fixed bottom-[max(28px,calc(env(safe-area-inset-bottom)+12px))] left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-[20px] bg-[var(--action)] text-white shadow-lg transition-colors hover:bg-[var(--action-hover)]"
      >
        <Plus className="h-8 w-8" aria-hidden="true" />
      </Link>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-5 text-[16px] font-semibold transition-colors ${
        active
          ? "bg-[var(--action)] text-white"
          : "bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:bg-[var(--action-soft)] hover:text-[var(--action)]"
      }`}
    >
      {label}
    </button>
  );
}
