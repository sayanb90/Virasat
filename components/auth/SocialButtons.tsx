"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  continueWithProvider,
  continueWithProviderSheet,
  type SocialProvider,
  type SocialResult,
} from "@/lib/auth/client";
import { socialSheets } from "@/lib/auth/socialSheets";
import { ErrorText, Field, INPUT, messageOf } from "./Fields";

const PROVIDERS: Array<{ id: SocialProvider; label: string }> = [
  { id: "apple", label: "Continue with Apple" },
  { id: "google", label: "Continue with Google" },
  { id: "facebook", label: "Continue with Facebook" },
];

/** The literal read is what Next inlines; the branch not taken leaves the bundle. */
const NATIVE = process.env.NEXT_PUBLIC_NATIVE === "1";

/**
 * Apple, Google and Facebook. Apple is first: App Store rule 4.8 requires it
 * wherever the others are offered (docs/authentication.md §6).
 *
 * In the iOS and Android apps a tap opens the provider's own sheet
 * (lib/auth/socialSheets.ts), showing only the providers set up for that
 * platform. In the browser harness, where the server runs the stub driver, a
 * tap opens a test sheet that asks for the name and email a provider would
 * have sent; nothing there talks to Apple, Google or Meta.
 */
export function SocialButtons({ onResult }: { onResult: (r: SocialResult) => void }) {
  const [sheet, setSheet] = useState<SocialProvider | null>(null);
  const [offered, setOffered] = useState<SocialProvider[]>(NATIVE ? [] : PROVIDERS.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!NATIVE) return;
    let cancelled = false;
    void socialSheets().then((s) => !cancelled && setOffered(s.available()));
    return () => {
      cancelled = true;
    };
  }, []);

  const open = async (provider: SocialProvider) => {
    if (!NATIVE) return setSheet(provider);
    setBusy(true);
    setError("");
    try {
      const result = await continueWithProviderSheet(provider);
      if (result) onResult(result);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  // With no provider set up for this platform, there is nothing to offer,
  // and no "or" to draw.
  if (offered.length === 0) return null;
  return (
    <>
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-[14px] font-medium text-[var(--text-faint)]">or</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <div className="space-y-3">
        {PROVIDERS.filter((p) => offered.includes(p.id)).map((p) => (
          <Button key={p.id} variant="secondary" size="lg" disabled={busy} onClick={() => void open(p.id)}>
            {p.label}
          </Button>
        ))}
        <ErrorText>{error}</ErrorText>
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
      <p className="mt-4 text-center text-[15px] leading-relaxed text-[var(--text-muted)]">
        We only take your name and email from these. You will still choose a Virasat password.
      </p>
    </>
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
