"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { DrawerNav } from "@/components/ui/DrawerNav";
import { LocaleProvider } from "@/lib/locale/LocaleProvider";
import { VaultSessionProvider } from "@/lib/vault/VaultSession";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/onboarding";

/** Routes that render without the app chrome, or outside the onboarding gate. */
const BARE_PREFIX = "/welcome";
// An invited Trusted Friend is not a Virasat user, so the welcome flow must
// not stand between them and the invitation they were sent.
const PUBLIC_PREFIXES = ["/welcome", "/trusted-friends/accept", "/claim"];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <VaultSessionProvider>
        <Shell>{children}</Shell>
      </VaultSessionProvider>
    </LocaleProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const onboarded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isBare = pathname.startsWith(BARE_PREFIX);

  // Send a first-time visitor to the welcome flow. Navigation belongs in an
  // effect rather than during render, and the guard keeps it to one push.
  useEffect(() => {
    if (!onboarded && !isPublic) router.replace("/welcome");
  }, [onboarded, isPublic, router]);

  if (!onboarded && !isPublic) return null;

  if (isBare) {
    return (
      <div className="flex min-h-dvh flex-col bg-white">
        <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader onOpenMenu={() => setMenuOpen(true)} alertCount={1} />
      <DrawerNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4">{children}</main>
    </div>
  );
}
