"use client";

import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_COUNTRY,
  isCountryCode,
  resolveTaxonomy,
  type CategoryGroupDef,
  type CountryCode,
} from "@/lib/taxonomy";

const STORAGE_KEY = "virasat.country";

/**
 * The stored country is external state, so it is read through
 * useSyncExternalStore rather than an effect. That keeps the server and
 * client snapshots explicit, and makes the choice follow the user across
 * tabs for free via the `storage` event.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): CountryCode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isCountryCode(stored) ? stored : DEFAULT_COUNTRY;
  } catch {
    // Storage blocked (private browsing, blocked cookies) — use the default.
    return DEFAULT_COUNTRY;
  }
}

/** The server cannot know the stored choice, so it always renders the default. */
function getServerSnapshot(): CountryCode {
  return DEFAULT_COUNTRY;
}

interface LocaleContextValue {
  country: CountryCode;
  setCountry: (next: CountryCode) => void;
  taxonomy: CategoryGroupDef[];
  /** Retained for call sites that want to defer first paint; always true now
   *  that the stored value is read synchronously. */
  ready: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const country = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCountry = useCallback((next: CountryCode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — nothing to persist, but still notify this tab */
    }
    // `storage` only fires in *other* tabs, so nudge this one directly.
    for (const listener of listeners) listener();
  }, []);

  const value = useMemo(
    () => ({ country, setCountry, taxonomy: resolveTaxonomy(country), ready: true }),
    [country, setCountry]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside <LocaleProvider>");
  return ctx;
}
