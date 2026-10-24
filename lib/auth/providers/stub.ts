import type { SocialProvider } from "../types";
import type { IdentityProviderDriver, VerifiedIdentity } from "./types";

/**
 * The development and test driver. Talks to no provider.
 *
 * The "token" is the identity itself, base64url JSON, minted by the app's
 * "Continue as a test user" sheet. It still has to echo the server's nonce,
 * so the replay check is exercised exactly as it will be against Apple and
 * Google.
 *
 * It must never be reachable in a real deployment: anyone could mint any
 * identity. `index.ts` refuses it in production builds unless the
 * VIRASAT_E2E harness is running.
 */
export function createStubIdentityDriver(): IdentityProviderDriver {
  return {
    name: "stub",
    ready: true,

    async verify(provider: SocialProvider, token: string, nonce: string) {
      let claims: Partial<VerifiedIdentity> & { nonce?: string };
      try {
        claims = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
      } catch {
        return { ok: false, error: "The sign-in token could not be read." };
      }
      if (claims.nonce !== nonce) {
        return { ok: false, error: "The sign-in token was not issued for this sign-in." };
      }
      if (claims.provider !== provider || !claims.subject) {
        return { ok: false, error: "The sign-in token is incomplete." };
      }
      return {
        ok: true,
        identity: {
          provider,
          subject: String(claims.subject),
          email: claims.email ? String(claims.email).toLowerCase() : null,
          emailVerified: Boolean(claims.email && claims.emailVerified),
          name: claims.name ? String(claims.name) : null,
        },
      };
    },
  };
}

/** Builds a stub token. Used by the test sheet and the specs. */
export function mintStubToken(claims: {
  provider: SocialProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  nonce: string;
}): string {
  const json = JSON.stringify(claims);
  return typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf8").toString("base64url")
    : btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
