"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { listPhones, removePhone, type PhoneSummary } from "@/lib/auth/client";
import { messageOf } from "@/components/auth/Fields";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Settings → Your phones. A lost or sold phone is removed from here, on
 * another: its sign-in ends and its PIN stops working at once.
 */
export function YourPhones() {
  const [phones, setPhones] = useState<PhoneSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listPhones()
      .then(setPhones)
      .catch((err) => setError(messageOf(err)));
  }, []);
  useEffect(load, [load]);

  if (!phones) return error ? <p className="text-[16px] text-[var(--text-muted)]">{error}</p> : null;

  return (
    <div>
      <ul className="divide-y divide-[var(--border)]" aria-label="Phones signed in to Virasat">
        {phones.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <Smartphone className="h-6 w-6 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-[var(--text)]">
                {p.name}
                {p.current && <span className="ml-2 text-[15px] font-normal text-[var(--text-muted)]">(this phone)</span>}
              </p>
              <p className="text-[15px] text-[var(--text-muted)]">Last used {when(p.lastSeenAt)}</p>
            </div>
            {!p.current && (
              <Button
                variant="quiet"
                disabled={busy === p.id}
                onClick={async () => {
                  if (!window.confirm(`Remove "${p.name}"? It will be signed out, and its PIN will stop working.`)) return;
                  setBusy(p.id);
                  setError("");
                  try {
                    await removePhone(p.id);
                    load();
                  } catch (err) {
                    setError(messageOf(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[15px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}
