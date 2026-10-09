"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { useLocale } from "@/lib/locale/LocaleProvider";
import { useVaultSession } from "@/lib/vault/VaultSession";
import { UnlockScreen } from "@/components/UnlockScreen";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Eyebrow } from "@/components/ui/Page";
import type { VaultItemRecord } from "@/lib/state/mockDatabase";

export default function CategoriesPage() {
  const { taxonomy, ready } = useLocale();
  const { masterKey } = useVaultSession();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<VaultItemRecord[]>([]);

  useEffect(() => {
    if (!masterKey) return;
    let cancelled = false;
    fetch("/api/vault")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) setNotes(data.items);
      })
      .catch((err) => console.error("Could not load notes:", err));
    return () => {
      cancelled = true;
    };
  }, [masterKey]);

  /** How many notes sit under each subcategory, for the count badges. */
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const note of notes) {
      map[note.subcategoryId] = (map[note.subcategoryId] ?? 0) + 1;
    }
    return map;
  }, [notes]);

  if (!masterKey) return <UnlockScreen />;
  if (!ready) return null;

  const toggle = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="pb-10">
      <Eyebrow>Categories</Eyebrow>

      <ul className="divide-y divide-[var(--border)]">
        {taxonomy.map((group) => {
          const open = openGroups[group.id] ?? false;
          const panelId = `group-${group.id}`;
          const groupCount = group.subcategories.reduce(
            (sum, sub) => sum + (counts[sub.id] ?? 0),
            0
          );

          return (
            <li key={group.id}>
              <h2>
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="flex w-full items-center gap-4 py-5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span className="shrink-0 text-[var(--action)]">
                    <CategoryIcon name={group.icon} />
                  </span>
                  <span className="flex-1 text-[19px] font-medium uppercase leading-snug tracking-[0.01em] text-[var(--text)]">
                    {group.label}
                  </span>
                  {groupCount > 0 && (
                    <span className="shrink-0 rounded-full bg-[var(--action-soft)] px-2.5 py-0.5 text-[14px] font-bold text-[var(--action)]">
                      {groupCount}
                    </span>
                  )}
                  <span className="shrink-0 text-[var(--text-faint)]" aria-hidden="true">
                    {open ? <Minus className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
                  </span>
                </button>
              </h2>

              {open && (
                <ul id={panelId} className="ml-3 border-l border-[var(--border)] pb-4 pl-5">
                  {group.subcategories.map((sub) => {
                    const count = counts[sub.id] ?? 0;
                    return (
                      <li key={sub.id} className="relative py-3.5">
                        <span
                          className="absolute -left-5 top-7 h-px w-4 bg-[var(--border)]"
                          aria-hidden="true"
                        />
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/notes/${sub.id}`}
                              className="text-[19px] font-medium leading-snug text-[var(--action)] hover:underline"
                            >
                              {sub.label}
                            </Link>
                            {count > 0 && (
                              <span className="ml-2 align-middle text-[15px] font-semibold text-[var(--text-faint)]">
                                ({count})
                              </span>
                            )}
                            <p className="mt-1.5 text-[16px] leading-relaxed text-[var(--text-faint)]">
                              {sub.helper}
                            </p>
                          </div>

                          <Link
                            href={`/notes/${sub.id}/new`}
                            aria-label={`Add a note under ${sub.label}`}
                            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[var(--action-border)] bg-white text-[var(--action)] transition-colors hover:bg-[var(--action-soft)]"
                          >
                            <Plus className="h-5 w-5" aria-hidden="true" />
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
