"use client";

import React from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2.5 font-semibold rounded-[14px] " +
  "transition-colors select-none disabled:cursor-not-allowed disabled:opacity-45";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--action)] text-white hover:bg-[var(--action-hover)] disabled:bg-[var(--border-strong)]",
  secondary:
    "bg-white text-[var(--action)] border border-[var(--border-strong)] hover:bg-[var(--action-soft)] hover:border-[var(--action-border)]",
  quiet: "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-sunken)]",
  danger: "bg-white text-[var(--danger)] border border-[#f0c8c5] hover:bg-[var(--danger-soft)]",
};

/* Sizes never drop below the 56px senior touch target. */
const SIZES: Record<Size, string> = {
  md: "min-h-[56px] px-5 text-[17px]",
  lg: "min-h-[60px] px-6 text-[18px] w-full",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={twMerge(clsx(BASE, VARIANTS[variant], SIZES[size], className))}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  href: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      className={twMerge(clsx(BASE, VARIANTS[variant], SIZES[size], className))}
      {...props}
    >
      {children}
    </Link>
  );
}
