"use client";

import React from "react";
import { lock, useAuth } from "@/lib/auth/client";

interface VaultSessionValue {
  /** K_vault, the key every note is encrypted under. Null while locked. */
  vaultKey: CryptoKey | null;
  vaultKeyHex: string;
  lock: () => void;
}

/**
 * The open vault, as the note screens see it.
 *
 * K_vault lives in memory in `lib/auth/client.ts`, which owns signing in and
 * unlocking; this is just the view the screens read. It never touches
 * localStorage, cookies or the server, so a cold start or five minutes in the
 * background locks it again (the Authentication design page (Notion) §4).
 */
export function VaultSessionProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useVaultSession(): VaultSessionValue {
  const { vaultKey, vaultKeyHex } = useAuth();
  return { vaultKey, vaultKeyHex, lock };
}
