/**
 * Phase 5 from the app's side: changing the password, moving an older
 * account to Argon2id, the phones list, the recovery banner and alerts.
 * The app's client code over a phone bridge, against the real API.
 */
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { setDeviceBridgeForTesting } from "@/lib/device/bridge";
import { createNativeBridgeWith } from "@/lib/device/native";
import { authStore } from "@/lib/auth/store";
import * as flows from "@/lib/auth/flows";
import { deriveAccountKeys, wrapBytes, KDF_ITERATIONS } from "@/lib/crypto/keys";
import { hexToBuffer } from "@/lib/crypto/argon2";
import { listOutbox } from "@/lib/email/outbox";
import { pushOutbox, resetPushOutbox } from "@/lib/push/drivers/console";
import { FakeDevicePlugin } from "../../features/support/fake_device_plugin";
import { freshClient, lastCode, quietConsole, requests, resetServer, serveApiInProcess } from "./harness";

const EMAIL = "meera@example.com";
const PASSWORD = "Mango-Tree-Rain-42";
const PIN = "482915";

let client: ReturnType<typeof freshClient>;
let plugin: FakeDevicePlugin;
let restore: () => void;

serveApiInProcess();
beforeEach(() => {
  restore = quietConsole();
  resetServer();
  resetPushOutbox();
  plugin = new FakeDevicePlugin();
  setDeviceBridgeForTesting(createNativeBridgeWith(plugin, "ios"));
  client = freshClient();
});
afterEach(async () => {
  await client.signOut();
  setDeviceBridgeForTesting(null);
  restore();
});

async function signUp(): Promise<void> {
  await client.startSignUp(EMAIL);
  const { signupTicket } = await client.verifySignUpCode(EMAIL, lastCode(EMAIL));
  await client.finishSignUp({ signupTicket, name: "Meera", email: EMAIL, password: PASSWORD });
  await client.setUpThisPhone({ pin: PIN, useBiometrics: true });
}

const user = () => authStore.userByEmail(EMAIL)!;
const subjects = () => listOutbox().map((m) => m.subject);

/** Signs in again on this phone: password, then Face ID. */
async function signInAgain(password = PASSWORD): Promise<void> {
  client.lock();
  await client.signOut();
  await client.signInWithPassword(EMAIL, password);
  assert.equal(await client.unlockWithFaceId(), true);
}

describe("changing the password", () => {
  test("re-wraps the same vault key under the new password; the old one stops working", async () => {
    await signUp();
    const vaultKeyHex = client.getAuthState().vaultKeyHex;
    await client.changePassword(PASSWORD, "Brand-New-Password-7");
    assert.ok(subjects().some((s) => /password/i.test(s)), `no password email in ${JSON.stringify(subjects())}`);

    await signInAgain("Brand-New-Password-7");
    assert.equal(client.getAuthState().vaultKeyHex, vaultKeyHex);
    await client.signOut();
    await assert.rejects(client.signInWithPassword(EMAIL, PASSWORD), client.ApiError);
  });

  test("needs the current password, and counts wrong ones like sign-in does", async () => {
    await signUp();
    await assert.rejects(client.changePassword("not-my-password", "Brand-New-Password-7"), /not your current password/);
    assert.equal(client.getAuthState().status, "unlocked", "a wrong password does not sign the app out");
    assert.ok(authStore.loginFailures.has(EMAIL), "counted like a wrong sign-in");
    await client.changePassword(PASSWORD, "Brand-New-Password-7");
    assert.equal(authStore.loginFailures.size, 0, "a right password clears the count");
  });

  test("signs out every other session", async () => {
    await signUp();
    // Another sign-in to the same account, as from another phone.
    const kdf = flows.prelogin(EMAIL);
    assert.ok(kdf.ok);
    const other = await flows.login({ email: EMAIL, authKeyHex: (await deriveAccountKeys(PASSWORD, kdf.data)).authKeyHex });
    assert.ok(other.ok);
    await client.changePassword(PASSWORD, "Brand-New-Password-7");
    assert.equal(flows.sessionForToken(other.data.accessToken), null, "the other session ended");
    await client.recoveryInProgress(); // this session still answers
    assert.equal(client.getAuthState().status, "unlocked");
  });

  test("needs the vault open", async () => {
    await assert.rejects(client.changePassword(PASSWORD, "x"), /unlock Virasat first/);
  });
});

describe("an older account moves to Argon2id at sign-in", () => {
  /** Makes this account look as it would have before Argon2id. */
  async function makeLegacy(): Promise<string> {
    const vaultKeyHex = client.getAuthState().vaultKeyHex;
    const kdf = { saltHex: "ab".repeat(16), iterations: KDF_ITERATIONS };
    const keys = await deriveAccountKeys(PASSWORD, kdf);
    const u = user();
    u.kdf = kdf;
    u.authHash = (await import("@/lib/auth/secrets")).slowHash(keys.authKeyHex);
    u.wrappedVaultKey = await wrapBytes(hexToBuffer(vaultKeyHex), keys.wrapKey);
    return vaultKeyHex;
  }

  test("without the person seeing it: same password, same vault, no email, now Argon2id", async () => {
    await signUp();
    const vaultKeyHex = await makeLegacy();
    const emailsBefore = listOutbox().length;

    await signInAgain();
    assert.equal(client.getAuthState().vaultKeyHex, vaultKeyHex);
    assert.equal(user().kdf.algorithm, "argon2id");
    assert.ok(requests.includes("POST /api/auth/password/upgrade"));
    assert.ok(!listOutbox().slice(emailsBefore).some((m) => /password/i.test(m.subject)), "no 'password changed' email");

    await signInAgain();
    assert.equal(client.getAuthState().vaultKeyHex, vaultKeyHex, "and it still opens");
  });

  test("an account already on Argon2id sends no upgrade", async () => {
    await signUp();
    requests.length = 0;
    await signInAgain();
    assert.ok(!requests.includes("POST /api/auth/password/upgrade"));
  });

  test("the server refuses an upgrade that is not one", async () => {
    await signUp();
    // Already current.
    const current = await upgradeAs(user().kdf);
    assert.deepEqual(current, { ok: false, status: 409, error: "This account's key settings are already current." });
    await makeLegacy();
    const weaker = await upgradeAs({ algorithm: "argon2id", saltHex: "cd".repeat(16), iterations: 2, memoryKiB: 19456, parallelism: 1 });
    assert.deepEqual(weaker, { ok: false, status: 400, error: "The new key settings are not stronger." });
  });

  /** An upgrade from this client's full session, with the given new settings. */
  async function upgradeAs(kdf: Parameters<typeof deriveAccountKeys>[1]) {
    const s = [...authStore.sessions.values()].find((x) => flows.stageOf(x) === "full")!;
    const keys = await deriveAccountKeys(PASSWORD, kdf);
    const outcome = flows.upgradeKdf(s, {
      currentAuthKeyHex: (await deriveAccountKeys(PASSWORD, user().kdf)).authKeyHex,
      kdf,
      authKeyHex: keys.authKeyHex,
      wrappedVaultKey: user().wrappedVaultKey,
    });
    return outcome.ok ? outcome : { ok: false, status: (outcome as { status: number }).status, error: (outcome as { error: string }).error };
  }
});

describe("the phones list", () => {
  test("shows this phone, marked as this one", async () => {
    await signUp();
    const phones = await client.listPhones();
    assert.equal(phones.length, 1);
    assert.equal(phones[0].current, true);
    assert.equal(phones[0].name, "Test iPhone");
    assert.equal(phones[0].platform, "ios");
    assert.equal(phones[0].biometric, true);
  });

  test("this phone cannot remove itself, and an unknown phone is not found", async () => {
    await signUp();
    const [me] = await client.listPhones();
    await assert.rejects(client.removePhone(me.id), /sign out on it/);
    await assert.rejects(client.removePhone("dev-nope"), /not signed in/);
  });
});

describe("a recovery someone else started", () => {
  async function startRecoveryElsewhere(): Promise<void> {
    const kit = flows.startKitRecovery(EMAIL);
    const started = await kit;
    assert.ok(started.ok);
    const session = flows.sessionForToken(started.data.accessToken)!;
    assert.ok(flows.verifySessionCode(session, lastCode(EMAIL)).ok);
    const { recoveryVerifier } = await import("@/lib/crypto/account");
    const begun = await flows.beginKitRecovery(session, await recoveryVerifier(recoveryCode));
    assert.ok(begun.ok, JSON.stringify(begun));
  }
  let recoveryCode = "";

  test("shows in the app, alerts this phone, and can be stopped from here", async () => {
    await client.startSignUp(EMAIL);
    const { signupTicket } = await client.verifySignUpCode(EMAIL, lastCode(EMAIL));
    recoveryCode = (await client.finishSignUp({ signupTicket, name: "Meera", email: EMAIL, password: PASSWORD })).recoveryCode;
    await client.setUpThisPhone({ pin: PIN, useBiometrics: true });
    await client.sendPushToken("a1b2c3d4e5f6a1b2c3d4e5f6");
    assert.equal(await client.recoveryInProgress(), false);

    await startRecoveryElsewhere();
    assert.equal(await client.recoveryInProgress(), true);
    assert.equal(pushOutbox.length, 1);
    assert.equal(pushOutbox[0].token, "a1b2c3d4e5f6a1b2c3d4e5f6");
    assert.equal(pushOutbox[0].platform, "ios");
    assert.doesNotMatch(`${pushOutbox[0].title} ${pushOutbox[0].body}`, /Meera|meera@|note/i, "nothing personal on the lock screen");

    assert.equal(await client.stopRecovery(), true);
    assert.equal(await client.recoveryInProgress(), false);
    assert.equal(await client.stopRecovery(), false, "nothing left to stop");
  });
});

describe("push tokens", () => {
  test("only well-formed tokens, only from a set-up phone app", async () => {
    await signUp();
    await assert.rejects(client.sendPushToken("short"), /not acceptable/);
    await assert.rejects(client.sendPushToken("has spaces in it, which no token has"), /not acceptable/);
    await client.sendPushToken("fcm:APA91b-abc_DEF.123");
    assert.equal([...authStore.pushTokens.values()][0].token, "fcm:APA91b-abc_DEF.123");
  });
});
