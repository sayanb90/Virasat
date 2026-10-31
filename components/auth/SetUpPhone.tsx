"use client";

import React, { useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { setUpThisPhone } from "@/lib/auth/client";
import { useBiometrics as usePhoneBiometrics } from "@/lib/device/useBiometrics";
import { DigitsField, ErrorText, Heading, messageOf } from "./Fields";

/** Weak PINs a stranger would try first. */
const OBVIOUS = new Set(["000000", "111111", "123456", "654321", "121212", "112233"]);

/**
 * Face ID / Touch ID and a PIN for this phone (the Authentication design page (Notion) 3.1 step
 * 4). The PIN is always set: biometrics fail with wet hands or a cracked
 * sensor, and the PIN is what still works.
 */
export function SetUpPhone({ onDone }: { onDone?: () => void }) {
  const biometrics = usePhoneBiometrics();
  const [useBiometrics, setUseBiometrics] = useState(true);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const problem =
    pin.length < 6
      ? null
      : OBVIOUS.has(pin)
        ? "That PIN is easy to guess. Please choose another."
        : confirm.length === 6 && confirm !== pin
          ? "The two PINs are not the same."
          : null;
  const ready = pin.length === 6 && confirm === pin && !problem;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await setUpThisPhone({ pin, useBiometrics: useBiometrics && biometrics.available });
      onDone?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Heading
        title="Lock Virasat on this phone"
        body="Each time you open Virasat, it will ask for your face or your PIN, so nobody else can read your notes."
      />

      <div className="space-y-6">
        {biometrics.available && (
          <label className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-[var(--border-strong)] p-4">
            <input
              type="checkbox"
              checked={useBiometrics}
              onChange={(e) => setUseBiometrics(e.target.checked)}
              className="mt-1 h-6 w-6 shrink-0 accent-[var(--action)]"
            />
            <span className="text-[17px] leading-relaxed text-[var(--text)]">
              <Fingerprint className="mr-1 inline h-5 w-5 align-[-3px] text-[var(--action)]" aria-hidden="true" />
              <strong>Use {biometrics.label}</strong>
              <span className="block text-[15px] text-[var(--text-muted)]">
                The quickest way in. Your PIN still works if it does not.
              </span>
            </span>
          </label>
        )}

        <DigitsField
          id="new-pin"
          label="Choose a PIN of six numbers"
          value={pin}
          onChange={setPin}
          secret
          hint="Not your bank PIN, and not your birthday."
        />
        <DigitsField id="confirm-pin" label="Type the PIN again" value={confirm} onChange={setConfirm} secret />

        <ErrorText>{problem || error}</ErrorText>

        <Button size="lg" disabled={!ready || busy} onClick={submit}>
          {busy ? "Setting up…" : "Lock with this PIN"}
        </Button>
      </div>
    </div>
  );
}
