"use client";

import React, { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Heading } from "./Fields";

/**
 * The Recovery Kit (docs/authentication.md 3.6, path B).
 *
 * The code is shown here and on the printed page, and nowhere else: the
 * server holds only K_vault wrapped by it, and a verifier. It can be
 * postponed, but not skipped silently.
 */
export function RecoveryKit({
  code,
  email,
  onDone,
  onLater,
}: {
  code: string;
  email: string;
  onDone: () => void;
  onLater?: () => void;
}) {
  const [kept, setKept] = useState(false);

  return (
    <div>
      <Heading
        title="Your Recovery Kit"
        body="If you ever forget your password and lose this phone, this code is the only way back into your notes."
      />

      <div className="recovery-kit rounded-[18px] border-2 border-[var(--marigold)] bg-white p-6 text-center">
        <p className="text-[15px] font-semibold text-[var(--text-muted)]">Virasat Recovery Kit for</p>
        <p className="mt-1 text-[17px] font-semibold text-[var(--text)]">{email}</p>
        <p
          className="mt-5 break-all font-mono text-[26px] font-bold leading-snug tracking-[0.06em] text-[var(--text)]"
          aria-label="Your recovery code"
          data-testid="recovery-code"
        >
          {code}
        </p>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--text-muted)]">
          Keep this with your will or important papers. Anyone who has this page <em>and</em> your
          email can open your notes, after a 72-hour wait that you would be told about.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          <Printer className="h-5 w-5" aria-hidden="true" />
          Print this page
        </Button>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={kept}
            onChange={(e) => setKept(e.target.checked)}
            className="mt-1 h-6 w-6 shrink-0 accent-[var(--action)]"
          />
          <span className="text-[17px] leading-relaxed text-[var(--text)]">
            I have printed it or written it down, and put it somewhere safe
          </span>
        </label>

        <Button size="lg" disabled={!kept} onClick={onDone}>
          Continue
        </Button>

        {onLater && (
          <button
            type="button"
            onClick={onLater}
            className="block w-full py-2 text-center text-[16px] text-[var(--text-muted)] underline"
          >
            Remind me later
          </button>
        )}

        <p className="text-[15px] leading-relaxed text-[var(--text-faint)]">
          Without this kit, a forgotten password and a lost phone mean nobody can open your notes —
          not even us.
        </p>
      </div>
    </div>
  );
}
