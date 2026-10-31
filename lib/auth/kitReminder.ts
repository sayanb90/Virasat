"use client";

/**
 * "Remind me later" on the Recovery Kit (docs/authentication.md 3.1 step 5).
 *
 * A device-local flag, like the country: it decides what this phone shows,
 * not anything the server depends on. The server already holds a kit; the
 * reminder exists because the person has not written its code down, so
 * acting on it makes a new kit.
 */

import { useSyncExternalStore } from "react";

const KEY = "virasat.kitPending";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

function write(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(KEY, "true");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
  for (const l of listeners) l();
}

export const markKitPending = () => write(true);
export const clearKitPending = () => write(false);

export function useKitPending(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => false
  );
}
