"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

interface VaultSessionValue {
  masterKey: CryptoKey | null;
  masterKeyHex: string;
  unlock: (key: CryptoKey, keyHex: string) => void;
  lock: () => void;
}

const VaultSessionContext = createContext<VaultSessionValue | null>(null);

/**
 * Holds the derived master key for the lifetime of the tab.
 *
 * Deliberately in memory only: the key never touches localStorage, cookies or
 * the server, so closing the tab ends the session and nothing recoverable is
 * left behind.
 */
export function VaultSessionProvider({ children }: { children: React.ReactNode }) {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [masterKeyHex, setMasterKeyHex] = useState("");

  const unlock = useCallback((key: CryptoKey, keyHex: string) => {
    setMasterKey(key);
    setMasterKeyHex(keyHex);
  }, []);

  const lock = useCallback(() => {
    setMasterKey(null);
    setMasterKeyHex("");
  }, []);

  const value = useMemo(
    () => ({ masterKey, masterKeyHex, unlock, lock }),
    [masterKey, masterKeyHex, unlock, lock]
  );

  return <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>;
}

export function useVaultSession(): VaultSessionValue {
  const ctx = useContext(VaultSessionContext);
  if (!ctx) throw new Error("useVaultSession must be used inside <VaultSessionProvider>");
  return ctx;
}
