import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { deviceBridge, setDeviceBridgeForTesting, type DeviceBridge } from "@/lib/device/bridge";
import { createNativeBridgeWith } from "@/lib/device/native";
import { FakeDevicePlugin } from "../../features/support/fake_device_plugin";

afterEach(() => {
  setDeviceBridgeForTesting(null);
  delete process.env.NEXT_PUBLIC_NATIVE;
});

describe("the browser harness bridge", () => {
  test("is the default outside the native build", () => {
    const bridge = deviceBridge();
    assert.equal(bridge.platform, "browser");
    assert.equal(deviceBridge(), bridge, "one bridge per page");
  });

  test("offers a simulated Face ID that always says yes", async () => {
    const bridge = deviceBridge();
    assert.deepEqual(await bridge.biometrics(), { available: true, label: "Face ID" });
    assert.equal(await bridge.promptBiometrics("Turn on Face ID"), true);
    assert.equal(await bridge.defaultDeviceName(), "This browser");
    const { key } = await bridge.keys.createSigningKey("x", true);
    assert.ok(!("alias" in key), "the harness keeps CryptoKeys, not aliases");
  });

  test("behaves as an empty phone where storage is unavailable (private window, Node)", async () => {
    // There is no indexedDB here, exactly like a browser that blocks it.
    assert.equal(typeof (globalThis as { indexedDB?: unknown }).indexedDB, "undefined");
    const bridge = deviceBridge();
    assert.equal(await bridge.loadDevice(), null);
    assert.equal(await bridge.loadRefreshToken(), null);
    assert.equal(await bridge.loadRecoveryToken(), null);
    await bridge.saveRefreshToken("rt");
    await bridge.saveRecoveryToken("rec");
    await bridge.forgetDevice();
    assert.equal(await bridge.loadRefreshToken(), null);
  });
});

describe("choosing the bridge", () => {
  test("the native build never falls back to the browser harness", () => {
    process.env.NEXT_PUBLIC_NATIVE = "1";
    // Outside the app, with no plugin: it refuses rather than use IndexedDB.
    assert.throws(() => deviceBridge(), /only inside the iOS or Android app/);
  });

  test("a bridge set for testing is used until it is cleared", () => {
    const phone: DeviceBridge = createNativeBridgeWith(new FakeDevicePlugin(), "ios");
    setDeviceBridgeForTesting(phone);
    assert.equal(deviceBridge(), phone);
    setDeviceBridgeForTesting(null);
    assert.equal(deviceBridge().platform, "browser");
  });
});
