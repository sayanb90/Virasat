"use client";

import React, { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { recoveryInProgress, stopRecovery } from "@/lib/auth/client";
import { messageOf } from "@/components/auth/Fields";

/**
 * Someone has started a Recovery Kit recovery of this account. It opens
 * after a 72-hour hold unless the Owner stops it. The Owner was emailed a
 * link; this says the same thing in the app, where they are now, with the
 * same one-tap stop. If it is them recovering on another phone, they can
 * leave it.
 */
export function RecoveryBanner() {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<"idle" | "stopping" | "stopped">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    recoveryInProgress()
      .then((yes) => !cancelled && setActive(yes))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;
  if (state === "stopped") {
    return (
      <div role="status" className="mt-4 rounded-[16px] border border-[var(--border-strong)] p-4 text-[16px] leading-relaxed">
        Stopped. Nobody can use that recovery to get into your account. If you still have your Recovery Kit, it works
        as before.
      </div>
    );
  }
  return (
    <div role="alert" className="mt-4 rounded-[16px] border-2 border-[var(--danger)] p-4">
      <p className="flex items-start gap-2 text-[17px] font-semibold leading-snug text-[var(--text)]">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
        Someone is using your Recovery Kit to get into your account.
      </p>
      <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-muted)]">
        If this is not you, stop it now. If it is you, on another phone, you can leave it.
      </p>
      {error && <p className="mt-2 text-[15px] text-[var(--danger)]">{error}</p>}
      <div className="mt-3">
        <Button
          variant="danger"
          disabled={state === "stopping"}
          onClick={async () => {
            setState("stopping");
            setError("");
            try {
              await stopRecovery();
              setState("stopped");
            } catch (err) {
              setError(messageOf(err));
              setState("idle");
            }
          }}
        >
          {state === "stopping" ? "Stopping…" : "This is not me, stop it"}
        </Button>
      </div>
    </div>
  );
}
