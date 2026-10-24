import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  finishEnrolment,
  keysOf,
  openPinCopy,
  prepareEnrolment,
  signForPin,
  unlockWithBiometrics,
} from "@/lib/device/core";
import { createNativeKeyOps } from "@/lib/device/native";
import { randomSecretHex } from "@/lib/crypto/keys";
import { FakeDevicePlugin } from "../../features/support/fake_device_plugin";

const vault = () => crypto.getRandomValues(new Uint8Array(32));

describe("enrolment", () => {
  test("without biometrics: one signing key, no biometric copy", async () => {
    const prepared = await prepareEnrolment(false);
    assert.equal(prepared.biometricSigningKey, null);
    assert.equal(prepared.biometricPublicKey, null);
    assert.equal(prepared.biometricWrapKey, null);
    assert.match(prepared.deviceSecretHex, /^[0-9a-f]{64}$/);
    const state = await finishEnrolment(prepared, {
      deviceId: "dev-1",
      email: "a@b.test",
      serverShareHex: randomSecretHex(),
      vaultKeyBytes: vault(),
    });
    assert.equal(state.biometricCopy, null);
    assert.equal(keysOf(state).length, 1);
    await assert.rejects(unlockWithBiometrics(state, "c"), /not set up/);
  });

  test("hardware keys get fresh aliases every time, so re-enrolling never overwrites keys in use", async () => {
    const plugin = new FakeDevicePlugin();
    const ops = createNativeKeyOps(plugin);
    const a = await prepareEnrolment(true, ops);
    const b = await prepareEnrolment(true, ops);
    const aliases = [...keysOf(a), ...keysOf(b)].map((k) => (k as { alias: string }).alias);
    assert.equal(new Set(aliases).size, 6);
    for (const alias of aliases) assert.match(alias, /^virasat\.[0-9a-f]{16}\.(signing|biometric|wrap)$/);
    assert.equal(plugin.keys.size, 6);
    assert.equal(plugin.keys.get(aliases[0])!.biometric, false, "the signing key has no biometric gate");
    assert.equal(plugin.keys.get(aliases[1])!.biometric, true);
    assert.equal(plugin.keys.get(aliases[2])!.biometric, true);
  });

  test("the PIN copy and the biometric copy open the same vault key, on a phone", async () => {
    const plugin = new FakeDevicePlugin();
    const ops = createNativeKeyOps(plugin);
    const vaultKeyBytes = vault();
    const share = randomSecretHex();
    const state = await finishEnrolment(
      await prepareEnrolment(true, ops),
      { deviceId: "dev-1", email: "a@b.test", serverShareHex: share, vaultKeyBytes },
      ops
    );
    assert.equal(state.biometricCopy!.ivHex, "", "the hardware's format has no separate IV");
    assert.deepEqual(await openPinCopy(state, share), vaultKeyBytes);
    const unlocked = await unlockWithBiometrics(state, "challenge", "Open your notes", ops);
    assert.deepEqual(unlocked!.vaultKeyBytes, vaultKeyBytes);
    assert.ok((await signForPin(state, "challenge", ops)).length > 0);
    await assert.rejects(openPinCopy(state, randomSecretHex()));
  });
});

describe("keysOf", () => {
  test("lists only the keys an enrolment made", async () => {
    const withAll = await prepareEnrolment(true);
    assert.equal(keysOf(withAll).length, 3);
    assert.deepEqual(keysOf({ signingKey: { alias: "s" }, biometricSigningKey: null, biometricWrapKey: null }), [{ alias: "s" }]);
  });
});
