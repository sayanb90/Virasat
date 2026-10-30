"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { changePassword } from "@/lib/auth/client";
import { ErrorText, Field, INPUT, messageOf, passwordProblem } from "./Fields";

/**
 * Settings → Signing in → Change password. The current password is asked
 * again even though the vault is open: someone at an unlocked phone must
 * not be able to take the account.
 */
export function ChangePassword({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const problem = next ? passwordProblem(next) : null;
  const mismatch = again.length > 0 && again !== next ? "The two new passwords are not the same." : null;
  const ready = current.length > 0 && next.length > 0 && !problem && again === next;

  if (done) {
    return (
      <p role="status" className="text-[17px] leading-relaxed text-[var(--text)]">
        Your password is changed. Any other phone signed in to Virasat has been signed out, and we have sent you an
        email to say so.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setError("");
        try {
          await changePassword(current, next);
          setDone(true);
          onDone?.();
        } catch (err) {
          setError(messageOf(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field id="current-password" label="Your current password">
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          className={INPUT}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field id="new-password" label="New password" hint={problem ?? undefined}>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className={INPUT}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      <Field id="new-password-again" label="Type the new password again" hint={mismatch ?? undefined}>
        <input
          id="new-password-again"
          type="password"
          autoComplete="new-password"
          className={INPUT}
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy || !ready}>
        {busy ? "Changing…" : "Change my password"}
      </Button>
    </form>
  );
}
