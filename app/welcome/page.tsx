"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useLocale } from "@/lib/locale/LocaleProvider";
import { COUNTRY_OPTIONS, type CountryCode } from "@/lib/taxonomy";

const STEPS = [
  {
    title: "Tell us where you live",
    body: "This decides which categories and examples Virasat shows you. You can change it later.",
  },
  {
    title: "Sign in without a password",
    body: "On the next screen, enter your email. We send you a link that signs you in — there is no password to remember or lose.",
  },
  {
    title: "Your notes are encrypted",
    body: "Everything you write is scrambled on your own device, using the same kind of encryption banks rely on.",
  },
  {
    title: "Keep your own backup",
    body: "You can save a copy of your notes to your own Google Drive or iCloud. The copy stays encrypted, and your notes are never stored in a form we can read.",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const { country, setCountry } = useLocale();
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="flex flex-1 flex-col pb-4">
      <div className="flex-1">
        <div className="mb-7 flex justify-center pt-6">
          <GraduationCap
            className="h-16 w-16 text-[var(--ink-700)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>

        <h1 className="text-center text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--text)]">
          Let&apos;s get started
        </h1>
        <p className="mb-9 mt-2 text-center text-[20px] leading-snug text-[var(--text-muted)]">
          with these simple steps
        </p>

        <ol className="space-y-8">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--action)] text-[17px] font-bold text-white"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-bold leading-snug text-[var(--text)]">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-[17px] leading-relaxed text-[var(--text-muted)]">
                  {step.body}
                </p>

                {index === 0 && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-[14px] border border-[var(--border-strong)] bg-white px-4 py-3 focus-within:border-[var(--action)]">
                      <label
                        htmlFor="welcome-country"
                        className="block text-[15px] font-semibold text-[var(--action)]"
                      >
                        Country of residence
                      </label>
                      <select
                        id="welcome-country"
                        value={country}
                        onChange={(e) => setCountry(e.target.value as CountryCode)}
                        className="min-h-[40px] w-full bg-transparent pr-6 pt-1 text-[19px] text-[var(--text)] outline-none"
                      >
                        {COUNTRY_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        className="mt-1 h-6 w-6 shrink-0 accent-[var(--action)]"
                      />
                      <span className="text-[17px] leading-relaxed text-[var(--text)]">
                        I accept Virasat&apos;s terms and conditions
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <BottomBar>
        <Button
          size="lg"
          disabled={!accepted}
          onClick={() => router.push("/welcome/sign-in")}
        >
          Continue
        </Button>
      </BottomBar>
    </div>
  );
}
