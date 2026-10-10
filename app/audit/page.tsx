"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";
import type { AuditLogRecord } from "@/lib/state/mockDatabase";

/** Plain-English names for the internal log categories. */
const CATEGORY_LABELS: Record<AuditLogRecord["category"], string> = {
  Crypto: "Encryption",
  ZeroKnowledgeSync: "Saved securely",
  Heartbeat: "Safety check-in",
  Escalation: "Reminders",
  BeneficiaryClaim: "Handover",
};

export default function SecurityLogPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/audit");
        const data = await res.json();
        if (!cancelled && data.success) setLogs(data.logs);
      } catch (err) {
        console.error("Could not load the security log:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return (
    <div className="pb-12">
      <Eyebrow>Security log</Eyebrow>
      <PageTitle>What Virasat has done</PageTitle>

      <div className="mb-6 flex gap-3 rounded-[16px] bg-[var(--action-soft)] p-4">
        <ShieldCheck
          className="mt-[2px] h-6 w-6 shrink-0 text-[var(--action)]"
          aria-hidden="true"
        />
        <p className="text-[16px] leading-relaxed text-[var(--text)]">
          A record of every time your notes were scrambled, saved or checked. It never contains
          what you wrote — only that something happened, and when.
        </p>
      </div>

      {loading ? (
        <p className="py-10 text-center text-[17px] text-[var(--text-muted)]">Loading…</p>
      ) : logs.length === 0 ? (
        <EmptyState body="Nothing has happened on your account yet. Entries will appear here as you use Virasat." />
      ) : (
        <>
          <ol className="space-y-3">
            {logs.map((log) => (
              <li
                key={log.id}
                className="rounded-[16px] border border-[var(--border)] bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[18px] font-bold leading-snug text-[var(--text)]">
                    {log.action}
                  </p>
                  <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[14px] font-semibold text-[var(--text-muted)]">
                    {CATEGORY_LABELS[log.category] ?? log.category}
                  </span>
                </div>
                <p className="mt-1.5 text-[16px] leading-relaxed text-[var(--text-muted)]">
                  {log.details}
                </p>
                <p className="mt-2 text-[15px] text-[var(--text-faint)]">{log.timestamp}</p>
              </li>
            ))}
          </ol>

          <Button variant="secondary" onClick={refresh} className="mt-5 w-full">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Refresh
          </Button>
        </>
      )}
    </div>
  );
}
