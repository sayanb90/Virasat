import type { SocialProvider } from "../types";

/**
 * What a provider vouches for, once our server has checked its token. Name and
 * email only: the Authentication design page (Notion) §3.2 takes nothing else.
 */
export interface VerifiedIdentity {
  provider: SocialProvider;
  /** The provider's permanent subject id. */
  subject: string;
  /** Absent for some Facebook accounts, which sign up with a phone number. */
  email: string | null;
  /** True only when the provider itself vouches for the address. */
  emailVerified: boolean;
  /** Apple sends this on the first authorization only, ever. */
  name: string | null;
}

export type VerifyResult = { ok: true; identity: VerifiedIdentity } | { ok: false; error: string };

export interface IdentityProviderDriver {
  readonly name: string;
  readonly ready: boolean;
  readonly notReadyReason?: string;
  /**
   * Checks a token the app received from the provider's native sheet.
   * `nonce` is the one our server issued for this sign-in; a token that does
   * not echo it is a replay and must be refused.
   */
  verify(provider: SocialProvider, token: string, nonce: string): Promise<VerifyResult>;
}
