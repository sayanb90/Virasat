import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer as createH2Server } from "node:http2";
import { decodeProtectedHeader, jwtVerify, importSPKI } from "jose";
import { apnsConfigFromEnv, createApnsDriver, http2Transport, type ApnsConfig, type ApnsTransport } from "@/lib/push/drivers/apns";
import { createFcmDriver, fcmConfigFromEnv, type FcmConfig } from "@/lib/push/drivers/fcm";
import { createConsolePushDriver, pushOutbox, resetPushOutbox } from "@/lib/push/drivers/console";
import { createNativePushDriver, resolvePushDriver, sendPush, setPushDriverForTesting } from "@/lib/push";
import type { PushMessage } from "@/lib/push/types";

const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = (k: KeyObject, type: "pkcs8" | "spki") => String(k.export({ type, format: "pem" }));

const APNS: ApnsConfig = { keyP8: pem(ec.privateKey, "pkcs8"), keyId: "KEY123", teamId: "TEAM456", topic: "com.virasat.app", sandbox: false };
const FCM: FcmConfig = { projectId: "virasat-test", clientEmail: "push@virasat-test.iam.gserviceaccount.com", privateKey: pem(rsa.privateKey, "pkcs8") };
const MSG: PushMessage = { token: "a1b2c3d4e5f6a1b2c3d4e5f6", platform: "ios", title: "T", body: "B", data: { kind: "recovery-started" } };

function recordingTransport(answers: Array<{ status: number; body?: string } | Error>) {
  const calls: Parameters<ApnsTransport>[0][] = [];
  const transport: ApnsTransport = async (args) => {
    calls.push(args);
    const next = answers.shift() ?? { status: 200 };
    if (next instanceof Error) throw next;
    return { status: next.status, body: next.body ?? "" };
  };
  return { transport, calls };
}

describe("APNs", () => {
  test("sends an alert to the token's path, with a provider token Apple can verify", async () => {
    const { transport, calls } = recordingTransport([{ status: 200 }]);
    assert.deepEqual(await createApnsDriver(APNS, transport).send(MSG), { ok: true });
    const [call] = calls;
    assert.equal(call.origin, "https://api.push.apple.com");
    assert.equal(call.path, `/3/device/${MSG.token}`);
    assert.equal(call.headers["apns-topic"], "com.virasat.app");
    assert.equal(call.headers["apns-push-type"], "alert");
    assert.deepEqual(JSON.parse(call.body), { aps: { alert: { title: "T", body: "B" }, sound: "default" }, kind: "recovery-started" });
    const jwt = call.headers.authorization.replace(/^bearer /, "");
    assert.deepEqual(decodeProtectedHeader(jwt), { alg: "ES256", kid: "KEY123" });
    const { payload } = await jwtVerify(jwt, await importSPKI(pem(ec.publicKey, "spki"), "ES256"));
    assert.equal(payload.iss, "TEAM456");
  });

  test("reuses the provider token for 50 minutes, then makes a new one", async () => {
    let t = 1_800_000_000;
    const { transport, calls } = recordingTransport([]);
    const driver = createApnsDriver(APNS, transport, () => t);
    await driver.send(MSG);
    t += 49 * 60;
    await driver.send(MSG);
    t += 2 * 60;
    await driver.send(MSG);
    const tokens = calls.map((c) => c.headers.authorization);
    assert.equal(tokens[0], tokens[1]);
    assert.notEqual(tokens[1], tokens[2]);
  });

  test("the sandbox for development builds", async () => {
    const { transport, calls } = recordingTransport([]);
    await createApnsDriver({ ...APNS, sandbox: true }, transport).send(MSG);
    assert.equal(calls[0].origin, "https://api.sandbox.push.apple.com");
  });

  test("a removed app or a bad token is gone; other refusals are not", async () => {
    const cases: Array<[{ status: number; body?: string }, boolean, RegExp]> = [
      [{ status: 410, body: '{"reason":"Unregistered"}' }, true, /Unregistered/],
      [{ status: 400, body: '{"reason":"BadDeviceToken"}' }, true, /BadDeviceToken/],
      [{ status: 429, body: '{"reason":"TooManyRequests"}' }, false, /TooManyRequests/],
      [{ status: 500, body: "not json" }, false, /HTTP 500/],
      [{ status: 503 }, false, /HTTP 503/],
    ];
    for (const [answer, gone, error] of cases) {
      const r = await createApnsDriver(APNS, recordingTransport([answer]).transport).send(MSG);
      assert.equal(r.ok, false);
      assert.equal((r as { gone?: boolean }).gone, gone, JSON.stringify(answer));
      assert.match((r as { error: string }).error, error);
    }
  });

  test("an expired provider token is replaced on the next send", async () => {
    const { transport, calls } = recordingTransport([{ status: 403, body: '{"reason":"ExpiredProviderToken"}' }, { status: 200 }]);
    let t = 1_800_000_000;
    const driver = createApnsDriver(APNS, transport, () => t);
    assert.equal((await driver.send(MSG)).ok, false);
    t += 1;
    assert.equal((await driver.send(MSG)).ok, true);
    assert.notEqual(calls[0].headers.authorization, calls[1].headers.authorization);
  });

  test("unreachable is a failure, not an exception", async () => {
    const r = await createApnsDriver(APNS, recordingTransport([new Error("ECONNRESET")]).transport).send(MSG);
    assert.deepEqual(r, { ok: false, error: "APNs unreachable: ECONNRESET" });
  });

  test("configuration: all four settings, with escaped newlines allowed in the key", () => {
    const env = { APNS_KEY_P8: "-----BEGIN\\nX", APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_TOPIC: "com.virasat.app" };
    assert.deepEqual(apnsConfigFromEnv(env), { keyP8: "-----BEGIN\nX", keyId: "K", teamId: "T", topic: "com.virasat.app", sandbox: false });
    assert.equal(apnsConfigFromEnv({ ...env, APNS_SANDBOX: "1" })!.sandbox, true);
    assert.equal(apnsConfigFromEnv({ ...env, APNS_TOPIC: undefined }), null);
  });

  test("the HTTP/2 transport speaks HTTP/2", async () => {
    const server = createH2Server();
    server.on("stream", (stream, headers) => {
      let body = "";
      stream.on("data", (c) => (body += c));
      stream.on("end", () => {
        stream.respond({ ":status": 200 });
        stream.end(JSON.stringify({ path: headers[":path"], method: headers[":method"], topic: headers["apns-topic"], body }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as { port: number };
    try {
      const res = await http2Transport({ origin: `http://127.0.0.1:${port}`, path: "/3/device/abc", headers: { "apns-topic": "t" }, body: "{}" });
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { path: "/3/device/abc", method: "POST", topic: "t", body: "{}" });
      await assert.rejects(http2Transport({ origin: "http://127.0.0.1:1", path: "/", headers: {}, body: "" }));
    } finally {
      server.close();
    }
  });
});

describe("FCM", () => {
  function fakeGoogle(answers: { token?: { status: number; body: unknown }; send?: Array<{ status: number; body?: unknown }> } = {}) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    let exchanges = 0;
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url === "https://oauth2.googleapis.com/token") {
        exchanges++;
        const a = answers.token ?? { status: 200, body: { access_token: `at-${exchanges}`, expires_in: 3600 } };
        return new Response(JSON.stringify(a.body), { status: a.status });
      }
      const a = answers.send?.shift() ?? { status: 200, body: { name: "projects/x/messages/1" } };
      return new Response(a.body === undefined ? "" : JSON.stringify(a.body), { status: a.status });
    }) as typeof fetch;
    return { impl, calls, exchanges: () => exchanges };
  }
  const ANDROID: PushMessage = { ...MSG, platform: "android", token: "fcm:token-abc_123" };

  test("exchanges a signed assertion for an access token, then sends the message", async () => {
    const g = fakeGoogle();
    assert.deepEqual(await createFcmDriver(FCM, g.impl).send(ANDROID), { ok: true });
    const [exchange, send] = g.calls;
    const form = new URLSearchParams(String(exchange.init.body));
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    const { payload } = await jwtVerify(form.get("assertion")!, await importSPKI(pem(rsa.publicKey, "spki"), "RS256"));
    assert.equal(payload.iss, FCM.clientEmail);
    assert.equal(payload.aud, "https://oauth2.googleapis.com/token");
    assert.equal(payload.scope, "https://www.googleapis.com/auth/firebase.messaging");
    assert.equal(send.url, "https://fcm.googleapis.com/v1/projects/virasat-test/messages:send");
    assert.equal((send.init.headers as Record<string, string>).Authorization, "Bearer at-1");
    assert.deepEqual(JSON.parse(String(send.init.body)), {
      message: { token: ANDROID.token, notification: { title: "T", body: "B" }, data: { kind: "recovery-started" }, android: { priority: "HIGH" } },
    });
  });

  test("keeps the access token until a minute before it expires", async () => {
    let t = 1_800_000_000;
    const g = fakeGoogle();
    const driver = createFcmDriver(FCM, g.impl, () => t);
    await driver.send(ANDROID);
    t += 3500;
    await driver.send(ANDROID);
    assert.equal(g.exchanges(), 1);
    t += 50;
    await driver.send(ANDROID);
    assert.equal(g.exchanges(), 2);
  });

  test("an unregistered token is gone; a 404 alone is not, and a 401 renews the access token", async () => {
    const gone = await createFcmDriver(FCM, fakeGoogle({ send: [{ status: 404, body: { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } } }] }).impl).send(ANDROID);
    assert.deepEqual(gone, { ok: false, error: "FCM: UNREGISTERED", gone: true });
    const notFound = await createFcmDriver(FCM, fakeGoogle({ send: [{ status: 404, body: { error: { status: "NOT_FOUND" } } }] }).impl).send(ANDROID);
    assert.deepEqual(notFound, { ok: false, error: "FCM: NOT_FOUND", gone: false });
    const g = fakeGoogle({ send: [{ status: 401 }, { status: 200, body: {} }] });
    const driver = createFcmDriver(FCM, g.impl);
    assert.deepEqual(await driver.send(ANDROID), { ok: false, error: "FCM: HTTP 401", gone: false });
    assert.equal((await driver.send(ANDROID)).ok, true);
    assert.equal(g.exchanges(), 2);
  });

  test("a failed token exchange is a failure, not an exception", async () => {
    const r = await createFcmDriver(FCM, fakeGoogle({ token: { status: 400, body: { error: "invalid_grant" } } }).impl).send(ANDROID);
    assert.deepEqual(r, { ok: false, error: "FCM unreachable: token exchange failed (HTTP 400)" });
  });

  test("by default, uses the global fetch and the real clock; no data is sent as none, no expiry as an hour", async () => {
    const real = globalThis.fetch;
    const g = fakeGoogle({ token: { status: 200, body: { access_token: "at-default" } } });
    globalThis.fetch = g.impl;
    try {
      const driver = createFcmDriver(FCM);
      assert.deepEqual(await driver.send({ ...ANDROID, data: undefined }), { ok: true });
      await driver.send(ANDROID);
      assert.equal(g.exchanges(), 1, "an access token with no expires_in is kept for an hour");
      assert.deepEqual(JSON.parse(String(g.calls[1].init.body)).message.data, {});
    } finally {
      globalThis.fetch = real;
    }
  });

  test("configuration from the service account file", () => {
    const json = JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" });
    assert.deepEqual(fcmConfigFromEnv({ FCM_SERVICE_ACCOUNT_JSON: json }), { projectId: "p", clientEmail: "e", privateKey: "k" });
    assert.equal(fcmConfigFromEnv({}), null);
    assert.equal(fcmConfigFromEnv({ FCM_SERVICE_ACCOUNT_JSON: "{not json" }), null);
    assert.equal(fcmConfigFromEnv({ FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"p"}' }), null);
  });
});

describe("choosing and using a driver", () => {
  afterEach(() => {
    setPushDriverForTesting(null);
    resetPushOutbox();
    delete process.env.PUSH_DRIVER;
  });

  test("console by default: records, says so, and succeeds", async () => {
    const info = console.info;
    const lines: string[] = [];
    console.info = (l: string) => void lines.push(l);
    try {
      assert.equal(resolvePushDriver().name, "console");
      assert.deepEqual(await createConsolePushDriver().send(MSG), { ok: true });
    } finally {
      console.info = info;
    }
    assert.deepEqual(pushOutbox, [MSG]);
    assert.match(lines[0], /ios …d4e5f6: T/);
  });

  test("native routes each platform to its own service, and says which is not set up", async () => {
    process.env.PUSH_DRIVER = "native";
    assert.equal(resolvePushDriver().name, "native");
    const driver = createNativePushDriver({});
    assert.match((await driver.send(MSG) as { error: string }).error, /iOS is not set up: APNS_KEY_P8/);
    assert.match((await driver.send({ ...MSG, platform: "android" }) as { error: string }).error, /Android is not set up: FCM_SERVICE_ACCOUNT_JSON/);
    const configured = createNativePushDriver({
      APNS_KEY_P8: APNS.keyP8,
      APNS_KEY_ID: "K",
      APNS_TEAM_ID: "T",
      APNS_TOPIC: "com.virasat.app",
      FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: "p", client_email: "e", private_key: FCM.privateKey }),
    });
    assert.equal(configured.name, "native");
  });

  test("sendPush never throws, and logs what was not delivered", async () => {
    const warn = console.warn;
    const lines: string[] = [];
    console.warn = (l: string) => void lines.push(l);
    try {
      setPushDriverForTesting({ name: "refusing", send: async () => ({ ok: false, error: "nope" }) });
      assert.deepEqual(await sendPush(MSG), { ok: false, error: "nope" });
      setPushDriverForTesting({
        name: "throwing",
        send: async () => {
          throw new Error("boom");
        },
      });
      assert.deepEqual(await sendPush(MSG), { ok: false, error: "boom" });
    } finally {
      console.warn = warn;
    }
    assert.match(lines[0], /not delivered to ios: nope/);
    assert.match(lines[1], /failed: boom/);
  });
});
