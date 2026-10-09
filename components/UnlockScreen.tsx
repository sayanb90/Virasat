"use client";

import React, { useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { deriveMasterKey } from "@/lib/crypto/argon2";
import { useVaultSession } from "@/lib/vault/VaultSession";
import { Button } from "@/components/ui/Button";

/** Demo salt. A real deployment stores a per-user salt alongside the account. */
const DEMO_SALT = "e4f81c90a1b2c3d4e5f6";

export function UnlockScreen() {
  const { unlock } = useVaultSession();
  const [passphrase, setPassphrase] = useState("VirasatMaster2026!#");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleUnlock = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!passphrase || busy) return;

    setBusy(true);
    setError("");
    try {
      const derived = await deriveMasterKey(passphrase, DEMO_SALT);
      unlock(derived.key, derived.keyRawHex);
    } catch (err) {
      console.error("Unlock failed:", err);
      setError("We could not open your notes with that passphrase. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-10">
      <div className="mx-auto mb-7 flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-[var(--action-soft)] text-[var(--action)]">
        <Lock className="h-9 w-9" strokeWidth={1.75} aria-hidden="true" />
      </div>

      <h1 className="text-center text-[28px] font-bold leading-tight text-[var(--text)]">
        Welcome back
      </h1>
      <p className="mx-auto mt-3 max-w-[34ch] text-center text-[17px] leading-relaxed text-[var(--text-muted)]">
        Enter your passphrase to open your notes. Only you can unlock them — we never hold a copy.
      </p>

      <div className="mx-auto mt-9 max-w-[380px] space-y-4">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => handleUnlock()}
          disabled={busy}
        >
          <Fingerprint className="h-6 w-6" aria-hidden="true" />
          Unlock with Touch ID or Face ID
        </Button>

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[14px] font-medium text-[var(--text-faint)]">or</span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label
              htmlFor="passphrase"
              className="mb-2 block text-[15px] font-semibold text-[var(--action)]"
            >
              Your passphrase
            </label>
            <input
              id="passphrase"
              type="password"
              required
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="min-h-[60px] w-full rounded-[14px] border border-[var(--border-strong)] bg-white px-4 text-[18px] text-[var(--text)] outline-none transition-colors focus:border-[var(--action)]"
            />
          </div>

          {error && (
            <p role="alert" className="text-[16px] text-[var(--danger)]">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Opening your notes…" : "Open my notes"}
          </Button>
        </form>
      </div>
    </div>
  );
}
