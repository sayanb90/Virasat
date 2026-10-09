"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";

export function DrawerNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape, and lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/45 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className={`fixed inset-y-0 left-0 z-50 w-[86%] max-w-[340px] outline-none
          bg-gradient-to-b from-[var(--ink-900)] via-[var(--ink-700)] to-[#4a5b96]
          transition-transform duration-250 ease-out flex flex-col
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex justify-end p-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-12 h-12 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-7 pb-6">
          <ul>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href} className="border-b border-white/15">
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 min-h-[64px] text-[21px] font-bold transition-colors ${
                      active ? "text-white" : "text-white/85 hover:text-white"
                    }`}
                  >
                    {item.external && (
                      <ExternalLink className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                    )}
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <p className="px-7 pb-8 text-[13px] leading-relaxed text-white/60">
          Copyright {new Date().getFullYear()} Virasat.
          <br />
          All rights reserved.
        </p>
      </div>
    </>
  );
}
