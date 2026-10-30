/**
 * lib/auth/client.ts on a phone: the app's own sign-in code, over the native
 * bridge (lib/device/native.ts) and a fake VirasatDevice plugin, against the
 * real API route handlers and store, in-process.
 */
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { setDeviceBridgeForTesting } from "@/lib/device/bridge";
import { createNativeBridgeWith, type VirasatDevicePlugin } from "@/lib/device/native";
import { BiometricsChangedError } from "@/lib/device/keyops";
import type { DeviceState } from "@/lib/device/core";
import { FakeDevicePlugin } from "../../features/support/fake_device_plugin";
import { freshClient, lastCode, quietConsole, requests, resetServer, serveApiInProcess } from "./harness";

const EMAIL = "meera@example.com";
const PASSWORD = "Mango-Tree-Rain-42";
const PIN = "482915";

let client: ReturnType<typeof freshClient>;
let plugin: FakeDevicePlugin;
let restoreConsole: () => void;

serveApiInProcess();

beforeEach(() => {
  restoreConsole = quietConsole();
  resetServer();
  plugin = new FakeDevicePlugin();
  setDeviceBridgeForTesting(createNativeBridgeWith(plugin, "ios"));
  client = freshClient();
});

afterEach(async () => {
  await client.signOut(); // clears the session's keep-alive timer
  setDeviceBridgeForTesting(null);
  restoreConsole();
});

async function signUp(useBiometrics = true): Promise<void> {
  await client.startSignUp(EMAIL);
  const { signupTicket } = await client.verifySignUpCode(EMAIL, lastCode(EMAIL));
  await client.finishSignUp({ signupTicket, name: "Meera", email: EMAIL, password: PASSWORD });
  assert.equal(client.getAuthState().status, "needs-device");
  await client.setUpThisPhone({ pin: PIN, useBiometrics });
}

/** What the plugin holds for this phone, parsed. */
function saved(): DeviceState {
  return JSON.parse(plugin.items.get("device")!) as DeviceState;
}

const alias = (k: unknown) => (k as { alias: string } | null)?.alias;

/** Closes the app and opens it again: the vault key is gone, the sign-in remembered. */
async function reopen(): Promise<void> {
  client.lock();
  await client.boot();
  assert.equal(client.getAuthState().status, "locked");
}

describe("setting up a phone with hardware keys", () => {
  test("enrols three hardware keys, keeps only references, and opens the vault", async () => {
    await signUp();
    const state = client.getAuthState();
    assert.equal(state.status, "unlocked");
    assert.deepEqual(state.device, { biometric: true, email: EMAIL });
    assert.match(state.vaultKeyHex, /^[0-9a-f]{64}$/);

    const device = saved();
    assert.ok(alias(device.signingKey) && alias(device.biometricSigningKey) && alias(device.biometricWrapKey));
    assert.equal(plugin.keys.size, 3);
    assert.ok(plugin.items.get("refresh"), "the refresh token is in secure storage");
    assert.equal(plugin.prompts, 1, "one prompt, to turn Face ID on");
  });

  test("the enrolment names the phone and its platform to the server", async () => {
    const { authStore } = await import("@/lib/auth/store");
    await signUp();
    const devices = [...authStore.devices.values()];
    assert.equal(devices.length, 1);
    assert.equal(devices[0].name, "Test iPhone");
    assert.equal(devices[0].platform, "ios");
    assert.ok(devices[0].biometricPublicKey);
  });

  test("a phone without biometrics enrols with the PIN only", async () => {
    setDeviceBridgeForTesting(
      createNativeBridgeWith(
        new Proxy(plugin, {
          get: (t, p) => (p === "biometry" ? async () => ({ available: false, kind: "none" }) : Reflect.get(t, p).bind(t)),
        }) as VirasatDevicePlugin,
        "android"
      )
    );
    await signUp(true);
    assert.deepEqual(client.getAuthState().device, { biometric: false, email: EMAIL });
    assert.equal(plugin.keys.size, 1);
    assert.equal(plugin.prompts, 0);
  });

  test("choosing not to use Face ID makes no biometric keys", async () => {
    await signUp(false);
    assert.equal(saved().biometricCopy, null);
    assert.equal(plugin.keys.size, 1);
  });

  test("cancelling the 'turn on' prompt stops, naming the phone's own biometry", async () => {
    setDeviceBridgeForTesting(
      createNativeBridgeWith(
        new Proxy(plugin, {
          get: (t, p) => (p === "biometry" ? async () => ({ available: true, kind: "touchId" }) : Reflect.get(t, p).bind(t)),
        }) as VirasatDevicePlugin,
        "ios"
      )
    );
    plugin.cancelNextPrompt = true;
    await assert.rejects(signUp(), /^Error: Touch ID was not turned on\. You can use your PIN instead\.$/);
    assert.equal(plugin.keys.size, 0, "nothing was made");
    assert.equal(client.getAuthState().status, "needs-device");
  });

  test("setting up without a vault key open asks to sign in again", async () => {
    await assert.rejects(client.setUpThisPhone({ pin: PIN, useBiometrics: true }), /Please sign in again/);
  });
});

describe("unlocking with Face ID", () => {
  test("one prompt signs the challenge and opens the vault", async () => {
    await signUp();
    const vaultKeyHex = client.getAuthState().vaultKeyHex;
    await reopen();
    const prompts = plugin.prompts;
    const signatures = plugin.signatures;

    assert.equal(await client.unlockWithFaceId(), true);
    assert.equal(client.getAuthState().status, "unlocked");
    assert.equal(client.getAuthState().vaultKeyHex, vaultKeyHex);
    assert.equal(plugin.prompts - prompts, 1, "exactly one prompt");
    assert.equal(plugin.signatures - signatures, 1);
  });

  test("cancelling leaves the app locked and sends nothing to the server", async () => {
    await signUp();
    await reopen();
    requests.length = 0;
    plugin.cancelNextPrompt = true;
    assert.equal(await client.unlockWithFaceId(), false);
    assert.equal(client.getAuthState().status, "locked");
    assert.deepEqual(requests, ["POST /api/auth/device/challenge"]);
  });

  test("a phone that is not set up says so", async () => {
    await assert.rejects(client.unlockWithFaceId(), /not set up yet/);
    await assert.rejects(client.unlockWithPin(PIN), /not set up yet/);
  });
});

describe("a new face or fingerprint on the phone", () => {
  test("switches Face ID off, deletes its dead keys, and the PIN still opens the vault", async () => {
    await signUp();
    const before = saved();
    await reopen();
    plugin.addFace();
    requests.length = 0;

    await assert.rejects(client.unlockWithFaceId(), BiometricsChangedError);
    assert.ok(!requests.includes("POST /api/auth/device/prove"), "no answer was sent");
    assert.deepEqual(client.getAuthState().device, { biometric: false, email: EMAIL });

    const after = saved();
    assert.equal(after.biometricSigningKey, null);
    assert.equal(after.biometricWrapKey, null);
    assert.equal(after.biometricCopy, null);
    assert.deepEqual(after.signingKey, before.signingKey, "the PIN's key is untouched");
    assert.deepEqual([...plugin.keys.keys()], [alias(before.signingKey)]);

    await client.unlockWithPin(PIN);
    assert.equal(client.getAuthState().status, "unlocked");
  });

  test("Face ID can be turned on again from an open vault, replacing every old key", async () => {
    await signUp();
    const first = saved();
    await reopen();
    plugin.addFace();
    await assert.rejects(client.unlockWithFaceId(), BiometricsChangedError);
    await client.unlockWithPin(PIN);

    client.prepareToSetUpAgain();
    await client.setUpThisPhone({ pin: PIN, useBiometrics: true });
    const second = saved();
    assert.deepEqual(client.getAuthState().device, { biometric: true, email: EMAIL });
    assert.notEqual(second.deviceId, first.deviceId, "the server enrolled a new device in place of the old");
    assert.deepEqual(
      [...plugin.keys.keys()].sort(),
      [alias(second.signingKey), alias(second.biometricSigningKey), alias(second.biometricWrapKey)].sort(),
      "the old enrolment's keys are gone"
    );

    await reopen();
    assert.equal(await client.unlockWithFaceId(), true);
  });

  test("setting up again needs the vault open", async () => {
    await signUp();
    client.lock();
    assert.throws(() => client.prepareToSetUpAgain(), /unlock Virasat first/);
  });
});

describe("the PIN on a phone", () => {
  test("signs with the hardware signing key, never the biometric one", async () => {
    await signUp();
    await reopen();
    const prompts = plugin.prompts;
    await client.unlockWithPin(PIN);
    assert.equal(client.getAuthState().status, "unlocked");
    assert.equal(plugin.prompts, prompts, "no biometric prompt for the PIN");
  });

  test("a wrong PIN is refused and the vault stays shut", async () => {
    await signUp();
    await reopen();
    await assert.rejects(client.unlockWithPin("000000"), client.ApiError);
    assert.equal(client.getAuthState().status, "locked");
  });
});

describe("signing out", () => {
  test("forgets the sign-in but keeps the phone set up for next time", async () => {
    await signUp();
    await client.signOut();
    assert.equal(client.getAuthState().status, "signed-out");
    assert.equal(plugin.items.has("refresh"), false);
    assert.ok(plugin.items.has("device"));
    assert.equal(plugin.keys.size, 3);
  });
});
