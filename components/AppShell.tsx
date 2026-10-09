"use client";

import React, { useState } from "react";
import { AppHeader } from "@/components/ui/AppHeader";
import { DrawerNav } from "@/components/ui/DrawerNav";
import { LocaleProvider } from "@/lib/locale/LocaleProvider";
import { VaultSessionProvider } from "@/lib/vault/VaultSession";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <LocaleProvider>
      <VaultSessionProvider>
        <div className="flex min-h-dvh flex-col bg-white">
          <AppHeader onOpenMenu={() => setMenuOpen(true)} alertCount={1} />
          <DrawerNav open={menuOpen} onClose={() => setMenuOpen(false)} />
          <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4">{children}</main>
        </div>
      </VaultSessionProvider>
    </LocaleProvider>
  );
}
