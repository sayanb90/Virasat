"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { completeOnboarding } from "@/lib/onboarding";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  if (sent) {
    return (
      <div className="flex flex-1 flex-col pb-4">
        <div className="flex-1 pt-10 text-center">
          <MailCheck
            className="mx-auto mb-7 h-16 w-16 text-[var(--success)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h1 className="text-[28px] font-bold leading-tight text-[var(--text)]">
            Check your email
          </h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-[17px] leading-relaxed text-[var(--text-muted)]">
            We have sent a sign-in link to <strong className="text-[var(--text)]">{email}</strong>.
            Open it on this device and you will be signed in.
          </p>
          <p className="mx-auto mt-6 max-w-[34ch] text-[15px] leading-relaxed text-[var(--text-faint)]">
            This preview does not send real email, so continue straight into the app.
          </p>
        </div>

        <BottomBar>
          <Button
            size="lg"
            onClick={() => {
              completeOnboarding();
              router.replace("/notes");
            }}
          >
            Continue into Virasat
          </Button>
        </BottomBar>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-4">
      <div className="flex-1">
        <div className="mt-4 flex items-start gap-3 rounded-[16px] bg-[var(--action-soft)] p-4">
          <ShieldCheck
            className="mt-[2px] h-6 w-6 shrink-0 text-[var(--action)]"
            aria-hidden="true"
          />
          <p className="text-[16px] leading-relaxed text-[var(--text)]">
            We use 256-bit encryption and never share your information with anyone.
          </p>
        </div>

        <h1 className="mt-10 text-center text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--text)]">
          Sign in easily
        </h1>
        <p className="mt-2 text-center text-[20px] leading-snug text-[var(--text-muted)]">
          without a password
        </p>

        <form
          className="mt-9"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setSent(true);
          }}
        >
          <label
            htmlFor="signin-email"
            className="mb-2 block text-[15px] font-semibold text-[var(--action)]"
          >
            Email address
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="min-h-[60px] w-full rounded-[14px] border border-[var(--border-strong)] bg-white px-4 text-[18px] text-[var(--text)] outline-none focus:border-[var(--action)]"
          />
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-muted)]">
            We will send a link to this address. Opening it signs you in — there is no password to
            remember.
          </p>
          <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
        </form>
      </div>

      <BottomBar>
        <Button size="lg" disabled={!valid} onClick={() => setSent(true)}>
          Continue with email
        </Button>
      </BottomBar>
    </div>
  );
}
