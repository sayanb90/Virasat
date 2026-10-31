"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { boot, signOut, useAuth } from "@/lib/auth/client";
import { DeviceUnlock } from "@/components/auth/DeviceUnlock";
import { SetUpPhone } from "@/components/auth/SetUpPhone";
import { ButtonLink } from "@/components/ui/Button";

/**
 * What a vault screen shows while the vault is closed.
 *
 * Tier one is remembered on this phone; this is tier two, asked on every cold
 * start and after five minutes away (the Authentication design page (Notion) §4).
 */
export function UnlockScreen() {
  const { status, user, needs } = useAuth();

  useEffect(() => {
    void boot();
  }, []);

  if (status === "starting") return null;

  if (status === "needs-device") {
    return (
      <div className="py-6">
        <SetUpPhone />
      </div>
    );
  }

  if (status === "signed-out" || (status === "locked" && !needs.includes("device"))) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-[28px] font-bold leading-tight text-[var(--text)]">Please sign in</h1>
        <p className="mx-auto mt-3 max-w-[34ch] text-[17px] leading-relaxed text-[var(--text-muted)]">
          Sign in to Virasat on this phone to see your notes.
        </p>
        <div className="mx-auto mt-8 max-w-[380px]">
          <ButtonLink href="/welcome/sign-in?existing=1" size="lg">
            Sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10">
      <div className="mx-auto mb-7 flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-[var(--action-soft)] text-[var(--action)]">
        <Lock className="h-9 w-9" strokeWidth={1.75} aria-hidden="true" />
      </div>

      <h1 className="text-center text-[28px] font-bold leading-tight text-[var(--text)]">
        Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mx-auto mb-9 mt-3 max-w-[34ch] text-center text-[17px] leading-relaxed text-[var(--text-muted)]">
        Look at your phone, or enter your PIN, to open your notes. Only you can unlock them — we
        never hold a copy.
      </p>

      <DeviceUnlock />

      <div className="mt-8 space-y-3 text-center text-[16px]">
        <Link href="/welcome/recover" className="block text-[var(--action)] underline">
          Forgot your password?
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-[var(--text-muted)] underline"
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
