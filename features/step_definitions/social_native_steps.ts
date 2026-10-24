import { After, Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import * as flows from "../../lib/auth/flows";
import { setIdentityDriverForTesting } from "../../lib/auth/providers";
import {
  OIDC_ISSUERS,
  createNativeIdentityDriver,
  type NativeProviderConfig,
} from "../../lib/auth/providers/native";
import type { SocialProvider } from "../../lib/auth/types";

const CONFIG: NativeProviderConfig = {
  apple: { clientIds: ["com.virasat.app"] },
  google: { clientIds: ["web-client.apps.googleusercontent.com"] },
  facebook: { appId: "1234", appSecret: "fb-secret", graphVersion: "v23.0" },
};

let keys: Record<"apple" | "google", { privateKey: CryptoKey; jwk: JWK }>;
/** What Facebook's Graph API will say about the next access token. */
let facebookUser: { id: string; name?: string; email?: string } | null = null;
let last: flows.Outcome<flows.SocialOutcome> | null = null;
let lastRequest: { provider: SocialProvider; token: string; nonce: string; name?: string } | null = null;

function useDriver(config: NativeProviderConfig): void {
  setIdentityDriverForTesting(
    createNativeIdentityDriver(config, {
      keySet: (provider) => createLocalJWKSet({ keys: provider === "facebook" ? [] : [keys[provider].jwk] }),
      fetch: (async (input: URL | RequestInfo) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/debug_token")) {
          return Response.json({ data: { is_valid: !!facebookUser, app_id: "1234", user_id: facebookUser?.id } });
        }
        return Response.json(facebookUser ?? {});
      }) as typeof fetch,
      now: () => Math.floor(Date.now() / 1000),
    })
  );
}

async function token(
  provider: "apple" | "google",
  nonce: string,
  claims: Record<string, unknown>,
  opts: { aud?: string; exp?: number } = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: keys[provider].jwk.kid })
    .setIssuer(OIDC_ISSUERS[provider].issuers[0])
    .setAudience(opts.aud ?? CONFIG[provider]!.clientIds[0])
    .setSubject(`${provider}-${Math.random().toString(36).slice(2)}`)
    .setIssuedAt(opts.exp ? opts.exp - 600 : now)
    .setExpirationTime(opts.exp ?? now + 600)
    .sign(keys[provider].privateKey);
}

async function continueWith(provider: SocialProvider, make: (nonce: string) => Promise<string> | string, name?: string) {
  const { nonce } = flows.socialNonce();
  lastRequest = { provider, token: await make(nonce), nonce, name };
  last = await flows.socialSignIn(lastRequest);
}

function signup() {
  assert.ok(last?.ok, `Expected the sign-in to go through: ${JSON.stringify(last)}`);
  const data = last!.data;
  assert.strictEqual(data.status, "signup", JSON.stringify(data));
  return data as Extract<flows.SocialOutcome, { status: "signup" }>;
}

After(function () {
  setIdentityDriverForTesting(null);
  facebookUser = null;
});

Given("the server checks real Apple, Google and Facebook tokens", async function () {
  keys = {} as typeof keys;
  for (const provider of ["apple", "google"] as const) {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    keys[provider] = { privateKey: privateKey as CryptoKey, jwk: { ...(await exportJWK(publicKey)), kid: `${provider}-1`, alg: "RS256" } };
  }
  useDriver(CONFIG);
});

Given("the server checks only Apple tokens", function () {
  useDriver({ apple: CONFIG.apple, google: null, facebook: null });
});

Given("the server checks no provider's tokens", function () {
  useDriver({ apple: null, google: null, facebook: null });
});

When(
  "a new person continues with Apple as {string}, and the app says she is {string}",
  async function (email: string, name: string) {
    await continueWith("apple", (nonce) => token("apple", nonce, { email, email_verified: "true" }), name);
  }
);

When(
  "a new person continues with Google as {string} named {string}, and the app says she is {string}",
  async function (email: string, googleName: string, appName: string) {
    await continueWith("google", (nonce) => token("google", nonce, { email, email_verified: true, name: googleName }), appName || undefined);
  }
);

When("someone continues with a Google token issued to another app", async function () {
  await continueWith("google", (nonce) => token("google", nonce, {}, { aud: "someone-else.apps.googleusercontent.com" }));
});

When("someone continues with a Google token issued for a different sign-in", async function () {
  const other = flows.socialNonce().nonce;
  await continueWith("google", () => token("google", other, {}));
});

When("someone continues with an Apple token that expired an hour ago", async function () {
  await continueWith("apple", (nonce) => token("apple", nonce, {}, { exp: Math.floor(Date.now() / 1000) - 3600 }));
});

When("the same token and nonce are sent again", async function () {
  assert.ok(lastRequest);
  last = await flows.socialSignIn(lastRequest!);
});

When(
  "a new person continues with a Facebook access token for {string} named {string}",
  async function (email: string, name: string) {
    facebookUser = { id: "fb-1", name, email };
    await continueWith("facebook", () => "EAAB-access-token");
  }
);

When("a new person continues with a Facebook access token with no email, named {string}", async function (name: string) {
  facebookUser = { id: "fb-2", name };
  await continueWith("facebook", () => "EAAB-access-token");
});

Then("she is asked to sign up as {string} named {string}", function (email: string, name: string) {
  const data = signup();
  assert.strictEqual(data.email, email);
  assert.strictEqual(data.name, name);
});

Then("she is asked to sign up with no email, named {string}", function (name: string) {
  const data = signup();
  assert.strictEqual(data.email, null);
  assert.strictEqual(data.name, name);
});

Then("her email address does not need a code", function () {
  assert.strictEqual(signup().emailVerified, true);
});

Then("her email address needs a code", function () {
  assert.strictEqual(signup().emailVerified, false);
});

Then(
  "the sign-in is refused with status {int} because it {string}",
  function (status: number, reason: string) {
    assert.ok(last && !last.ok, `Expected a refusal: ${JSON.stringify(last)}`);
    assert.strictEqual((last as { status: number }).status, status);
    assert.ok((last as { error: string }).error.includes(reason), (last as { error: string }).error);
  }
);
