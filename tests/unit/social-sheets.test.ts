import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import {
  createNativeSocialSheets,
  socialSheets,
  socialSheetsConfigFromBuild,
  type SheetAnswer,
  type SocialLoginPlugin,
} from "@/lib/auth/socialSheets";
import { setIdentityDriverForTesting } from "@/lib/auth/providers";
import { OIDC_ISSUERS, createNativeIdentityDriver } from "@/lib/auth/providers/native";
import type { InitializeOptions, LoginOptions } from "@capgo/capacitor-social-login";
import { freshClient, quietConsole, requests, resetServer, serveApiInProcess } from "./harness";

const FULL = {
  googleIosClientId: "ios.apps.googleusercontent.com",
  googleWebClientId: "web.apps.googleusercontent.com",
  facebookAppId: "1234",
  facebookClientToken: "ct",
};

/** A plugin that records what it was asked and answers as told. */
function fakePlugin(answer: (o: LoginOptions) => SheetAnswer | Promise<SheetAnswer>) {
  const initialised: InitializeOptions[] = [];
  const logins: LoginOptions[] = [];
  const plugin: SocialLoginPlugin = {
    async initialize(o) {
      initialised.push(o);
    },
    async login(o) {
      logins.push(o);
      return answer(o);
    },
  };
  return { plugin, initialised, logins };
}

describe("which providers the app offers", () => {
  test("iOS: Apple first, then the others once configured", () => {
    assert.deepEqual(createNativeSocialSheets(fakePlugin(() => ({ result: {} })).plugin, "ios", FULL).available(), [
      "apple",
      "google",
      "facebook",
    ]);
    assert.deepEqual(createNativeSocialSheets(fakePlugin(() => ({ result: {} })).plugin, "ios", {}).available(), ["apple"]);
  });

  test("Android: no Apple, and Google needs the web client id", () => {
    const p = fakePlugin(() => ({ result: {} })).plugin;
    assert.deepEqual(createNativeSocialSheets(p, "android", FULL).available(), ["google", "facebook"]);
    assert.deepEqual(createNativeSocialSheets(p, "android", { googleIosClientId: "x" }).available(), []);
    assert.deepEqual(createNativeSocialSheets(p, "android", { facebookAppId: "1" }).available(), [], "Facebook needs its client token too");
  });

  test("the list handed out is a copy", () => {
    const sheets = createNativeSocialSheets(fakePlugin(() => ({ result: {} })).plugin, "ios", {});
    sheets.available().push("google");
    assert.deepEqual(sheets.available(), ["apple"]);
  });
});

describe("signing in through a sheet", () => {
  test("initialises the plugin once, with only what is configured", async () => {
    const f = fakePlugin(() => ({ result: { idToken: "t" } }));
    const sheets = createNativeSocialSheets(f.plugin, "ios", FULL);
    await sheets.signIn("google", "n");
    await sheets.signIn("apple", "n");
    assert.equal(f.initialised.length, 1);
    assert.deepEqual(f.initialised[0], {
      apple: {},
      google: { iOSClientId: FULL.googleIosClientId, webClientId: FULL.googleWebClientId, mode: "online" },
      facebook: { appId: "1234", clientToken: "ct" },
    });

    const android = fakePlugin(() => ({ result: { idToken: "t" } }));
    await createNativeSocialSheets(android.plugin, "android", { googleWebClientId: "web" }).signIn("google", "n");
    assert.deepEqual(android.initialised[0], { google: { webClientId: "web", mode: "online" } });
  });

  test("a failed initialisation is tried again next time", async () => {
    let first = true;
    const plugin: SocialLoginPlugin = {
      async initialize() {
        if (first) {
          first = false;
          throw new Error("not yet");
        }
      },
      async login() {
        return { result: { idToken: "t" } };
      },
    };
    const sheets = createNativeSocialSheets(plugin, "ios", {});
    await assert.rejects(sheets.signIn("apple", "n"), /not yet/);
    assert.deepEqual(await sheets.signIn("apple", "n"), { token: "t", name: null });
  });

  test("Apple gets the nonce's SHA-256, and gives back the name it shares once", async () => {
    const f = fakePlugin(() => ({ result: { idToken: "apple-jwt", profile: { givenName: "Meera", familyName: "Sharma" } } }));
    const result = await createNativeSocialSheets(f.plugin, "ios", {}).signIn("apple", "server-nonce");
    assert.deepEqual(result, { token: "apple-jwt", name: "Meera Sharma" });
    assert.deepEqual(f.logins[0], {
      provider: "apple",
      options: { scopes: ["name", "email"], nonce: createHash("sha256").update("server-nonce").digest("hex") },
    });
  });

  test("a later Apple sign-in, with no name, gives none", async () => {
    const f = fakePlugin(() => ({ result: { idToken: "apple-jwt", profile: { givenName: null, familyName: null } } }));
    assert.deepEqual(await createNativeSocialSheets(f.plugin, "ios", {}).signIn("apple", "n"), { token: "apple-jwt", name: null });
  });

  test("Google gets the nonce as it is, and its name stays in its token", async () => {
    const f = fakePlugin(() => ({ result: { idToken: "google-jwt", profile: { givenName: "Ignored" } } }));
    assert.deepEqual(await createNativeSocialSheets(f.plugin, "ios", FULL).signIn("google", "n"), { token: "google-jwt", name: null });
    assert.deepEqual(f.logins[0], { provider: "google", options: { scopes: ["email", "profile"], nonce: "n" } });
  });

  test("Facebook: the Limited Login ID token if there is one, else the access token", async () => {
    const limited = fakePlugin(() => ({ result: { idToken: "fb-jwt", accessToken: { token: "EAAB" } } }));
    assert.deepEqual(await createNativeSocialSheets(limited.plugin, "ios", FULL).signIn("facebook", "n"), { token: "fb-jwt", name: null });
    assert.deepEqual(limited.logins[0], { provider: "facebook", options: { permissions: ["email", "public_profile"], nonce: "n" } });
    const classic = fakePlugin(() => ({ result: { idToken: null, accessToken: { token: "EAAB" } } }));
    assert.deepEqual(await createNativeSocialSheets(classic.plugin, "android", FULL).signIn("facebook", "n"), { token: "EAAB", name: null });
  });

  test("an answer with no token is treated as closed, and an access token is only taken from Facebook", async () => {
    for (const [provider, result] of [
      ["apple", {}],
      ["google", { accessToken: { token: "not-an-id-token" } }],
      ["facebook", { accessToken: null }],
    ] as const) {
      const f = fakePlugin(() => ({ result }));
      assert.equal(await createNativeSocialSheets(f.plugin, "ios", FULL).signIn(provider, "n"), null, provider);
    }
    const nothing = fakePlugin(() => ({ result: undefined }));
    assert.equal(await createNativeSocialSheets(nothing.plugin, "ios", {}).signIn("apple", "n"), null);
  });

  test("closing the sheet is not an error; anything else is", async () => {
    for (const err of [new Error("User cancelled"), Object.assign(new Error("x"), { code: "CANCELED" }), new Error("The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)")]) {
      const f = fakePlugin(() => {
        throw err;
      });
      assert.equal(await createNativeSocialSheets(f.plugin, "ios", {}).signIn("apple", "n"), null, err.message);
    }
    const broken = fakePlugin(() => {
      throw new Error("Developer error: missing client id");
    });
    await assert.rejects(createNativeSocialSheets(broken.plugin, "ios", {}).signIn("apple", "n"), /Developer error/);
    const thrownString = fakePlugin(() => {
      throw "plain string";
    });
    await assert.rejects(createNativeSocialSheets(thrownString.plugin, "ios", {}).signIn("apple", "n"), (e) => e === "plain string");
  });

  test("a provider that is not offered is refused before any sheet opens", async () => {
    const f = fakePlugin(() => ({ result: { idToken: "t" } }));
    await assert.rejects(createNativeSocialSheets(f.plugin, "android", {}).signIn("apple", "n"), /not available in this app/);
    assert.equal(f.initialised.length + f.logins.length, 0);
  });
});

describe("the build's settings and the shared sheets", () => {
  test("read the four public settings, treating empty as unset", () => {
    const saved = { ...process.env };
    try {
      process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID = "ios";
      process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = "";
      process.env.NEXT_PUBLIC_FACEBOOK_APP_ID = "1";
      process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_TOKEN = "ct";
      assert.deepEqual(socialSheetsConfigFromBuild(), {
        googleIosClientId: "ios",
        googleWebClientId: undefined,
        facebookAppId: "1",
        facebookClientToken: "ct",
      });
    } finally {
      process.env = saved;
    }
  });

  test("outside the app there are no sheets, and asking for one says where they are", async () => {
    const sheets = await socialSheets();
    assert.deepEqual(sheets.available(), []);
    await assert.rejects(sheets.signIn("apple", "n"), /only in the Virasat app/);
    assert.equal(await socialSheets(), sheets, "shared");
  });
});

/* ---------------------------------------------------------------------- */

describe("continueWithProviderSheet, end to end with the real server", () => {
  let client: ReturnType<typeof freshClient>;
  let restore: () => void;
  let google: { privateKey: CryptoKey; jwk: JWK };

  serveApiInProcess();
  beforeEach(async () => {
    restore = quietConsole();
    resetServer();
    client = freshClient();
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    google = { privateKey: privateKey as CryptoKey, jwk: { ...(await exportJWK(publicKey)), kid: "g1", alg: "RS256" } };
    setIdentityDriverForTesting(
      createNativeIdentityDriver(
        { apple: { clientIds: ["com.virasat.app"] }, google: { clientIds: ["web.apps.googleusercontent.com"] }, facebook: null },
        {
          keySet: () => createLocalJWKSet({ keys: [google.jwk] }),
          fetch,
          now: () => Math.floor(Date.now() / 1000),
        }
      )
    );
  });
  afterEach(() => {
    setIdentityDriverForTesting(null);
    restore();
  });

  /** Google's sheet: signs a real ID token over whatever nonce the app passes. */
  function googleSheet(claims: Record<string, unknown>) {
    const plugin: SocialLoginPlugin = {
      async initialize() {},
      async login(o) {
        const nonce = (o.options as { nonce: string }).nonce;
        const idToken = await new SignJWT({ nonce, ...claims })
          .setProtectedHeader({ alg: "RS256", kid: "g1" })
          .setIssuer(OIDC_ISSUERS.google.issuers[0])
          .setAudience("web.apps.googleusercontent.com")
          .setSubject("google-sub-1")
          .setIssuedAt()
          .setExpirationTime("10m")
          .sign(google.privateKey);
        return { result: { idToken } };
      },
    };
    return createNativeSocialSheets(plugin, "android", { googleWebClientId: "web.apps.googleusercontent.com" });
  }

  test("a new person: the server checks Google's token and asks them to sign up", async () => {
    const result = await client.continueWithProviderSheet(
      "google",
      googleSheet({ email: "meera@gmail.com", email_verified: true, name: "Meera" })
    );
    assert.equal(result?.status, "signup");
    assert.equal((result as { email: string }).email, "meera@gmail.com");
    assert.equal((result as { name: string }).name, "Meera");
    assert.deepEqual(requests, ["POST /api/auth/social/nonce", "POST /api/auth/social"]);
  });

  test("Apple: the name from the first authorization reaches the sign-up form, through the API", async () => {
    const apple = createNativeSocialSheets(
      {
        async initialize() {},
        async login(o) {
          const nonce = (o.options as { nonce: string }).nonce; // already hashed by the sheet
          const idToken = await new SignJWT({ nonce, email: "x@privaterelay.appleid.com", email_verified: "true" })
            .setProtectedHeader({ alg: "RS256", kid: "g1" })
            .setIssuer(OIDC_ISSUERS.apple.issuers[0])
            .setAudience("com.virasat.app")
            .setSubject("apple-sub-1")
            .setIssuedAt()
            .setExpirationTime("10m")
            .sign(google.privateKey);
          return { result: { idToken, profile: { givenName: "Meera", familyName: "Sharma" } } };
        },
      },
      "ios",
      {}
    );
    const result = await client.continueWithProviderSheet("apple", apple);
    assert.equal(result?.status, "signup");
    assert.equal((result as { name: string }).name, "Meera Sharma");
    assert.equal((result as { emailVerified: boolean }).emailVerified, true);
  });

  test("closing the sheet sends nothing but the nonce request", async () => {
    const closed = createNativeSocialSheets(
      {
        async initialize() {},
        async login() {
          throw new Error("User cancelled the sign-in flow");
        },
      },
      "android",
      { googleWebClientId: "web.apps.googleusercontent.com" }
    );
    assert.equal(await client.continueWithProviderSheet("google", closed), null);
    assert.deepEqual(requests, ["POST /api/auth/social/nonce"]);
  });

  test("a token the server does not believe is an error, not a sign-in", async () => {
    const forged = createNativeSocialSheets(
      {
        async initialize() {},
        async login() {
          return { result: { idToken: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0." } };
        },
      },
      "android",
      { googleWebClientId: "web.apps.googleusercontent.com" }
    );
    await assert.rejects(client.continueWithProviderSheet("google", forged), /could not be confirmed/);
    assert.equal(client.getAuthState().status, "starting");
  });
});
