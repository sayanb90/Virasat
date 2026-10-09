/**
 * Whether this device has been through the welcome flow.
 *
 * Device-local on purpose: it decides what to show on first launch, not
 * anything the escalation engine depends on. Exposed as an external store so
 * components read it with useSyncExternalStore rather than an effect.
 */

const KEY = "virasat.onboarded";
const listeners = new Set<() => void>();

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    // Storage blocked: treat as onboarded so a private window is not trapped
    // in the welcome flow forever.
    return true;
  }
}

/** The server cannot know, and must not flash the welcome screen at a
 *  returning user, so it renders as if onboarding is done. */
export function getServerSnapshot(): boolean {
  return true;
}

export function completeOnboarding(): void {
  try {
    window.localStorage.setItem(KEY, "true");
  } catch {
    /* storage blocked — the session still continues */
  }
  for (const listener of listeners) listener();
}

export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
  for (const listener of listeners) listener();
}
