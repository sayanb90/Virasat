"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, Pause, ShieldCheck, TriangleAlert } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";
import type { PhaseInfo } from "@/lib/state/heartbeatMachine";

interface SafetyState {
  simulatedElapsedDays: number;
  phaseInfo: PhaseInfo;
  lastCheckInDate: string;
  onVacation: boolean;
  vacationUntil: string | null;
  checkInCycleDays: number;
}

/** Plain-language status, deliberately free of phase numbers and percentages. */
function describe(state: SafetyState): {
  tone: "calm" | "paused" | "attention";
  headline: string;
  detail: string;
} {
  if (state.onVacation && state.vacationUntil) {
    const until = new Date(state.vacationUntil).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return {
      tone: "paused",
      headline: "Your safety timer is paused",
      detail: `You told us you are away until ${until}. We will not contact you before then, and the time you are away is added back when you return.`,
    };
  }

  if (state.phaseInfo.isTriggered) {
    return {
      tone: "attention",
      headline: "Your notes are being passed on",
      detail:
        "We did not hear from you in time, so your Beneficiary is being given access. Check in now if you are alright.",
    };
  }

  if (state.phaseInfo.phase === 0) {
    return {
      tone: "calm",
      headline: "You are all set",
      detail:
        "There is nothing for you to do. Virasat stays quiet and will only get in touch if a long time passes without hearing from you.",
    };
  }

  return {
    tone: "attention",
    headline: "We have been trying to reach you",
    detail: `Please confirm you are well. If we do not hear from you within ${state.phaseInfo.daysRemaining} days, we will begin passing your notes on.`,
  };
}

export default function SafetyCheckInPage() {
  const [state, setState] = useState<SafetyState | null>(null);
  const [saving, setSaving] = useState(false);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/heartbeat");
        const data = await res.json();
        if (!cancelled && data.success) setState(data);
      } catch (err) {
        console.error("Could not load safety state:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const checkIn = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/heartbeat", { method: "POST" });
      if ((await res.json()).success) {
        setJustCheckedIn(true);
        setReloadToken((n) => n + 1);
      }
    } catch (err) {
      console.error("Check-in failed:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  if (!state) {
    return <p className="py-14 text-center text-[17px] text-[var(--text-muted)]">Loading…</p>;
  }

  const status = describe(state);
  const Icon =
    status.tone === "calm" ? CircleCheck : status.tone === "paused" ? Pause : TriangleAlert;
  const accent =
    status.tone === "calm"
      ? { bg: "var(--success-soft)", fg: "var(--success)" }
      : status.tone === "paused"
        ? { bg: "var(--action-soft)", fg: "var(--action)" }
        : { bg: "var(--marigold-soft)", fg: "var(--marigold)" };

  const lastCheckIn = new Date(state.lastCheckInDate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pb-12">
      <Eyebrow>Safety check-in</Eyebrow>
      <PageTitle>Are you well?</PageTitle>

      <div
        className="rounded-[18px] p-5"
        style={{ backgroundColor: accent.bg }}
      >
        <Icon
          className="mb-3 h-10 w-10"
          style={{ color: accent.fg }}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <h2 className="text-[22px] font-bold leading-snug text-[var(--text)]">
          {status.headline}
        </h2>
        <p className="mt-2 text-[17px] leading-relaxed text-[var(--text)]">{status.detail}</p>
      </div>

      {justCheckedIn && (
        <p role="status" className="mt-4 text-[17px] font-semibold text-[var(--success)]">
          Thank you — we have noted that you are well.
        </p>
      )}

      {!state.onVacation && (
        <div className="mt-6">
          <Button size="lg" onClick={checkIn} disabled={saving}>
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            {saving ? "One moment…" : "I am safe and well"}
          </Button>
        </div>
      )}

      <dl className="mt-9 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        <div className="flex items-baseline justify-between gap-4 py-4">
          <dt className="text-[17px] text-[var(--text-muted)]">Last heard from you</dt>
          <dd className="text-[17px] font-semibold text-[var(--text)]">{lastCheckIn}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-4">
          <dt className="text-[17px] text-[var(--text-muted)]">You check in</dt>
          <dd className="text-[17px] font-semibold text-[var(--text)]">
            {state.checkInCycleDays === 365
              ? "Once a year"
              : `Every ${state.checkInCycleDays} days`}
          </dd>
        </div>
        {!state.onVacation && !state.phaseInfo.isTriggered && (
          <div className="flex items-baseline justify-between gap-4 py-4">
            <dt className="text-[17px] text-[var(--text-muted)]">Quiet for another</dt>
            <dd className="text-[17px] font-semibold text-[var(--text)]">
              {state.phaseInfo.daysRemaining} days
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
        <Link
          href="/settings"
          className="text-[18px] font-semibold text-[var(--action)] hover:underline"
        >
          {state.onVacation ? "Manage vacation mode" : "Going away? Pause check-ins"}
        </Link>
        <Link
          href="/beneficiaries"
          className="text-[18px] font-semibold text-[var(--action)] hover:underline"
        >
          Who receives your notes
        </Link>
      </div>
    </div>
  );
}
