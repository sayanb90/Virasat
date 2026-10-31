/**
 * Virasat - Apple, Google and Facebook, checked by our server.
 *
 * The app's native sheet hands back a token; this driver decides whether to
 * believe it. Nothing the app says about the person is trusted on its own.
 *
 *   Apple, Google   An OpenID Connect ID token (a JWT). Checked against the
 *                   provider's published keys (JWKS): signature, `iss`, `aud`
 *                   (one of our client ids), `exp`, and our `nonce`.
 *   Facebook        Either a Limited Login ID token (iOS, checked like the
 *                   above), or a classic access token, checked with the Graph
 *                   API: `debug_token` must say it is valid and was issued to
 *                   our app, and `/me` must name the same user.
 *
 * The nonce. Our server issues one per sign-in (flows.socialNonce) and the
 * token must carry it, so a token captured from another sign-in cannot be
 * replayed. Apple's iOS sheet requires the app to send SHA-256(nonce), and
 * its token carries the hash, so either form is accepted: both bind the
 * token to this sign-in. A classic Facebook access token has no nonce at
 * all; for it, the protection is that the server's nonce is single-use and
 * the token must be valid for our app right now. Limited Login does not have
 * that gap.
 *
 * Configuration (each provider is off until configured):
 *   APPLE_CLIENT_IDS        comma-separated: the app's bundle id, and the
 *                           Services ID if the web ever signs in with Apple
 *   GOOGLE_CLIENT_IDS       comma-separated: the iOS client id and the web
 *                           ("server") client id Android's sheet is given
 *   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
 *   FACEBOOK_GRAPH_VERSION  default v23.0
 */

import { createHash, createHmac } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { SocialProvider } from "../types";
import type { IdentityProviderDriver, VerifiedIdentity, VerifyResult } from "./types";

export interface NativeProviderConfig {
  apple: { clientIds: string[] } | null;
  google: { clientIds: string[] } | null;
  facebook: { appId: string; appSecret: string; graphVersion: string } | null;
}

/** Where each provider publishes its signing keys, and who it says it is. */
export const OIDC_ISSUERS: Record<SocialProvider, { issuers: string[]; jwksUrl: string }> = {
  apple: { issuers: ["https://appleid.apple.com"], jwksUrl: "https://appleid.apple.com/auth/keys" },
  google: {
    // Google uses both forms.
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
  },
  facebook: {
    // Limited Login tokens use either.
    issuers: ["https://www.facebook.com", "https://limited.facebook.com"],
    jwksUrl: "https://limited.facebook.com/.well-known/oauth/openid/jwks/",
  },
};

const LABEL: Record<SocialProvider, string> = { apple: "Apple", google: "Google", facebook: "Facebook" };

/** Tokens a few seconds either side of our clock are not a forgery. */
const CLOCK_TOLERANCE_S = 60;

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function nativeConfigFromEnv(env: Record<string, string | undefined> = process.env): NativeProviderConfig {
  const apple = list(env.APPLE_CLIENT_IDS);
  const google = list(env.GOOGLE_CLIENT_IDS);
  const appId = env.FACEBOOK_APP_ID?.trim();
  const appSecret = env.FACEBOOK_APP_SECRET?.trim();
  return {
    apple: apple.length ? { clientIds: apple } : null,
    google: google.length ? { clientIds: google } : null,
    facebook:
      appId && appSecret
        ? { appId, appSecret, graphVersion: env.FACEBOOK_GRAPH_VERSION?.trim() || "v23.0" }
        : null,
  };
}

export interface NativeDriverDeps {
  /** The provider's keys. By default fetched from its JWKS URL, and cached. */
  keySet(provider: SocialProvider): JWTVerifyGetKey;
  /** For Facebook's Graph API. */
  fetch: typeof fetch;
  /** Seconds since the epoch; tests move it. */
  now(): number;
}

export function defaultNativeDeps(): NativeDriverDeps {
  const sets = new Map<SocialProvider, JWTVerifyGetKey>();
  return {
    keySet(provider) {
      let set = sets.get(provider);
      if (!set) {
        set = createRemoteJWKSet(new URL(OIDC_ISSUERS[provider].jwksUrl));
        sets.set(provider, set);
      }
      return set;
    },
    fetch: (...args) => fetch(...args),
    now: () => Math.floor(Date.now() / 1000),
  };
}

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

function fail(error: string): VerifyResult {
  return { ok: false, error };
}

/** `true`, or Apple's string "true". */
function isTrue(value: unknown): boolean {
  return value === true || value === "true";
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return name || null;
}

function looksLikeJwt(token: string): boolean {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token);
}

async function verifyIdToken(
  provider: SocialProvider,
  token: string,
  nonce: string,
  audiences: string[],
  deps: NativeDriverDeps
): Promise<{ ok: true; claims: JWTPayload } | { ok: false; error: string }> {
  const label = LABEL[provider];
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(token, deps.keySet(provider), {
      issuer: OIDC_ISSUERS[provider].issuers,
      audience: audiences,
      algorithms: ["RS256", "ES256"],
      clockTolerance: CLOCK_TOLERANCE_S,
      currentDate: new Date(deps.now() * 1000),
      requiredClaims: ["sub", "exp", "iat"],
    }));
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "ERR_JWT_EXPIRED") return { ok: false, error: `The ${label} sign-in has expired. Please try again.` };
    return { ok: false, error: `The ${label} sign-in could not be confirmed.` };
  }
  const echoed = claims.nonce;
  if (typeof echoed !== "string" || (echoed !== nonce && echoed !== sha256Hex(nonce))) {
    return { ok: false, error: "The sign-in token was not issued for this sign-in." };
  }
  return { ok: true, claims };
}

function fromOidc(provider: SocialProvider, claims: JWTPayload): VerifiedIdentity {
  const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email.toLowerCase() : null;
  return {
    provider,
    subject: String(claims.sub),
    email,
    // Facebook never says it has verified the address, so we confirm it ourselves.
    emailVerified: Boolean(email) && provider !== "facebook" && isTrue(claims.email_verified),
    // Apple puts no name in the token; the app passes it from the first authorization.
    name: cleanName(claims.name),
  };
}

async function verifyFacebookAccessToken(
  token: string,
  config: NonNullable<NativeProviderConfig["facebook"]>,
  deps: NativeDriverDeps
): Promise<VerifyResult> {
  const graph = `https://graph.facebook.com/${config.graphVersion}`;
  const unconfirmed = fail("The Facebook sign-in could not be confirmed.");
  try {
    const debug = new URL(`${graph}/debug_token`);
    debug.searchParams.set("input_token", token);
    debug.searchParams.set("access_token", `${config.appId}|${config.appSecret}`);
    const checked = (await (await deps.fetch(debug)).json()) as {
      data?: { is_valid?: boolean; app_id?: string; user_id?: string; expires_at?: number };
    };
    const data = checked.data;
    if (!data?.is_valid || data.app_id !== config.appId || !data.user_id) return unconfirmed;
    if (data.expires_at && data.expires_at > 0 && data.expires_at < deps.now()) {
      return fail("The Facebook sign-in has expired. Please try again.");
    }

    const me = new URL(`${graph}/me`);
    me.searchParams.set("fields", "id,name,email");
    me.searchParams.set("access_token", token);
    // Proves the call comes from our server, not from someone holding the token.
    me.searchParams.set("appsecret_proof", createHmac("sha256", config.appSecret).update(token).digest("hex"));
    const res = await deps.fetch(me);
    const profile = (await res.json()) as { id?: string; name?: string; email?: string };
    if (!res.ok || profile.id !== data.user_id) return unconfirmed;

    const email = typeof profile.email === "string" && profile.email.includes("@") ? profile.email.toLowerCase() : null;
    return {
      ok: true,
      identity: { provider: "facebook", subject: profile.id, email, emailVerified: false, name: cleanName(profile.name) },
    };
  } catch {
    return fail("Facebook could not be reached. Please try again.");
  }
}

export function createNativeIdentityDriver(
  config: NativeProviderConfig = nativeConfigFromEnv(),
  deps: NativeDriverDeps = defaultNativeDeps()
): IdentityProviderDriver {
  const configured = (["apple", "google", "facebook"] as const).filter((p) => config[p] !== null);
  return {
    name: "native",
    ready: configured.length > 0,
    notReadyReason: configured.length
      ? undefined
      : "No sign-in provider is set up. Set APPLE_CLIENT_IDS, GOOGLE_CLIENT_IDS or FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",

    async verify(provider, token, nonce) {
      if (!token) return fail("The sign-in token is missing.");
      if (provider === "facebook") {
        const fb = config.facebook;
        if (!fb) return fail("Facebook sign-in is not set up on this server.");
        if (!looksLikeJwt(token)) return verifyFacebookAccessToken(token, fb, deps);
        const checked = await verifyIdToken("facebook", token, nonce, [fb.appId], deps);
        return checked.ok ? { ok: true, identity: fromOidc("facebook", checked.claims) } : checked;
      }
      const ids = config[provider]?.clientIds;
      if (!ids) return fail(`${LABEL[provider]} sign-in is not set up on this server.`);
      const checked = await verifyIdToken(provider, token, nonce, ids, deps);
      return checked.ok ? { ok: true, identity: fromOidc(provider, checked.claims) } : checked;
    },
  };
}
