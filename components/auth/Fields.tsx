"use client";

import React from "react";

/** The input style every sign-in screen shares. Large type, 60px tall. */
export const INPUT =
  "min-h-[60px] w-full rounded-[14px] border border-[var(--border-strong)] bg-white px-4 text-[18px] " +
  "text-[var(--text)] outline-none transition-colors focus:border-[var(--action)]";

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[15px] font-semibold text-[var(--action)]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/** Six digits: an email code or a PIN. Big, spaced, numeric keyboard. */
export function DigitsField({
  id,
  label,
  value,
  onChange,
  hint,
  secret = false,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
  secret?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type={secret ? "password" : "text"}
        inputMode="numeric"
        autoComplete={secret ? "off" : "one-time-code"}
        pattern="[0-9]*"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={`${INPUT} text-center text-[26px] tracking-[0.5em]`}
      />
    </Field>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-[16px] leading-relaxed text-[var(--danger)]">
      {children}
    </p>
  );
}

export function Heading({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <div className="mb-8 mt-6 text-center">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[var(--text)]">{title}</h1>
      {body && (
        <p className="mx-auto mt-3 max-w-[34ch] text-[17px] leading-relaxed text-[var(--text-muted)]">{body}</p>
      )}
    </div>
  );
}

/** A password good enough to also be the vault's only lock. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Please use at least 10 characters.";
  if (/^(.)\1+$/.test(password)) return "Please do not repeat one character.";
  return null;
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}
