/**
 * Virasat - Social sign-in providers.
 *
 * Driver is chosen by environment, defaulting to `stub`, the same shape as
 * email and billing. `native` checks real Apple, Google and Facebook tokens
 * (./native.ts, which lists its own settings); with none of them configured
 * it reports itself not ready rather than pretending.
 *
 * Configuration:
 *   AUTH_PROVIDERS_DRIVER   stub (default) | native
 */

import { createNativeIdentityDriver } from "./native";
import { createStubIdentityDriver } from "./stub";
import type { IdentityProviderDriver } from "./types";

function notReady(name: string, reason: string): IdentityProviderDriver {
  return {
    name,
    ready: false,
    notReadyReason: reason,
    async verify() {
      return { ok: false, error: reason };
    },
  };
}

let override: IdentityProviderDriver | null = null;

/** Tests: verify with this driver (a native one with local keys) until cleared. */
export function setIdentityDriverForTesting(driver: IdentityProviderDriver | null): void {
  override = driver;
}

export function resolveIdentityDriver(): IdentityProviderDriver {
  if (override) return override;
  const choice = (process.env.AUTH_PROVIDERS_DRIVER ?? "stub").toLowerCase();
  switch (choice) {
    case "stub":
      // The stub accepts any identity it is handed. In a production build it
      // is refused, except under the end-to-end harness, which runs one.
      if (process.env.NODE_ENV === "production" && process.env.VIRASAT_E2E !== "1") {
        return notReady(
          "stub",
          "The test sign-in provider is disabled in production. Set AUTH_PROVIDERS_DRIVER=native."
        );
      }
      return createStubIdentityDriver();
    case "native":
      return createNativeIdentityDriver();
    default:
      return notReady(
        `unknown:${choice}`,
        `AUTH_PROVIDERS_DRIVER="${choice}" is not a driver. Use stub or native.`
      );
  }
}

export type { VerifiedIdentity, IdentityProviderDriver } from "./types";
