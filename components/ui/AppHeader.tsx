"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Bell, Menu, ShieldCheck } from "lucide-react";
import { HeaderWave } from "./Wave";

/** Top-level routes show the menu button; anything deeper shows Back. */
function isNested(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).length > 1;
}

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

  return (
    <header className="relative">
      <div className="bg-[var(--ink-800)] px-2 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-[640px] items-center justify-between">
          {nested ? (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex h-14 w-14 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="flex h-14 w-14 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Menu className="h-7 w-7" aria-hidden="true" />
            </button>
          )}

          <Link
            href="/notes"
            className="flex items-center gap-2.5 rounded-lg px-2 py-1"
            aria-label="Virasat home"
          >
            <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2} aria-hidden="true" />
            <span className="text-[26px] font-bold tracking-[-0.02em] text-white">Virasat</span>
          </Link>

          <Link
            href="/heartbeat"
            aria-label={
              alertCount > 0
                ? `Safety status, ${alertCount} alert${alertCount === 1 ? "" : "s"}`
                : "Safety status"
            }
            className="relative flex h-14 w-14 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Bell className="h-7 w-7" aria-hidden="true" />
            {alertCount > 0 && (
              <span
                className="absolute right-2 top-2 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--marigold)] px-1 text-[12px] font-bold text-white"
                aria-hidden="true"
              >
                {alertCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      <HeaderWave className="h-[58px] -mt-px" />
    </header>
  );
}
