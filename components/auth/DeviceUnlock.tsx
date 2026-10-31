"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ApiError, unlockWithFaceId, unlockWithPin, useAuth } from "@/lib/auth/client";
import { deviceBridge } from "@/lib/device/bridge";
import { useBiometrics } from "@/lib/device/useBiometrics";
import { DigitsField, ErrorText, messageOf } from "./Fields";

/**
 * Tier two on a phone that is already set up: Face ID / Touch ID, or the PIN.
 * Used by the unlock screen, by sign-in, and by "forgot password" on this
 * phone (docs/authentication.md 3.3, 3.6).
 */
export function DeviceUnlock({ onDone }: { onDone?: () => void }) {
  const { device } = useAuth();
  const { label } = useBiometrics();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.body.locked) setLocked(true);
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    return (
      <div className="space-y-5">
        <ErrorText>{error}</ErrorText>
        <p className="text-[17px] leading-relaxed text-[var(--text-muted)]">
          This keeps your notes safe if someone else is trying to guess your PIN. Sign in with your
          password once, and you can set a new PIN.
        </p>
        <Link
          href="/welcome/sign-in?existing=1"
          className="block text-center text-[17px] font-semibold text-[var(--action)] underline"
        >
          Sign in with my password
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[380px] space-y-4">
      {device?.biometric && (
        <>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy}
            onClick={() => run(unlockWithFaceId)}
          >
            <Fingerprint className="h-6 w-6" aria-hidden="true" />
            Use {label}
          </Button>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[14px] font-medium text-[var(--text-faint)]">or</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.length === 6) void run(() => unlockWithPin(pin));
        }}
      >
        <DigitsField id="unlock-pin" label="Your PIN" value={pin} onChange={setPin} secret />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" disabled={busy || pin.length !== 6}>
          {busy ? "Opening…" : "Open with PIN"}
        </Button>
      </form>

      {device?.biometric && deviceBridge().platform === "browser" ? (
        <p className="pt-2 text-center text-[14px] leading-relaxed text-[var(--text-faint)]">
          In this browser build, Face ID is simulated. On a phone it uses the real sensor.
        </p>
      ) : null}
    </div>
  );
}
