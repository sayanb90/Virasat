"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/lib/locale/LocaleProvider";
import { useVaultSession } from "@/lib/vault/VaultSession";
import { COUNTRY_OPTIONS, type CountryCode } from "@/lib/taxonomy";
import type { AccountSettings } from "@/lib/state/mockDatabase";

interface CycleOption {
  days: number;
  label: string;
}

interface VacationPreset {
  days: number;
  label: string;
}

export default function SettingsPage() {
  const { country, setCountry, taxonomy } = useLocale();
  const { masterKeyHex, lock } = useVaultSession();

  const [open, setOpen] = useState<string | null>(null);
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [cycleOptions, setCycleOptions] = useState<CycleOption[]>([]);
  const [vacationPresets, setVacationPresets] = useState<VacationPreset[]>([]);
  const [onVacation, setOnVacation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealKey, setRevealKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (cancelled || !data.success) return;
        setSettings(data.settings);
        setCycleOptions(data.cycleOptions);
        setVacationPresets(data.vacationPresets ?? []);
        setOnVacation(data.onVacation);
      } catch (err) {
        console.error("Could not load settings:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setOnVacation(data.onVacation);
      }
    } catch (err) {
      console.error("Could not save settings:", err);
    } finally {
      setSaving(false);
    }
  };

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
          <div className="space-y-2">
            {COUNTRY_OPTIONS.map((option) => (
              <Choice
                key={option.code}
                label={option.name}
                selected={option.code === country}
                onSelect={() => setCountry(option.code as CountryCode)}
              />
            ))}
          </div>
          <p className="mt-4 text-[15px] text-[var(--text-faint)]">
            Showing {taxonomy.length} categories and {subcategoryCount} sections.
          </p>
        </Accordion>

        <Accordion
          id="checkin"
          label="Check-in interval"
          open={open === "checkin"}
          onToggle={toggle}
          summary={cycleOptions.find((o) => o.days === settings?.checkInCycleDays)?.label}
        >
          <p className="mb-4 text-[17px] leading-relaxed text-[var(--text-muted)]">
            How long Virasat stays completely silent before it begins gently checking that you are
            alright. Nothing is ever passed on until the whole period has run out and you have not
            answered.
          </p>
          <div className="space-y-2">
            {cycleOptions.map((option) => (
              <Choice
                key={option.days}
                label={option.label}
                selected={settings?.checkInCycleDays === option.days}
                disabled={saving}
                onSelect={() => patch({ checkInCycleDays: option.days })}
              />
            ))}
          </div>
          <SettingsLink href="/heartbeat" label="See where you are in the cycle" />
        </Accordion>

        <Accordion
          id="vacation"
          label="Vacation mode"
          open={open === "vacation"}
          onToggle={toggle}
          summary={onVacation ? "On" : "Off"}
        >
          <p className="mb-4 text-[17px] leading-relaxed text-[var(--text-muted)]">
            Going somewhere without a phone signal? Vacation mode pauses the safety timer so you
            will not be chased while you are away.
          </p>

          {onVacation && settings?.vacationUntil ? (
            <>
              <p className="mb-4 rounded-[12px] bg-[var(--success-soft)] px-4 py-3 text-[17px] leading-relaxed text-[var(--text)]">
                Paused until{" "}
                <strong>
                  {new Date(settings.vacationUntil).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                . We will not contact you before then, and the time you are away is added back
                when you return.
              </p>
              <Button
                size="lg"
                disabled={saving}
                onClick={() => patch({ vacationDays: null })}
              >
                I&apos;m back — resume now
              </Button>
            </>
          ) : (
            <>
              <p className="mb-3 text-[15px] font-semibold text-[var(--action)]">
                How long will you be away?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {vacationPresets.map((preset) => (
                  <Button
                    key={preset.days}
                    variant="secondary"
                    disabled={saving}
                    onClick={() => patch({ vacationDays: preset.days })}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-faint)]">
                Six months is the longest pause at one time. You can pause again as soon as you
                are back, as often as you need.
              </p>
            </>
          )}
        </Accordion>

        <Accordion id="data" label="My data" open={open === "data"} onToggle={toggle}>
          <p className="text-[17px] leading-relaxed text-[var(--text-muted)]">
            Everything you write is scrambled on your device before it is saved. Virasat stores
            only the scrambled version and never holds your passphrase, so nobody here can read
            your notes.
          </p>
          <SettingsLink href="/audit" label="View your security log" />
          <SettingsLink href="/backup" label="Make a backup" />
        </Accordion>

        <Accordion
          id="key"
          label="Your encryption key"
          open={open === "key"}
          onToggle={toggle}
        >
          <p className="mb-4 text-[17px] leading-relaxed text-[var(--text-muted)]">
            This key is produced from your passphrase on this device every time you unlock. It is
            never sent to us, so if you forget your passphrase there is nothing we can do to
            recover your notes.
          </p>

          {revealKey ? (
            <p className="break-all rounded-[12px] bg-[var(--surface-sunken)] p-4 font-mono text-[14px] text-[var(--text)]">
              {masterKeyHex || "Unlock your notes to see this."}
            </p>
          ) : (
            <Button variant="secondary" onClick={() => setRevealKey(true)}>
              Show my key
            </Button>
          )}

          <div className="mt-5">
            <Button variant="danger" onClick={lock}>
              Lock Virasat now
            </Button>
          </div>
        </Accordion>

        <Accordion id="version" label="App version" open={open === "version"} onToggle={toggle}>
          <p className="text-[17px] text-[var(--text-muted)]">Virasat 0.3.0</p>
        </Accordion>
      </div>

      <h2 className="mb-1 mt-9 text-[15px] font-semibold text-[var(--text-faint)]">Your account</h2>
      <ul className="divide-y divide-[var(--border)]">
        <li><SettingsRow href="/beneficiaries" label="Beneficiary" /></li>
        <li><SettingsRow href="/trusted-friends" label="Trusted Friends" /></li>
        <li><SettingsRow href="/audit" label="Security log" /></li>
        <li><SettingsRow href="/help" label="Get support" /></li>
      </ul>
    </div>
  );
}

function Choice({
  label,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex min-h-[56px] w-full items-center justify-between rounded-[14px] border px-4 text-left text-[18px] transition-colors disabled:opacity-50 ${
        selected
          ? "border-[var(--action)] bg-[var(--action-soft)] font-semibold text-[var(--action)]"
          : "border-[var(--border-strong)] bg-white text-[var(--text)] hover:bg-[var(--surface-sunken)]"
      }`}
    >
      <span>{label}</span>
      {selected && <Check className="h-6 w-6 shrink-0" aria-hidden="true" />}
    </button>
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
      {open && <div id={panelId} className="pb-6">{children}</div>}
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
