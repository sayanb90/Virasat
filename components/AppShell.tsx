"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { DrawerNav } from "@/components/ui/DrawerNav";
import { LocaleProvider } from "@/lib/locale/LocaleProvider";
import { VaultSessionProvider } from "@/lib/vault/VaultSession";
import { UnlockScreen } from "@/components/UnlockScreen";
import { RecoveryBanner } from "@/components/RecoveryBanner";
import { boot, sendPushToken, useAuth, watchBackground } from "@/lib/auth/client";
import { phoneAlerts } from "@/lib/push/alerts";

/** Routes that render without the app chrome, or outside the sign-in gate. */
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
  const { status } = useAuth();

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isBare = pathname.startsWith(BARE_PREFIX);

  // Reads the device once, and locks after five minutes in the background.
  useEffect(() => {
    void boot();
    return watchBackground();
  }, []);

  // After each unlock, in the app: the OS may have renewed the push token.
  // This never asks for permission; Settings does, once.
  useEffect(() => {
    if (status !== "unlocked" || process.env.NEXT_PUBLIC_NATIVE !== "1") return;
    void phoneAlerts(sendPushToken)
      .then((a) => a?.refresh())
      .catch(() => {});
  }, [status]);

  // Nobody signed in on this phone: the welcome flow. Navigation belongs in
  // an effect rather than during render, and the guard keeps it to one push.
  useEffect(() => {
    if (status === "signed-out" && !isPublic) router.replace("/welcome");
  }, [status, isPublic, router]);

  if (!isPublic && (status === "starting" || status === "signed-out")) return null;

  if (isBare) {
    return (
      <div className="flex min-h-dvh flex-col bg-white">
        <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* No real alert source is wired yet, so the honest count is zero. The
          header reads "All well" until something actually needs attention —
          a permanent unexplained badge is the kind of low-grade alarm this
          product exists to avoid. */}
      <AppHeader onOpenMenu={() => setMenuOpen(true)} alertCount={0} />
      <DrawerNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4">
        {/* Every Owner screen, not just the note screens, needs tier two:
            settings and the safety timer are as sensitive as the notes. */}
        {status === "unlocked" && !isPublic && <RecoveryBanner />}
        {status === "unlocked" || isPublic ? children : <UnlockScreen />}
      </main>
    </div>
  );
}
