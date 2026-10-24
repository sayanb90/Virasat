/**
 * Virasat - Social sign-in providers.
 *
 * Driver is chosen by environment, defaulting to `stub`, the same shape as
 * email and billing. The real Apple, Google and Facebook drivers arrive with
 * the native app (docs/authentication.md §9, phase 4); until then `native`
 * reports itself not ready rather than pretending.
 *
 * Configuration:
 *   AUTH_PROVIDERS_DRIVER   stub (default) | native
 */

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

export function resolveIdentityDriver(): IdentityProviderDriver {
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
      return notReady("native", "Apple, Google and Facebook sign-in are not built yet.");
    default:
      return notReady(
        `unknown:${choice}`,
        `AUTH_PROVIDERS_DRIVER="${choice}" is not a driver. Use stub or native.`
      );
  }
}

export type { VerifiedIdentity, IdentityProviderDriver } from "./types";
