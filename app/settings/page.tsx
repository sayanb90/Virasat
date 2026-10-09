"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/Page";
import { useLocale } from "@/lib/locale/LocaleProvider";
import { COUNTRY_OPTIONS, type CountryCode } from "@/lib/taxonomy";

export default function SettingsPage() {
  const { country, setCountry, taxonomy, ready } = useLocale();
  const [open, setOpen] = useState<string | null>("country");

  if (!ready) return null;

  const toggle = (id: string) => setOpen((prev) => (prev === id ? null : id));
  const subcategoryCount = taxonomy.reduce((n, g) => n + g.subcategories.length, 0);

  return (
    <div className="pb-12">
      <Eyebrow>Settings</Eyebrow>
      <PageTitle>Settings</PageTitle>

      <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        <Accordion
          id="country"
          label="Country"
          open={open === "country"}
          onToggle={toggle}
          summary={COUNTRY_OPTIONS.find((c) => c.code === country)?.name}
        >
          <p className="mb-4 text-[17px] leading-relaxed text-[var(--text-muted)]">
            Your country decides which categories and examples Virasat shows you. Your notes are
            not moved or changed when you switch.
          </p>
          <ul className="space-y-2">
            {COUNTRY_OPTIONS.map((option) => {
              const selected = option.code === country;
              return (
                <li key={option.code}>
                  <button
                    type="button"
                    onClick={() => setCountry(option.code as CountryCode)}
                    aria-pressed={selected}
                    className={`flex min-h-[56px] w-full items-center justify-between rounded-[14px] border px-4 text-left text-[18px] transition-colors ${
                      selected
                        ? "border-[var(--action)] bg-[var(--action-soft)] font-semibold text-[var(--action)]"
                        : "border-[var(--border-strong)] bg-white text-[var(--text)] hover:bg-[var(--surface-sunken)]"
                    }`}
                  >
                    <span>{option.name}</span>
                    {selected && <Check className="h-6 w-6 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[15px] text-[var(--text-faint)]">
            Showing {taxonomy.length} categories and {subcategoryCount} sections.
          </p>
        </Accordion>

        <Accordion id="checkin" label="Check-in interval" open={open === "checkin"} onToggle={toggle}>
          <p className="text-[17px] leading-relaxed text-[var(--text-muted)]">
            Virasat stays silent for most of the year, then checks in gently before anything is
            passed on. You can see where you are in that cycle on the safety check-in screen.
          </p>
          <SettingsLink href="/heartbeat" label="Open safety check-in" />
        </Accordion>

        <Accordion id="data" label="My data" open={open === "data"} onToggle={toggle}>
          <p className="text-[17px] leading-relaxed text-[var(--text-muted)]">
            Everything you write is encrypted on your device before it is saved. Virasat stores
            only scrambled text and never holds your passphrase, so nobody here can read your
            notes.
          </p>
          <SettingsLink href="/audit" label="View your security log" />
        </Accordion>

        <Accordion id="version" label="App version" open={open === "version"} onToggle={toggle}>
          <p className="text-[17px] text-[var(--text-muted)]">Virasat 0.2.0 — foundation release</p>
        </Accordion>
      </div>

      <h2 className="mb-1 mt-9 text-[15px] font-semibold text-[var(--text-faint)]">
        Your account
      </h2>
      <ul className="divide-y divide-[var(--border)]">
        <li>
          <SettingsRow href="/beneficiaries" label="Beneficiary" />
        </li>
        <li>
          <SettingsRow href="/audit" label="Security log" />
        </li>
        <li>
          <SettingsRow href="/help" label="Get support" />
        </li>
      </ul>
    </div>
  );
}

function Accordion({
  id,
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  summary?: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const panelId = `settings-${id}`;
  return (
    <div>
      <h2>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[64px] w-full items-center gap-3 text-left"
        >
          <span className="flex-1 text-[19px] text-[var(--text)]">{label}</span>
          {summary && !open && (
            <span className="text-[17px] text-[var(--text-faint)]">{summary}</span>
          )}
          <span className="shrink-0 text-[var(--text-faint)]" aria-hidden="true">
            {open ? <Minus className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </span>
        </button>
      </h2>
      {open && (
        <div id={panelId} className="pb-6">
          {children}
        </div>
      )}
    </div>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex min-h-[48px] items-center gap-1.5 text-[18px] font-semibold text-[var(--action)] hover:underline"
    >
      {label}
      <ChevronRight className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}

function SettingsRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[64px] items-center justify-between gap-3 text-[19px] font-bold text-[var(--ink-800)] transition-colors hover:text-[var(--action)]"
    >
      {label}
      <ChevronRight className="h-6 w-6 shrink-0 text-[var(--text-faint)]" aria-hidden="true" />
    </Link>
  );
}
