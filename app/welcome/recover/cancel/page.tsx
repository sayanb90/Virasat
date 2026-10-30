"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cancelRecoveryByLink } from "@/lib/auth/client";
import { Heading, messageOf } from "@/components/auth/Fields";

/**
 * "This is not me — stop it", from the recovery-started email.
 *
 * The cancel token travels after the `#`, so it is never sent to a server
 * by the browser or seen by a mail provider's link scanner. Opening the link
 * is the intent; there is nothing more to confirm, because cancelling can
 * only ever delay a recovery.
 */
export default function CancelRecoveryPage() {
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    (async () => {
      try {
        await cancelRecoveryByLink(token);
        setState("done");
      } catch (err) {
        setError(messageOf(err));
        setState("failed");
      }
    })();
  }, []);

  if (state === "working") return null;

  return (
    <div className="pb-8">
      <ShieldCheck className="mx-auto mt-10 h-14 w-14 text-[var(--success)]" strokeWidth={1.5} aria-hidden="true" />
      {state === "done" ? (
        <Heading
          title="Stopped"
          body="Nobody can use that recovery now. Your password, your notes and your phone are exactly as they were. If you think someone has your Recovery Kit, sign in and make a new one in Settings."
        />
      ) : (
        <Heading title="We could not stop it from this link" body={error} />
      )}
    </div>
  );
}
