"use client";

import React, { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { sendPushToken } from "@/lib/auth/client";
import { phoneAlerts, type AlertsState, type PhoneAlerts } from "@/lib/push/alerts";
import { messageOf } from "@/components/auth/Fields";

/**
 * Settings → Alerts on this phone. Only in the iOS and Android apps. An
 * alert comes when someone starts recovering the account, so the Owner can
 * stop it in time; email says the same and always arrives.
 */
export function PhoneAlertsSetting() {
  const [alerts, setAlerts] = useState<PhoneAlerts | null>(null);
  const [state, setState] = useState<AlertsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void phoneAlerts(sendPushToken).then(async (a) => {
      if (cancelled || !a) return;
      setAlerts(a);
      setState(await a.state());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!alerts || !state) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-1 text-[16px] font-semibold text-[var(--text)]">Alerts on this phone</h3>
      {state === "on" ? (
        <p className="flex items-center gap-2 text-[16px] text-[var(--text-muted)]">
          <BellRing className="h-5 w-5 text-[var(--action)]" aria-hidden="true" />
          On. This phone is told at once if someone tries to get into your account.
        </p>
      ) : state === "denied" ? (
        <p className="text-[16px] leading-relaxed text-[var(--text-muted)]">
          Alerts are turned off for Virasat in your phone&apos;s settings. You will still get every alert by email.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[16px] leading-relaxed text-[var(--text-muted)]">
            Be told on this phone, at once, if someone tries to get into your account. The alert never shows what is
            in your notes.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setState(await alerts.enable());
              } catch (err) {
                setError(messageOf(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Turn on alerts
          </Button>
        </>
      )}
      {error && <p className="mt-2 text-[15px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}
