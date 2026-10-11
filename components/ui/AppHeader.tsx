"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";

/** Top-level routes show the menu button; anything deeper shows Back. */
function isNested(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).length > 1;
}

/**
 * The app header.
 *
 * A marigold spine down the left edge, a serif wordmark, and the promise set
 * in small caps beneath it. Three things are deliberate:
 *
 * - **The spine, not a wave.** The old header dissolved into a two-crest wave,
 *   which was the most recognisable borrowed element in the layout. A vertical
 *   edge block is a different device entirely, and it costs no height.
 * - **A serif wordmark.** "Virasat" means inheritance. Every app in this
 *   category sets its name in the same geometric sans next to a shield; a serif
 *   reads as something kept rather than something installed.
 * - **Status in words.** For a 65+ reader "All well" is legible at a glance
 *   where a coloured dot on a bell is a puzzle.
 *
 * The serif is scoped to the wordmark. Body copy stays in Inter, which is more
 * legible at this app's 17px base.
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
    <header className="bg-[var(--ink-900)]">
      <div className="mx-auto flex max-w-[640px] items-stretch">
        {/* The spine runs the full height of the band, safe area included. */}
        <div className="w-[9px] shrink-0 bg-[var(--marigold)]" aria-hidden="true" />

        <div className="flex flex-1 items-center gap-2 pb-3 pl-1 pr-3 pt-[max(12px,env(safe-area-inset-top))]">
          {nested ? (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Menu className="h-7 w-7" aria-hidden="true" />
            </button>
          )}

          <Link
            href="/notes"
            aria-label="Virasat home"
            className="flex min-w-0 flex-col rounded-lg py-1 transition-opacity hover:opacity-90"
          >
            <span className="font-serif text-[27px] font-semibold leading-none tracking-[0.005em] text-white">
              Virasat
            </span>
            <span className="mt-[6px] truncate text-[10.5px] font-semibold uppercase leading-none tracking-[0.16em] text-[var(--marigold)]">
              Your legacy, kept safe
            </span>
          </Link>

          <Link
            href="/heartbeat"
            aria-label={`Safety status: ${statusLabel}`}
            className={`ml-auto flex min-h-[46px] shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
              needsAttention
                ? "bg-[var(--marigold)]/20 text-white hover:bg-[var(--marigold)]/30"
                : "bg-white/[0.08] text-white/85 hover:bg-white/[0.14] hover:text-white"
            }`}
          >
            <span
              className={`h-[8px] w-[8px] shrink-0 rounded-full ${
                needsAttention ? "bg-[var(--marigold)]" : "bg-[#5fcf9b]"
              }`}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{statusLabel}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
