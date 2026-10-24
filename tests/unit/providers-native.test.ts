import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import {
  OIDC_ISSUERS,
  createNativeIdentityDriver,
  nativeConfigFromEnv,
  type NativeDriverDeps,
  type NativeProviderConfig,
} from "@/lib/auth/providers/native";
import type { SocialProvider } from "@/lib/auth/types";

const NOW = 1_800_000_000;
const NONCE = "server-nonce-1";
const CONFIG: NativeProviderConfig = {
  apple: { clientIds: ["com.virasat.app"] },
  google: { clientIds: ["ios-client.apps.googleusercontent.com", "web-client.apps.googleusercontent.com"] },
  facebook: { appId: "1234", appSecret: "fb-secret", graphVersion: "v23.0" },
};

/** One signing key per provider, published as that provider's JWKS. */
async function providerKeys() {
  const keys = {} as Record<SocialProvider, { privateKey: CryptoKey; jwk: JWK; alg: string }>;
  for (const [provider, alg] of [["apple", "RS256"], ["google", "RS256"], ["facebook", "ES256"]] as const) {
    const { privateKey, publicKey } = await generateKeyPair(alg);
    keys[provider] = { privateKey: privateKey as CryptoKey, jwk: { ...(await exportJWK(publicKey)), kid: `${provider}-1`, alg }, alg };
  }
  return keys;
}

type Keys = Awaited<ReturnType<typeof providerKeys>>;

function deps(keys: Keys, fetchImpl: typeof fetch = async () => new Response("{}", { status: 500 })): NativeDriverDeps {
  return {
    keySet: (provider) => createLocalJWKSet({ keys: [keys[provider].jwk] }),
    fetch: fetchImpl,
    now: () => NOW,
  };
}

async function idToken(
  keys: Keys,
  provider: SocialProvider,
  claims: Record<string, unknown> = {},
  opts: { iss?: string; aud?: string; exp?: number; iat?: number; signer?: SocialProvider; kid?: string } = {}
) {
  const signer = keys[opts.signer ?? provider];
  return new SignJWT({ nonce: NONCE, ...claims })
    .setProtectedHeader({ alg: signer.alg, kid: opts.kid ?? signer.jwk.kid })
    .setIssuer(opts.iss ?? OIDC_ISSUERS[provider].issuers[0])
    .setAudience(opts.aud ?? (provider === "facebook" ? "1234" : CONFIG[provider]!.clientIds[0]))
    .setSubject(`${provider}-user-1`)
    .setIssuedAt(opts.iat ?? NOW - 10)
    .setExpirationTime(opts.exp ?? NOW + 600)
    .sign(signer.privateKey);
}

describe("Apple", () => {
  test("a genuine token, with the nonce hashed as iOS sends it", async () => {
    const keys = await providerKeys();
    const driver = createNativeIdentityDriver(CONFIG, deps(keys));
    const token = await idToken(keys, "apple", {
      nonce: createHash("sha256").update(NONCE).digest("hex"),
      email: "Meera@PrivateRelay.AppleID.com",
      email_verified: "true",
    });
    assert.deepEqual(await driver.verify("apple", token, NONCE), {
      ok: true,
      identity: {
        provider: "apple",
        subject: "apple-user-1",
        email: "meera@privaterelay.appleid.com",
        emailVerified: true,
        name: null,
      },
    });
  });

  test("the plain nonce is accepted too", async () => {
    const keys = await providerKeys();
    const result = await createNativeIdentityDriver(CONFIG, deps(keys)).verify("apple", await idToken(keys, "apple"), NONCE);
    assert.equal(result.ok, true);
  });

  test("an unverified address is passed on as unverified", async () => {
    const keys = await providerKeys();
    const token = await idToken(keys, "apple", { email: "a@b.test", email_verified: "false" });
    const result = await createNativeIdentityDriver(CONFIG, deps(keys)).verify("apple", token, NONCE);
    assert.ok(result.ok && result.identity.emailVerified === false);
  });
});

describe("Google", () => {
  test("a genuine token for either of our client ids, with its name", async () => {
    const keys = await providerKeys();
    const driver = createNativeIdentityDriver(CONFIG, deps(keys));
    for (const aud of CONFIG.google!.clientIds) {
      const token = await idToken(keys, "google", { email: "meera@gmail.com", email_verified: true, name: "  Meera   Sharma " }, { aud });
      const result = await driver.verify("google", token, NONCE);
      assert.ok(result.ok, aud);
      assert.deepEqual(result.identity, {
        provider: "google",
        subject: "google-user-1",
        email: "meera@gmail.com",
        emailVerified: true,
        name: "Meera Sharma",
      });
    }
  });

  test("both of Google's issuer spellings are accepted", async () => {
    const keys = await providerKeys();
    const token = await idToken(keys, "google", {}, { iss: "accounts.google.com" });
    assert.equal((await createNativeIdentityDriver(CONFIG, deps(keys)).verify("google", token, NONCE)).ok, true);
  });

  test("a missing or malformed email is no email", async () => {
    const keys = await providerKeys();
    const driver = createNativeIdentityDriver(CONFIG, deps(keys));
    for (const email of [undefined, "not-an-address", 42]) {
      const result = await driver.verify("google", await idToken(keys, "google", { email, email_verified: true }), NONCE);
      assert.ok(result.ok && result.identity.email === null && result.identity.emailVerified === false, String(email));
    }
  });
});

describe("tokens that must be refused", () => {
  const cases: Array<[string, (keys: Keys) => Promise<string>, RegExp]> = [
    ["issued to another app", (k) => idToken(k, "apple", {}, { aud: "com.someone.else" }), /could not be confirmed/],
    ["issued by someone else", (k) => idToken(k, "apple", {}, { iss: "https://evil.example" }), /could not be confirmed/],
    ["signed with another provider's key", (k) => idToken(k, "apple", {}, { signer: "google", kid: "apple-1" }), /could not be confirmed/],
    ["expired", (k) => idToken(k, "apple", {}, { exp: NOW - 120, iat: NOW - 900 }), /has expired/],
    ["for another sign-in", (k) => idToken(k, "apple", { nonce: "another-nonce" }), /not issued for this sign-in/],
    ["with no nonce", (k) => idToken(k, "apple", { nonce: undefined }), /not issued for this sign-in/],
    ["not a JWT", async () => "garbage", /could not be confirmed/],
    [
      "unsigned (alg: none)",
      async () => {
        const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
        return `${part({ alg: "none" })}.${part({ iss: OIDC_ISSUERS.apple.issuers[0], aud: "com.virasat.app", sub: "x", nonce: NONCE, exp: NOW + 60, iat: NOW })}.`;
      },
      /could not be confirmed/,
    ],
  ];
  for (const [name, make, error] of cases) {
    test(`a token ${name}`, async () => {
      const keys = await providerKeys();
      const result = await createNativeIdentityDriver(CONFIG, deps(keys)).verify("apple", await make(keys), NONCE);
      assert.equal(result.ok, false);
      assert.match((result as { error: string }).error, error);
    });
  }

  test("a token within a minute of our clock is still fine", async () => {
    const keys = await providerKeys();
    const token = await idToken(keys, "apple", {}, { exp: NOW - 30 });
    assert.equal((await createNativeIdentityDriver(CONFIG, deps(keys)).verify("apple", token, NONCE)).ok, true);
  });

  test("an empty token", async () => {
    const keys = await providerKeys();
    assert.deepEqual(await createNativeIdentityDriver(CONFIG, deps(keys)).verify("google", "", NONCE), {
      ok: false,
      error: "The sign-in token is missing.",
    });
  });
});

describe("Facebook", () => {
  test("a Limited Login ID token (iOS) is checked like Apple's and Google's", async () => {
    const keys = await providerKeys();
    const token = await idToken(keys, "facebook", { email: "meera@example.com", name: "Meera" });
    const result = await createNativeIdentityDriver(CONFIG, deps(keys)).verify("facebook", token, NONCE);
    assert.deepEqual(result, {
      ok: true,
      identity: { provider: "facebook", subject: "facebook-user-1", email: "meera@example.com", emailVerified: false, name: "Meera" },
    });
  });

  test("Limited Login's other issuer is accepted too", async () => {
    const keys = await providerKeys();
    const token = await idToken(keys, "facebook", {}, { iss: "https://limited.facebook.com" });
    assert.equal((await createNativeIdentityDriver(CONFIG, deps(keys)).verify("facebook", token, NONCE)).ok, true);
  });

  /** A Graph API that answers debug_token and /me for one user. */
  function graph(answers: { debug?: unknown; me?: unknown; meStatus?: number; fail?: boolean }) {
    const calls: URL[] = [];
    const impl = (async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      calls.push(url);
      if (answers.fail) throw new Error("network down");
      if (url.pathname.endsWith("/debug_token")) return new Response(JSON.stringify(answers.debug));
      return new Response(JSON.stringify(answers.me), { status: answers.meStatus ?? 200 });
    }) as typeof fetch;
    return { impl, calls };
  }

  const VALID = { data: { is_valid: true, app_id: "1234", user_id: "fb-1", expires_at: NOW + 3600 } };

  test("a classic access token: valid for our app, and /me names the same user", async () => {
    const keys = await providerKeys();
    const g = graph({ debug: VALID, me: { id: "fb-1", name: "Meera", email: "MEERA@example.com" } });
    const result = await createNativeIdentityDriver(CONFIG, deps(keys, g.impl)).verify("facebook", "EAAB-access-token", NONCE);
    assert.deepEqual(result, {
      ok: true,
      identity: { provider: "facebook", subject: "fb-1", email: "meera@example.com", emailVerified: false, name: "Meera" },
    });
    const [debug, me] = g.calls;
    assert.equal(debug.origin + debug.pathname, "https://graph.facebook.com/v23.0/debug_token");
    assert.equal(debug.searchParams.get("input_token"), "EAAB-access-token");
    assert.equal(debug.searchParams.get("access_token"), "1234|fb-secret");
    assert.equal(me.searchParams.get("fields"), "id,name,email");
    assert.equal(
      me.searchParams.get("appsecret_proof"),
      createHmac("sha256", "fb-secret").update("EAAB-access-token").digest("hex")
    );
  });

  test("a Facebook account with no email signs in with no email", async () => {
    const keys = await providerKeys();
    const g = graph({ debug: VALID, me: { id: "fb-1", name: "Meera" } });
    const result = await createNativeIdentityDriver(CONFIG, deps(keys, g.impl)).verify("facebook", "tok", NONCE);
    assert.ok(result.ok && result.identity.email === null);
  });

  const refusals: Array<[string, Parameters<typeof graph>[0], RegExp]> = [
    ["invalid", { debug: { data: { ...VALID.data, is_valid: false } } }, /could not be confirmed/],
    ["issued to another app", { debug: { data: { ...VALID.data, app_id: "9999" } } }, /could not be confirmed/],
    ["with no user", { debug: { data: { is_valid: true, app_id: "1234" } } }, /could not be confirmed/],
    ["with no answer", { debug: {} }, /could not be confirmed/],
    ["expired", { debug: { data: { ...VALID.data, expires_at: NOW - 1 } } }, /has expired/],
    ["for another user than /me", { debug: VALID, me: { id: "fb-2" } }, /could not be confirmed/],
    ["refused by /me", { debug: VALID, me: { error: {} }, meStatus: 400 }, /could not be confirmed/],
    ["when Facebook is unreachable", { fail: true }, /could not be reached/],
  ];
  for (const [name, answers, error] of refusals) {
    test(`an access token ${name} is refused`, async () => {
      const keys = await providerKeys();
      const result = await createNativeIdentityDriver(CONFIG, deps(keys, graph(answers).impl)).verify("facebook", "tok", NONCE);
      assert.equal(result.ok, false);
      assert.match((result as { error: string }).error, error);
    });
  }

  test("a token that never expires (expires_at 0) is fine", async () => {
    const keys = await providerKeys();
    const g = graph({ debug: { data: { ...VALID.data, expires_at: 0 } }, me: { id: "fb-1" } });
    assert.equal((await createNativeIdentityDriver(CONFIG, deps(keys, g.impl)).verify("facebook", "tok", NONCE)).ok, true);
  });
});

describe("configuration", () => {
  test("each provider is off until configured, and says so", async () => {
    const keys = await providerKeys();
    const none = createNativeIdentityDriver({ apple: null, google: null, facebook: null }, deps(keys));
    assert.equal(none.ready, false);
    assert.match(none.notReadyReason!, /APPLE_CLIENT_IDS/);
    const appleOnly = createNativeIdentityDriver({ ...CONFIG, google: null, facebook: null }, deps(keys));
    assert.equal(appleOnly.ready, true);
    assert.equal(appleOnly.notReadyReason, undefined);
    assert.match((await appleOnly.verify("google", "t", NONCE) as { error: string }).error, /Google sign-in is not set up/);
    assert.match((await appleOnly.verify("facebook", "t", NONCE) as { error: string }).error, /Facebook sign-in is not set up/);
  });

  test("read from the environment, lists trimmed", () => {
    assert.deepEqual(
      nativeConfigFromEnv({
        APPLE_CLIENT_IDS: " com.virasat.app , com.virasat.web ,",
        GOOGLE_CLIENT_IDS: "a.apps.googleusercontent.com",
        FACEBOOK_APP_ID: " 1234 ",
        FACEBOOK_APP_SECRET: "s",
      }),
      {
        apple: { clientIds: ["com.virasat.app", "com.virasat.web"] },
        google: { clientIds: ["a.apps.googleusercontent.com"] },
        facebook: { appId: "1234", appSecret: "s", graphVersion: "v23.0" },
      }
    );
    assert.deepEqual(nativeConfigFromEnv({}), { apple: null, google: null, facebook: null });
    assert.equal(
      nativeConfigFromEnv({ FACEBOOK_APP_ID: "1", FACEBOOK_APP_SECRET: "s", FACEBOOK_GRAPH_VERSION: "v24.0" }).facebook!.graphVersion,
      "v24.0"
    );
    assert.equal(nativeConfigFromEnv({ FACEBOOK_APP_ID: "1" }).facebook, null, "an app id alone is not enough");
  });

  test("by default the keys come from each provider's published JWKS", () => {
    const driver = createNativeIdentityDriver(CONFIG);
    assert.equal(driver.name, "native");
    assert.equal(OIDC_ISSUERS.apple.jwksUrl, "https://appleid.apple.com/auth/keys");
    assert.equal(OIDC_ISSUERS.google.jwksUrl, "https://www.googleapis.com/oauth2/v3/certs");
  });
});

describe("the default dependencies", () => {
  test("fetch each provider's key set once and keep it, and read the real clock", async () => {
    const { defaultNativeDeps } = await import("@/lib/auth/providers/native");
    const d = defaultNativeDeps();
    assert.equal(d.keySet("apple"), d.keySet("apple"), "cached per provider");
    assert.notEqual(d.keySet("apple"), d.keySet("google"));
    assert.ok(Math.abs(d.now() - Date.now() / 1000) < 5);
    // A data: URL proves the wrapper calls the real fetch, with no network.
    const res = await d.fetch(new URL('data:application/json,{"ok":1}'));
    assert.deepEqual(await res.json(), { ok: 1 });
  });
});

describe("choosing the identity driver (providers/index.ts)", () => {
  const ENV = ["AUTH_PROVIDERS_DRIVER", "NODE_ENV", "VIRASAT_E2E", "APPLE_CLIENT_IDS"] as const;
  async function resolveWith(env: Partial<Record<(typeof ENV)[number], string>>) {
    const vars = process.env as Record<string, string | undefined>;
    const saved = Object.fromEntries(ENV.map((k) => [k, vars[k]]));
    for (const k of ENV) delete vars[k];
    Object.assign(vars, env);
    try {
      const { resolveIdentityDriver } = await import("@/lib/auth/providers");
      return resolveIdentityDriver();
    } finally {
      for (const k of ENV) {
        if (saved[k] === undefined) delete vars[k];
        else vars[k] = saved[k];
      }
    }
  }

  test("stub by default, outside production", async () => {
    const d = await resolveWith({});
    assert.equal(d.name, "stub");
    assert.equal(d.ready, true);
  });

  test("the stub is refused in production, except under the e2e harness", async () => {
    const refused = await resolveWith({ NODE_ENV: "production" });
    assert.equal(refused.ready, false);
    assert.match(refused.notReadyReason!, /disabled in production/);
    assert.deepEqual(await refused.verify("apple", "t", "n"), { ok: false, error: refused.notReadyReason });
    assert.equal((await resolveWith({ NODE_ENV: "production", VIRASAT_E2E: "1" })).ready, true);
  });

  test("native checks real tokens, ready once a provider is configured", async () => {
    assert.equal((await resolveWith({ AUTH_PROVIDERS_DRIVER: "native" })).ready, false);
    const d = await resolveWith({ AUTH_PROVIDERS_DRIVER: "NATIVE", APPLE_CLIENT_IDS: "com.virasat.app" });
    assert.equal(d.name, "native");
    assert.equal(d.ready, true);
  });

  test("an unknown driver says what to use instead", async () => {
    const d = await resolveWith({ AUTH_PROVIDERS_DRIVER: "okta" });
    assert.equal(d.ready, false);
    assert.match(d.notReadyReason!, /"okta" is not a driver/);
  });

  test("a driver set for testing wins until cleared", async () => {
    const { resolveIdentityDriver, setIdentityDriverForTesting } = await import("@/lib/auth/providers");
    const keys = await providerKeys();
    const mine = createNativeIdentityDriver(CONFIG, deps(keys));
    setIdentityDriverForTesting(mine);
    assert.equal(resolveIdentityDriver(), mine);
    setIdentityDriverForTesting(null);
    assert.notEqual(resolveIdentityDriver(), mine);
  });
});
