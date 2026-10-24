"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { continueWithProvider, type SocialProvider, type SocialResult } from "@/lib/auth/client";
import { ErrorText, Field, INPUT, messageOf } from "./Fields";

const PROVIDERS: Array<{ id: SocialProvider; label: string }> = [
  { id: "apple", label: "Continue with Apple" },
  { id: "google", label: "Continue with Google" },
  { id: "facebook", label: "Continue with Facebook" },
];

/**
 * Apple, Google and Facebook. Apple is first: App Store rule 4.8 requires it
 * wherever the others are offered (docs/authentication.md §6).
 *
 * Until the native sheets exist (phase 4), the server's only provider driver
 * is the stub, so a tap opens a test sheet that asks for the name and email
 * a provider would have sent. Nothing here talks to Apple, Google or Meta.
 */
export function SocialButtons({ onResult }: { onResult: (r: SocialResult) => void }) {
  const [sheet, setSheet] = useState<SocialProvider | null>(null);

  return (
    <div className="space-y-3">
      {PROVIDERS.map((p) => (
        <Button key={p.id} variant="secondary" size="lg" onClick={() => setSheet(p.id)}>
          {p.label}
        </Button>
      ))}
      {sheet && (
        <TestProviderSheet
          provider={sheet}
          onClose={() => setSheet(null)}
          onResult={(r) => {
            setSheet(null);
            onResult(r);
          }}
        />
      )}
    </div>
  );
}

function TestProviderSheet({
  provider,
  onClose,
  onResult,
}: {
  provider: SocialProvider;
  onClose: () => void;
  onResult: (r: SocialResult) => void;
}) {
  const name = provider[0].toUpperCase() + provider.slice(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [shareEmail, setShareEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      onResult(
        await continueWithProvider(provider, {
          name: fullName.trim(),
          email: shareEmail ? email.trim().toLowerCase() : null,
          emailVerified: shareEmail,
        })
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Test ${name} sign-in`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-[520px] rounded-t-[22px] bg-white p-6 sm:rounded-[22px]">
        <h2 className="text-[22px] font-bold text-[var(--text)]">Test {name} sign-in</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
          This build has no real {name} sign-in yet. Enter what {name} would share with Virasat:
          only a name and an email.
        </p>
        <div className="mt-5 space-y-4">
          <Field id="social-name" label="Name">
            <input id="social-name" className={INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field id="social-email" label={`Email on the ${name} account`}>
            <input
              id="social-email"
              type="email"
              className={INPUT}
              value={email}
              disabled={!shareEmail}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {provider === "facebook" && (
            <label className="flex items-center gap-3 text-[16px] text-[var(--text)]">
              <input
                type="checkbox"
                checked={!shareEmail}
                onChange={(e) => setShareEmail(!e.target.checked)}
                className="h-5 w-5 accent-[var(--action)]"
              />
              This Facebook account has no email
            </label>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-3">
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={busy || !fullName.trim() || (shareEmail && !email.includes("@"))}
              onClick={submit}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
