"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Eyebrow, PageTitle } from "@/components/ui/Page";

/**
 * Route-level error boundary.
 *
 * Without this, a thrown error hands a 65+ user Next.js's own error page — a
 * stack trace in development and a bare "Application error" in production.
 * The wording here deliberately says nothing about what broke: it reassures,
 * because the first fear this product raises is "have I lost it all?"
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No telemetry service wired in yet; the console is the record.
    console.error(error);
  }, [error]);

  return (
    <div className="pb-10">
      <Eyebrow>Something went wrong</Eyebrow>
      <PageTitle>This screen could not load</PageTitle>

      <div className="px-6">
        <p className="text-[17px] leading-relaxed text-[var(--text-muted)] max-w-[36ch]">
          Nothing has been lost. Your notes are still encrypted and safe — this
          was a problem showing you this one screen.
        </p>

        <div className="mt-8 space-y-3">
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" size="lg" variant="secondary">
            Go to the home screen
          </ButtonLink>
        </div>

        {error.digest && (
          <p className="mt-8 text-[14px] text-[var(--text-muted)]">
            If you need to tell us about this, the reference is{" "}
            <span className="font-mono">{error.digest}</span>.
          </p>
        )}
      </div>
    </div>
  );
}
