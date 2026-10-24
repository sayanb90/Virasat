import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import {
  createNativeBridge,
  createNativeBridgeWith,
  createNativeKeyOps,
  pointToJwk,
  type VirasatDevicePlugin,
} from "@/lib/device/native";
import { BiometricsChangedError } from "@/lib/device/keyops";
import { base64ToBytes } from "@/lib/device/der";
import type { DeviceState } from "@/lib/device/core";
import { FakeDevicePlugin } from "../../features/support/fake_device_plugin";

/** A plugin whose every method fails, with some overridden. */
function pluginWith(overrides: Partial<VirasatDevicePlugin>): VirasatDevicePlugin {
  const fail = async () => {
    throw new Error("not in this test");
  };
  return new Proxy(overrides as VirasatDevicePlugin, {
    get: (target, prop: string) => (target as unknown as Record<string, unknown>)[prop] ?? fail,
  });
}

const STATE: DeviceState = {
  deviceId: "dev-1",
  email: "meera@example.com",
  signingKey: { alias: "virasat.aa.signing" },
  biometricSigningKey: { alias: "virasat.aa.biometric" },
  biometricWrapKey: { alias: "virasat.aa.wrap" },
  deviceSecretHex: "00".repeat(32),
  pinCopy: { ivHex: "01".repeat(12), ciphertextHex: "02".repeat(48) },
  biometricCopy: { ivHex: "", ciphertextHex: "03".repeat(256) },
};

describe("pointToJwk", () => {
  test("an uncompressed point becomes the JWK the server stores", async () => {
    const plugin = new FakeDevicePlugin();
    const { publicKey } = await plugin.createKey({ alias: "k", purpose: "sign", biometric: false });
    const jwk = pointToJwk(base64ToBytes(publicKey));
    const expected = plugin.keys.get("k")!.publicKey.export({ format: "jwk" });
    assert.deepEqual(jwk, { kty: "EC", crv: "P-256", x: expected.x, y: expected.y });
  });

  test("anything else is refused", () => {
    assert.throws(() => pointToJwk(new Uint8Array(64)), /uncompressed P-256 point/);
    const compressed = new Uint8Array(65);
    compressed[0] = 0x02;
    assert.throws(() => pointToJwk(compressed), /uncompressed/);
  });
});

describe("createNativeKeyOps", () => {
  test("signatures come back DER and leave as raw r‖s that verify", async () => {
    const plugin = new FakeDevicePlugin();
    const ops = createNativeKeyOps(plugin);
    const { key, publicJwk } = await ops.createSigningKey("virasat.t.signing", false);
    assert.deepEqual(key, { alias: "virasat.t.signing" });
    const signature = await ops.sign(key, "नमस्ते challenge");
    const pub = createPublicKey({ key: publicJwk, format: "jwk" });
    assert.equal(base64ToBytes(signature).length, 64);
    assert.ok(verify("sha256", Buffer.from("नमस्ते challenge"), { key: pub, dsaEncoding: "ieee-p1363" }, base64ToBytes(signature)));
  });

  test("a browser CryptoKey is refused, as a rejected promise", async () => {
    const ops = createNativeKeyOps(new FakeDevicePlugin());
    const { privateKey } = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
    ])) as CryptoKeyPair;
    await assert.rejects(ops.sign(privateKey, "c"), /browser key reached the phone/);
  });

  test("a cancelled prompt, or an answer missing a part, opens nothing", async () => {
    const copy = { ivHex: "", ciphertextHex: "00" };
    const args = { signingKey: { alias: "s" }, wrapKey: { alias: "w" }, copy, challenge: "c", reason: "r" };
    for (const answer of [
      { cancelled: true },
      { cancelled: false, signature: "AA==" },
      { cancelled: false, plaintext: "AA==" },
    ]) {
      const ops = createNativeKeyOps(pluginWith({ biometricUnlock: async () => answer }));
      assert.equal(await ops.biometricUnlock(args), null, JSON.stringify(answer));
    }
  });

  test("BIOMETRICS_CHANGED becomes BiometricsChangedError; other failures pass through", async () => {
    const args = {
      signingKey: { alias: "s" },
      wrapKey: { alias: "w" },
      copy: { ivHex: "", ciphertextHex: "00" },
      challenge: "c",
      reason: "r",
    };
    const changed = createNativeKeyOps(
      pluginWith({
        biometricUnlock: async () => {
          throw Object.assign(new Error("changed"), { code: "BIOMETRICS_CHANGED" });
        },
      })
    );
    await assert.rejects(changed.biometricUnlock(args), BiometricsChangedError);

    const locked = createNativeKeyOps(
      pluginWith({
        biometricUnlock: async () => {
          throw Object.assign(new Error("Too many attempts."), { code: "BIOMETRY_LOCKED" });
        },
      })
    );
    await assert.rejects(locked.biometricUnlock(args), (err: Error) => !(err instanceof BiometricsChangedError) && /Too many/.test(err.message));

    const odd = createNativeKeyOps(
      pluginWith({
        biometricUnlock: async () => {
          throw "a string, not an Error";
        },
      })
    );
    await assert.rejects(odd.biometricUnlock(args), (err: unknown) => err === "a string, not an Error");
  });

  test("the copy crosses the bridge as base64 of the stored hex", async () => {
    let seen = "";
    const ops = createNativeKeyOps(
      pluginWith({
        biometricUnlock: async (o) => {
          seen = o.ciphertext;
          return { cancelled: true };
        },
      })
    );
    await ops.biometricUnlock({
      signingKey: { alias: "s" },
      wrapKey: { alias: "w" },
      copy: { ivHex: "", ciphertextHex: "deadbeef" },
      challenge: "c",
      reason: "r",
    });
    assert.equal(seen, Buffer.from("deadbeef", "hex").toString("base64"));
  });

  test("discard deletes hardware keys, and asks nothing when there are none", async () => {
    const calls: string[][] = [];
    const ops = createNativeKeyOps(pluginWith({ deleteKeys: async ({ aliases }) => void calls.push(aliases) }));
    const { privateKey } = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
    ])) as CryptoKeyPair;
    await ops.discard([]);
    await ops.discard([privateKey]);
    await ops.discard([{ alias: "a" }, privateKey, { alias: "b" }]);
    assert.deepEqual(calls, [["a", "b"]]);
  });
});

describe("createNativeBridgeWith", () => {
  test("labels each kind of biometry as the screen should say it", async () => {
    const cases: Array<[string, boolean, string]> = [
      ["faceId", true, "Face ID"],
      ["touchId", true, "Touch ID"],
      ["opticId", true, "Optic ID"],
      ["fingerprint", true, "fingerprint"],
      ["face", true, "face unlock"],
      ["biometric", true, "fingerprint or face"],
      ["none", false, "Face ID"],
      ["something-new", true, "Face ID"],
    ];
    for (const [kind, available, label] of cases) {
      const bridge = createNativeBridgeWith(
        pluginWith({ biometry: async () => ({ available, kind: kind as "faceId" }) }),
        "ios"
      );
      assert.deepEqual(await bridge.biometrics(), { available, label }, kind);
    }
  });

  test("asks the phone once, but asks again after a failure", async () => {
    let calls = 0;
    const bridge = createNativeBridgeWith(
      pluginWith({
        biometry: async () => {
          calls++;
          if (calls === 1) throw new Error("not ready");
          return { available: true, kind: "touchId" as const };
        },
      }),
      "ios"
    );
    await assert.rejects(bridge.biometrics(), /not ready/);
    assert.equal((await bridge.biometrics()).label, "Touch ID");
    assert.equal((await bridge.biometrics()).label, "Touch ID");
    assert.equal(calls, 2);
  });

  test("promptBiometrics is true unless the person cancelled", async () => {
    const plugin = new FakeDevicePlugin();
    const bridge = createNativeBridgeWith(plugin, "android");
    assert.equal(bridge.platform, "android");
    assert.equal(await bridge.promptBiometrics("Turn on"), true);
    plugin.cancelNextPrompt = true;
    assert.equal(await bridge.promptBiometrics("Turn on"), false);
  });

  test("keeps the device state, refresh token and recovery token in secure storage", async () => {
    const plugin = new FakeDevicePlugin();
    const bridge = createNativeBridgeWith(plugin, "ios");
    assert.equal(await bridge.loadDevice(), null);
    assert.equal(await bridge.loadRefreshToken(), null);
    assert.equal(await bridge.loadRecoveryToken(), null);

    await bridge.saveDevice(STATE);
    await bridge.saveRefreshToken("rt-1");
    await bridge.saveRecoveryToken("rec-1");
    assert.deepEqual(await bridge.loadDevice(), STATE);
    assert.equal(await bridge.loadRefreshToken(), "rt-1");
    assert.equal(await bridge.loadRecoveryToken(), "rec-1");
    assert.deepEqual([...plugin.items.keys()].sort(), ["device", "recovery", "refresh"]);

    await bridge.saveRecoveryToken(null);
    assert.equal(await bridge.loadRecoveryToken(), null);
    assert.equal(plugin.items.has("recovery"), false);
  });

  test("forgetting the phone deletes its keys, its state and its sign-in, but not a pending recovery", async () => {
    const plugin = new FakeDevicePlugin();
    const bridge = createNativeBridgeWith(plugin, "ios");
    for (const k of [STATE.signingKey, STATE.biometricSigningKey, STATE.biometricWrapKey]) {
      await plugin.createKey({ alias: (k as { alias: string }).alias, purpose: "sign", biometric: false });
    }
    await plugin.createKey({ alias: "someone-elses", purpose: "sign", biometric: false });
    await bridge.saveDevice(STATE);
    await bridge.saveRefreshToken("rt");
    await bridge.saveRecoveryToken("rec");
    await bridge.forgetDevice();
    assert.deepEqual([...plugin.keys.keys()], ["someone-elses"]);
    assert.equal(await bridge.loadDevice(), null);
    assert.equal(await bridge.loadRefreshToken(), null);
    assert.equal(await bridge.loadRecoveryToken(), "rec");
  });

  test("forgetting a phone that was never set up is harmless", async () => {
    const bridge = createNativeBridgeWith(new FakeDevicePlugin(), "ios");
    await bridge.forgetDevice();
  });

  test("names the phone, or falls back to a plain name", async () => {
    assert.equal(await createNativeBridgeWith(new FakeDevicePlugin(), "ios").defaultDeviceName(), "Test iPhone");
    assert.equal(await createNativeBridgeWith(pluginWith({}), "ios").defaultDeviceName(), "iPhone");
    assert.equal(await createNativeBridgeWith(pluginWith({}), "android").defaultDeviceName(), "Android phone");
  });
});

describe("createNativeBridge", () => {
  const g = globalThis as unknown as Record<string, unknown> & { Capacitor: { PluginHeaders?: unknown[] } };
  afterEach(() => {
    delete g.androidBridge;
    delete g.Capacitor.PluginHeaders;
  });

  test("refuses to run outside the iOS or Android app", () => {
    assert.throws(() => createNativeBridge(), /only inside the iOS or Android app/);
  });

  test("refuses to run in an app that is missing its plugin", () => {
    g.androidBridge = {};
    assert.throws(() => createNativeBridge(), /missing its device plugin/);
  });

  test("binds the plugin inside the app", () => {
    g.androidBridge = {};
    g.Capacitor.PluginHeaders = [{ name: "VirasatDevice", methods: [] }];
    const bridge = createNativeBridge();
    assert.equal(bridge.platform, "android");
  });
});
