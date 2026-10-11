"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";
import { BrandMark } from "./BrandMark";

/** Top-level routes show the menu button; anything deeper shows Back. */
function isNested(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).length > 1;
}

/**
 * The app header.
 *
 * Laid out left-to-right on a single row: control, brand block, status. The
 * brand is deliberately *not* centred and there is no decorative wave under
 * the band — a centred mark flanked by a hamburger and a bell over a wave is
 * the house style of half the category, and the silhouette is the part people
 * recognise. A flat band closed by a marigold keyline is specific to us, and
 * being ~45px shorter than the old header it also gives the content more room.
 *
 * The right-hand affordance says the state in words rather than badging a
 * bell. For a 65+ reader "All well" is legible at a glance where a red dot on
 * an icon is a puzzle — and an unexplained badge is exactly the low-grade
 * alarm this product is supposed to avoid.
 */
export function AppHeader({
  onOpenMenu,
  alertCount = 0,
}: {
  onOpenMenu: () => void;
  alertCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const nested = isNested(pathname);

  const needsAttention = alertCount > 0;
  const statusLabel = needsAttention
    ? `${alertCount} reminder${alertCount === 1 ? "" : "s"}`
    : "All well";

  return (
    <header className="relative">
      <div className="bg-[var(--ink-800)] px-3 pb-3 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-[640px] items-center gap-2">
          {nested ? (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Menu className="h-7 w-7" aria-hidden="true" />
            </button>
          )}

          <Link
            href="/notes"
            aria-label="Virasat home"
            className="flex min-w-0 items-center gap-2.5 rounded-xl py-1 pr-2 text-white transition-opacity hover:opacity-90"
          >
            <BrandMark className="h-[34px] w-[34px] shrink-0 text-[var(--marigold)]" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[21px] font-bold uppercase leading-none tracking-[0.07em]">
                Virasat
              </span>
              <span className="mt-[5px] truncate text-[11.5px] font-medium leading-none tracking-[0.015em] text-white/60">
                Your legacy, kept safe
              </span>
            </span>
          </Link>

          <Link
            href="/heartbeat"
            aria-label={`Safety status: ${statusLabel}`}
            className={`ml-auto flex min-h-[48px] shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
              needsAttention
                ? "border-[var(--marigold)] bg-[var(--marigold)]/15 text-white hover:bg-[var(--marigold)]/25"
                : "border-white/25 text-white/85 hover:border-white/40 hover:text-white"
            }`}
          >
            <span
              className={`h-[9px] w-[9px] shrink-0 rounded-full ${
                needsAttention ? "bg-[var(--marigold)]" : "bg-[var(--success)]"
              }`}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{statusLabel}</span>
          </Link>
        </div>
      </div>

      {/* Closes the band crisply. The old two-crest wave was the single most
          recognisable borrowed element in the whole layout. */}
      <div className="h-[3px] w-full bg-[var(--marigold)]" aria-hidden="true" />
    </header>
  );
}
