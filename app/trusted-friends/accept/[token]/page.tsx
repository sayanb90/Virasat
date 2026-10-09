"use client";

import React, { use, useState } from "react";
import { CircleCheck, HeartHandshake } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/Page";
import { Button, ButtonLink } from "@/components/ui/Button";

/** Where an invited person lands when they open their invitation link. */
export default function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const accept = async () => {
    setState("working");
    try {
      const res = await fetch("/api/trusted-friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "We could not accept that invitation.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("We could not reach Virasat. Please try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="py-12 text-center">
        <CircleCheck
          className="mx-auto mb-6 h-16 w-16 text-[var(--success)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h1 className="text-[28px] font-bold leading-tight text-[var(--text)]">Thank you</h1>
        <p className="mx-auto mt-3 max-w-[36ch] text-[17px] leading-relaxed text-[var(--text-muted)]">
          You are now a Trusted Friend. If they ever stop answering our check-ins, we will contact
          you to ask whether they are alright. There is nothing else for you to do.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <Eyebrow>Trusted Friends</Eyebrow>
      <PageTitle>You have been asked to help</PageTitle>

      <div className="mb-7 flex justify-center">
        <HeartHandshake
          className="h-16 w-16 text-[var(--action)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>

      <p className="text-[17px] leading-relaxed text-[var(--text-muted)]">
        Someone using Virasat has asked you to be one of their Trusted Friends. It is a small
        thing to agree to: if they ever stop answering our check-in messages, we will contact you
        and ask whether they are alright.
      </p>
      <p className="mt-4 text-[17px] leading-relaxed text-[var(--text-muted)]">
        You will not be able to read anything they have written, and you will not hear from us
        unless something seems wrong.
      </p>

      {state === "error" && (
        <p role="alert" className="mt-5 text-[16px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="mt-8 space-y-3">
        <Button size="lg" onClick={accept} disabled={state === "working"}>
          {state === "working" ? "Just a moment…" : "Yes, I will help"}
        </Button>
        <ButtonLink href="/notes" variant="quiet" size="lg">
          Not now
        </ButtonLink>
      </div>
    </div>
  );
}
