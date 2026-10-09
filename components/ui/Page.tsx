import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Small grey section label above a page title. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] font-semibold text-[var(--text-faint)] mb-3">{children}</p>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[30px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--text)] mb-6">
      {children}
    </h1>
  );
}

export function Breadcrumb({
  parent,
  current,
}: {
  parent: { label: string; href: string };
  current: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-[15px] leading-snug">
      <Link
        href={parent.href}
        className="font-bold uppercase tracking-wide text-[var(--action)] hover:underline"
      >
        {parent.label}
      </Link>
      <ChevronRight
        className="mx-0.5 inline h-4 w-4 align-[-2px] text-[var(--text-faint)]"
        aria-hidden="true"
      />
      <span className="text-[var(--text-muted)]">{current}</span>
    </nav>
  );
}

/** Dashed-outline placeholder used wherever a list has nothing in it yet. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title?: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14">
      <div
        className="w-[72px] h-[72px] rounded-[18px] border-2 border-dashed border-[var(--border-strong)] flex items-center justify-center mb-7"
        aria-hidden="true"
      >
        <div className="space-y-1.5">
          <span className="block w-7 h-[3px] rounded-full bg-[var(--border-strong)]" />
          <span className="block w-5 h-[3px] rounded-full bg-[var(--border-strong)]" />
          <span className="block w-7 h-[3px] rounded-full bg-[var(--border-strong)]" />
        </div>
      </div>
      {title && (
        <h2 className="text-[20px] font-bold text-[var(--text)] mb-2">{title}</h2>
      )}
      <p className="text-[17px] leading-relaxed text-[var(--text-muted)] max-w-[34ch]">{body}</p>
      {action && <div className="mt-7 w-full max-w-[320px]">{action}</div>}
    </div>
  );
}
