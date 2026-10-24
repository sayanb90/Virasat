import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";

import * as flows from "../../lib/auth/flows";
import { authStore } from "../../lib/auth/store";
import { advanceClockForTesting, resetClockForTesting } from "../../lib/auth/clock";
import { slowVerify } from "../../lib/auth/secrets";
import { mintStubToken } from "../../lib/auth/providers/stub";
import { listOutbox, resetOutbox } from "../../lib/email/outbox";
import {
  buildNewAccount,
  buildRecoveryKit,
  loginProof,
  openWithPassword,
  openWithRecoveryCode,
  recoveryVerifier,
  wrapWithPassword,
} from "../../lib/crypto/account";
import { bufferToHex } from "../../lib/crypto/argon2";
import { generateRecoveryCode, generateSigningKey, randomSecretHex, signChallenge } from "../../lib/crypto/keys";
import {
  finishEnrolment,
  keysOf,
  openPinCopy,
  prepareEnrolment,
  signForPin,
  unlockWithBiometrics,
  type DeviceState,
} from "../../lib/device/core";
import { BiometricsChangedError, webCryptoKeyOps, type KeyOps } from "../../lib/device/keyops";
import type { SocialProvider, WrappedKey } from "../../lib/auth/types";
import { FakeDevicePlugin } from "../support/fake_device_plugin";
import { pushOutbox, resetPushOutbox } from "../../lib/push/drivers/console";
import { createNativeBridgeWith, createNativeKeyOps } from "../../lib/device/native";
import { derToRawEcdsaSignature } from "../../lib/device/der";

/*
 * One person, up to two phones. "The same phone" is the one she signed up
 * on; "a new phone" has never held her vault key.
 */
const HOUR = 3_600_000;
const PIN = "482915";

interface Person {
  email: string;
  password: string;
  vaultKeyBytes: Uint8Array;
  kitCode: string;
}

let person: Person;
let phoneA: DeviceState | null = null;
let phoneB: DeviceState | null = null;
let onNewPhone = false;
let grant: flows.SessionGrant | null = null;
let refreshToken: string | undefined;
let replayable: string | undefined;
let last: flows.Outcome<unknown> | null = null;
let lastWrapped: WrappedKey | null = null;
let serverShare: string | undefined;
let attempts: Array<{ status: number; error: string }> = [];
let social: flows.SocialOutcome | null = null;
let socialReplay: { provider: SocialProvider; token: string; nonce: string } | null = null;
let pendingTicket: string | null = null;
let recoveryToken: string | null = null;

/*
 * Whose key operations the phones use. The browser's WebCrypto by default;
 * "the phone keeps its keys in hardware" switches to lib/device/native.ts
 * over a fake plugin that answers in the real plugins' formats.
 */
let keyOps: KeyOps = webCryptoKeyOps;
let hardware: FakeDevicePlugin | null = null;

const currentPhone = () => (onNewPhone ? phoneB : phoneA);

function session() {
  assert.ok(grant, "There is no session yet.");
  const s = flows.sessionForToken(grant!.accessToken);
  assert.ok(s, "The session token is no longer valid.");
  return s!;
}

function take<T>(outcome: flows.Outcome<T>): T | null {
  last = outcome;
  if (!outcome.ok) return null;
  const data = outcome.data as unknown as flows.SessionGrant;
  if (data && typeof data === "object" && "accessToken" in data) {
    grant = data;
    if (data.refreshToken) refreshToken = data.refreshToken;
  }
  return outcome.data;
}

function kdfOf(email: string) {
  const kdf = flows.prelogin(email);
  assert.ok(kdf.ok, "prelogin refused a valid email.");
  return kdf.data;
}

function code(email: string): string {
  const c = authStore.lastCodesForTesting.get(email.toLowerCase());
  assert.ok(c, `No code was emailed to ${email}.`);
  return c!;
}

function nameFor(email: string): string {
  const local = email.split("@")[0];
  return local[0].toUpperCase() + local.slice(1);
}

async function enrol(email: string, vaultKeyBytes: Uint8Array, pin = PIN): Promise<DeviceState> {
  const prepared = await prepareEnrolment(true, keyOps);
  const enrolled = take(
    await flows.enrolDevice(session(), {
      name: onNewPhone ? "New phone" : "Phone",
      platform: "ios",
      signingPublicKey: prepared.signingPublicKey,
      biometricPublicKey: prepared.biometricPublicKey,
      pin,
    })
  );
  assert.ok(enrolled, `Enrolling the phone failed: ${JSON.stringify(last)}`);
  return finishEnrolment(prepared, {
    deviceId: enrolled!.deviceId!,
    email,
    serverShareHex: enrolled!.serverShareHex,
    vaultKeyBytes,
  }, keyOps);
}

async function finishSignup(signupTicket: string, email: string, password: string): Promise<void> {
  const account = await buildNewAccount(password);
  const kit = await buildRecoveryKit(account.vaultKeyBytes);
  const done = take(
    await flows.completeSignup({
      signupTicket,
      name: nameFor(email),
      ...account.send,
      recovery: kit.send,
    })
  );
  assert.ok(done, `Sign-up failed: ${JSON.stringify(last)}`);
  person = { email, password, vaultKeyBytes: account.vaultKeyBytes, kitCode: kit.code };
  onNewPhone = false;
  phoneA = await enrol(email, account.vaultKeyBytes);
}

async function signUp(email: string, password: string): Promise<void> {
  take(await flows.startSignup(email));
  const verified = take(flows.verifySignupCode({ email, code: code(email) }));
  assert.ok(verified, `Verifying the code failed: ${JSON.stringify(last)}`);
  await finishSignup(verified!.signupTicket, email, password);
}

async function signIn(email: string, password: string, deviceId?: string, linkTicket?: string) {
  const { authKeyHex } = await loginProof(password, kdfOf(email));
  const result = take(await flows.login({ email, authKeyHex, deviceId, linkTicket }));
  lastWrapped = result?.wrappedVaultKey ?? null;
  return result;
}

/** Everything the server keeps, as one string to search. */
function serverRecords(): string {
  return JSON.stringify(authStore, (_k, v) =>
    v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v
  );
}

/* ---------------------------------------------------------------------- */

Given("a fresh sign-in service", function () {
  authStore.resetForTesting();
  authStore.captureCodesForTesting = true;
  // Other features switch drivers to test configuration errors.
  process.env.EMAIL_DRIVER = "console";
  resetClockForTesting();
  resetOutbox();
  phoneA = phoneB = null;
  onNewPhone = false;
  grant = null;
  refreshToken = replayable = undefined;
  last = null;
  attempts = [];
  social = null;
  socialReplay = null;
  pendingTicket = null;
  recoveryToken = null;
  serverShare = undefined;
  keyOps = webCryptoKeyOps;
  hardware = null;
  resetPushOutbox();
});

Given(/^"([^"]+)" (?:signs|has signed) up on a phone with password "([^"]+)"$/, async function (email: string, password: string) {
  await signUp(email, password);
});

When(/^(?:she|they) signs? in with password "([^"]+)" on the same phone$/, async function (password: string) {
  onNewPhone = false;
  await signIn(person.email, password, phoneA?.deviceId);
});

When("she signs in with password {string} on a new phone", async function (password: string) {
  onNewPhone = true;
  await signIn(person.email, password, undefined);
});

When("someone signs in as {string} with password {string}", async function (email: string, password: string) {
  await signIn(email, password, undefined);
  assert.ok(last && !last.ok);
  attempts.push({ status: (last as { status: number }).status, error: (last as { error: string }).error });
});

When("someone tries {int} wrong passwords for {string}", async function (n: number, email: string) {
  for (let i = 0; i < n; i++) await signIn(email, `wrong-password-${i}`);
});

Then("both attempts got the same status and message", function () {
  assert.strictEqual(attempts.length, 2);
  assert.deepStrictEqual(attempts[0], attempts[1]);
});

Then("her session is pending and needs {string}", function (needs: string) {
  const s = session();
  assert.strictEqual(flows.stageOf(s), "pending");
  assert.deepStrictEqual([...s.needs].sort(), needs.split(", ").sort());
});

Then("her session is full", function () {
  assert.strictEqual(flows.stageOf(session()), "full");
});

Then("she has a refresh token", function () {
  assert.ok(grant?.refreshToken, "A full session on an enrolled phone should come with a refresh token.");
});

When("she confirms with Face ID", async function () {
  const phone = currentPhone()!;
  const challenge = take(flows.deviceChallenge(session()))!.challenge;
  const { signature, vaultKeyBytes } = (await unlockWithBiometrics(phone, challenge, "Open your notes", keyOps))!;
  take(flows.proveDevice(session(), { method: "biometric", signature }));
  assert.ok(last?.ok, `Face ID was refused: ${JSON.stringify(last)}`);
  person.vaultKeyBytes = vaultKeyBytes;
});

When("the app answers the challenge with a key that is not this phone's", async function () {
  const challenge = take(flows.deviceChallenge(session()))!.challenge;
  const other = await generateSigningKey();
  const signature = await signChallenge(other.privateKey, challenge);
  last = flows.proveDevice(session(), { method: "biometric", signature });
});

When("she confirms with PIN {string}", async function (pin: string) {
  const phone = currentPhone()!;
  const challenge = take(flows.deviceChallenge(session()))!.challenge;
  const signature = await signForPin(phone, challenge, keyOps);
  const proved = take(flows.proveDevice(session(), { method: "pin", signature, pin }));
  serverShare = (proved as flows.DeviceProofResult | null)?.serverShareHex;
});

When("she enters {int} wrong PINs", async function (n: number) {
  for (let i = 0; i < n; i++) {
    await signIn(person.email, person.password, phoneA!.deviceId);
    const challenge = take(flows.deviceChallenge(session()))!.challenge;
    const signature = await signForPin(phoneA!, challenge, keyOps);
    last = flows.proveDevice(session(), { method: "pin", signature, pin: "000000" });
    assert.ok(!last.ok);
  }
});

Then("the answer is refused with status {int}", function (status: number) {
  assert.ok(last, "Nothing was attempted.");
  assert.strictEqual(last!.ok, false, `Expected a refusal, got ${JSON.stringify(last)}`);
  assert.strictEqual((last as { status: number }).status, status, JSON.stringify(last));
});

Then("the PIN copy on the phone opens her vault", async function () {
  assert.ok(serverShare, "The server did not return its share.");
  const opened = await openPinCopy(phoneA!, serverShare!);
  assert.strictEqual(bufferToHex(opened), bufferToHex(person.vaultKeyBytes));
});

Then("the phone's PIN copy cannot be opened without the server's share", async function () {
  await assert.rejects(openPinCopy(phoneA!, randomSecretHex()));
});

Then("the server no longer holds a share for that phone", function () {
  assert.strictEqual(authStore.devices.get(phoneA!.deviceId)!.serverShareHex, null);
});

/* --- What the server holds ------------------------------------------- */

Then("the server's records contain neither the password nor the vault key", async function () {
  const records = serverRecords();
  const proof = (await loginProof(person.password, kdfOf(person.email))).authKeyHex;
  for (const [label, needle] of [
    ["The password", person.password],
    ["K_vault", bufferToHex(person.vaultKeyBytes)],
    ["The Recovery Kit code", person.kitCode.replace(/-/g, "")],
    ["The login proof itself", proof],
  ] as const) {
    assert.ok(needle.length > 0);
    assert.ok(!records.includes(needle), `${label} is in the server's records.`);
  }
});

Then("the server can only verify the login proof, not reuse it", async function () {
  const user = authStore.userByEmail(person.email)!;
  const { authKeyHex } = await loginProof(person.password, kdfOf(person.email));
  assert.ok(slowVerify(authKeyHex, user.authHash));
  assert.ok(!user.authHash.includes(authKeyHex));
});

Then("the salt for {string} looks exactly like a real one", function (email: string) {
  const real = kdfOf(person.email);
  const fake = kdfOf(email);
  assert.strictEqual(fake.saltHex.length, real.saltHex.length);
  assert.match(fake.saltHex, /^[0-9a-f]+$/);
  assert.strictEqual(fake.iterations, real.iterations);
});

Then("the salt for {string} is the same every time", function (email: string) {
  assert.deepStrictEqual(flows.prelogin(email), flows.prelogin(email));
});

/* --- Codes and email -------------------------------------------------- */

Then("a {string} code was emailed to {string}", function (purpose: string, email: string) {
  const sent = listOutbox().find(
    (e) => e.to === email && e.idempotencyKey.startsWith(`code:${purpose}:`) && e.status === "sent"
  );
  assert.ok(sent, `No ${purpose} code went to ${email}.`);
  code(email);
});

When("she enters a wrong code", function () {
  const right = Number(code(person.email));
  const wrong = String((right + 1) % 1_000_000).padStart(6, "0");
  last = flows.verifySessionCode(session(), wrong);
  assert.ok(!last.ok);
});

When(/^she enters the (?:"[^"]+" )?code from her email$/, function () {
  take(flows.verifySessionCode(session(), code(person.email)));
  assert.ok(last?.ok, `The code was refused: ${JSON.stringify(last)}`);
});

Then("a {string} email was sent to {string}", function (subject: string, email: string) {
  assert.ok(
    listOutbox().some((e) => e.to === email && e.subject === subject && e.status === "sent"),
    `No "${subject}" email went to ${email}. Sent: ${listOutbox().map((e) => e.subject).join(" | ")}`
  );
});

Then("no recovery email was sent to {string}", function (email: string) {
  assert.ok(!listOutbox().some((e) => e.to === email && /recovering/.test(e.subject)));
});

/* --- New phone --------------------------------------------------------- */

When("she sets up Face ID and PIN {string} on the new phone", async function (pin: string) {
  assert.ok(lastWrapped, "Signing in should have returned the wrapped vault key.");
  const vaultKeyBytes = await openWithPassword(person.password, kdfOf(person.email), lastWrapped!);
  phoneB = await enrol(person.email, vaultKeyBytes, pin);
});

Then("the new phone can open her vault", async function () {
  await signIn(person.email, person.password, phoneB!.deviceId);
  onNewPhone = true;
  const challenge = take(flows.deviceChallenge(session()))!.challenge;
  const { signature, vaultKeyBytes } = (await unlockWithBiometrics(phoneB!, challenge, "Open your notes", keyOps))!;
  take(flows.proveDevice(session(), { method: "biometric", signature }));
  assert.ok(last?.ok);
  assert.strictEqual(bufferToHex(vaultKeyBytes), bufferToHex(person.vaultKeyBytes));
});

/* --- Refresh ----------------------------------------------------------- */

When("the app reopens with its refresh token", function () {
  replayable = refreshToken;
  const result = take(flows.refresh({ refreshToken, deviceId: phoneA!.deviceId }));
  assert.ok(result, `Refresh failed: ${JSON.stringify(last)}`);
});

When("someone else replays the same refresh token", function () {
  last = flows.refresh({ refreshToken: replayable, deviceId: phoneA!.deviceId });
});

Then("the app's newer refresh token no longer works", function () {
  const again = flows.refresh({ refreshToken, deviceId: phoneA!.deviceId });
  assert.strictEqual(again.ok, false);
});

/* --- Social ------------------------------------------------------------ */

async function continueWith(provider: SocialProvider, email: string | null, name: string, deviceId?: string) {
  const { nonce } = flows.socialNonce();
  const subject = `${provider}-${email ?? name}`;
  const token = mintStubToken({ provider, subject, email, emailVerified: !!email, name, nonce });
  socialReplay = { provider, token, nonce };
  social = take(await flows.socialSignIn({ provider, token, nonce, deviceId }));
}

When("a new person continues with {string} as {string} named {string}", async function (provider: SocialProvider, email: string, name: string) {
  await continueWith(provider, email, name);
});

When("a new person continues with {string} without an email, named {string}", async function (provider: SocialProvider, name: string) {
  await continueWith(provider, null, name);
});

When(/^they continue with "([^"]+)" again on (the same|a new) phone$/, async function (provider: SocialProvider, which: string) {
  await continueWith(provider, person.email, nameFor(person.email), which === "the same" ? phoneA!.deviceId : undefined);
});

When("the same provider token is presented again", async function () {
  last = await flows.socialSignIn({ ...socialReplay! });
});

Then("they are asked to sign up as {string} named {string} without an email code", function (email: string, name: string) {
  assert.ok(social && social.status === "signup", JSON.stringify(last));
  const s = social as Extract<flows.SocialOutcome, { status: "signup" }>;
  assert.strictEqual(s.email, email);
  assert.strictEqual(s.name, name);
  assert.strictEqual(s.emailVerified, true);
  pendingTicket = s.signupTicket;
  person = { email, password: "", vaultKeyBytes: new Uint8Array(), kitCode: "" };
});

Then("they are asked to sign up and confirm an email", function () {
  assert.ok(social && social.status === "signup");
  const s = social as Extract<flows.SocialOutcome, { status: "signup" }>;
  assert.strictEqual(s.emailVerified, false);
  pendingTicket = s.signupTicket;
});

When("they confirm {string} with the emailed code", async function (email: string) {
  take(await flows.startSignup(email));
  const verified = take(flows.verifySignupCode({ email, code: code(email), socialTicket: pendingTicket }));
  assert.ok(verified, JSON.stringify(last));
  pendingTicket = verified!.signupTicket;
  person = { email, password: "", vaultKeyBytes: new Uint8Array(), kitCode: "" };
});

When("they choose password {string} and finish on a phone", async function (password: string) {
  assert.ok(pendingTicket);
  await finishSignup(pendingTicket!, person.email, password);
});

Given("{string} has signed up with {string} on a phone with password {string}", async function (email: string, provider: SocialProvider, password: string) {
  await continueWith(provider, email, nameFor(email));
  pendingTicket = (social as Extract<flows.SocialOutcome, { status: "signup" }>).signupTicket;
  person = { email, password: "", vaultKeyBytes: new Uint8Array(), kitCode: "" };
  await finishSignup(pendingTicket, email, password);
});

Then("the social sign-in needs {string}", function (needs: string) {
  assert.ok(social && social.status === "signed-in", JSON.stringify(last));
  assert.deepStrictEqual((social as flows.SessionGrant).needs, [needs]);
});

Then("the social sign-in asks for the password", function () {
  assert.strictEqual(social?.status, "password-required", JSON.stringify(last));
});

Then("the social sign-in asks for the password to link", function () {
  assert.strictEqual(social?.status, "link-required", JSON.stringify(last));
});

When("she links it with password {string}", async function (password: string) {
  const ticket = (social as Extract<flows.SocialOutcome, { status: "link-required" }>).linkTicket;
  await signIn(person.email, password, phoneA!.deviceId, ticket);
});

Then(/^"([^"]+)" has (a|no) "([^"]+)" identity$/, function (email: string, which: string, provider: string) {
  const user = authStore.userByEmail(email);
  assert.ok(user, `No account for ${email}.`);
  const has = authStore.identitiesFor(user!.id).some((i) => i.provider === provider);
  assert.strictEqual(has, which === "a");
});

/* --- Recovery, path A -------------------------------------------------- */

When("she forgets her password and starts again on the same phone", async function () {
  onNewPhone = false;
  take(await flows.startDeviceReset({ email: person.email, deviceId: phoneA!.deviceId }));
  assert.ok(last?.ok, JSON.stringify(last));
});

When("she chooses the new password {string}", async function (password: string) {
  const payload = await wrapWithPassword(password, person.vaultKeyBytes);
  take(await flows.resetPassword(session(), payload.send));
  assert.ok(last?.ok, JSON.stringify(last));
  person.password = password;
});

Then("she can sign in with {string} and open the same vault", async function (password: string) {
  const original = bufferToHex(person.vaultKeyBytes);
  const result = await signIn(person.email, password, phoneA?.deviceId);
  assert.ok(result, `Signing in failed: ${JSON.stringify(last)}`);
  const opened = await openWithPassword(password, kdfOf(person.email), result!.wrappedVaultKey);
  assert.strictEqual(bufferToHex(opened), original);
});

Then("she cannot sign in with {string}", async function (password: string) {
  assert.strictEqual(await signIn(person.email, password, phoneA?.deviceId), null);
  assert.strictEqual((last as { status: number }).status, 401);
});

/* --- Recovery, path B -------------------------------------------------- */

async function startKitRecovery(email: string, kitCode: string) {
  take(await flows.startKitRecovery(email));
  take(flows.verifySessionCode(session(), code(email)));
  assert.ok(last?.ok, JSON.stringify(last));
  const hold = take(await flows.beginKitRecovery(session(), await recoveryVerifier(kitCode)));
  recoveryToken = hold?.recoveryToken ?? null;
}

When("someone starts a recovery for {string} with her Recovery Kit", async function (email: string) {
  await startKitRecovery(email, person.kitCode);
  assert.ok(recoveryToken, JSON.stringify(last));
});

When("someone starts a recovery for {string} with a made-up code", async function (email: string) {
  await startKitRecovery(email, generateRecoveryCode());
});

Then("the recovery cannot be completed yet", function () {
  last = flows.completeKitRecovery(recoveryToken);
  assert.strictEqual((last as { status: number }).status, 425, JSON.stringify(last));
});

Then("the recovery cannot be completed because it has ended", function () {
  last = flows.completeKitRecovery(recoveryToken);
  assert.strictEqual((last as { status: number }).status, 410, JSON.stringify(last));
});

When("the Owner taps the link in that email", function () {
  const cancelToken = authStore.lastCancelTokensForTesting.get(person.email);
  assert.ok(cancelToken, "No cancel link was emailed.");
  assert.ok(flows.cancelRecovery(cancelToken).ok);
});

When("{int} hours pass", function (hours: number) {
  advanceClockForTesting(hours * HOUR);
});

When("the recovery is completed with the new password {string}", async function (password: string) {
  const done = take(flows.completeKitRecovery(recoveryToken));
  assert.ok(done, JSON.stringify(last));
  const vaultKeyBytes = await openWithRecoveryCode(person.kitCode, done!.wrappedVaultKey);
  assert.strictEqual(bufferToHex(vaultKeyBytes), bufferToHex(person.vaultKeyBytes));
  const payload = await wrapWithPassword(password, vaultKeyBytes);
  const kit = await buildRecoveryKit(vaultKeyBytes);
  take(await flows.resetPassword(session(), { ...payload.send, recovery: kit.send }));
  assert.ok(last?.ok, JSON.stringify(last));
  person = { ...person, password, kitCode: kit.code, oldKit: person.kitCode } as Person & { oldKit: string };
});

Then("her old Recovery Kit no longer starts a recovery", async function () {
  const oldKit = (person as Person & { oldKit: string }).oldKit;
  await startKitRecovery(person.email, oldKit);
  assert.strictEqual(recoveryToken, null);
  assert.strictEqual((last as { status: number }).status, 401);
});

/* --- Hardware keys (lib/device/native.ts) ------------------------------ */

let faceIdOutcome: { result: Awaited<ReturnType<typeof unlockWithBiometrics>>; error: unknown } | null = null;
let signaturesBefore = 0;

function fakeHardware(): FakeDevicePlugin {
  assert.ok(hardware, "This scenario's phone does not keep its keys in hardware.");
  return hardware!;
}

Given("the phone keeps its keys in hardware", function () {
  hardware = new FakeDevicePlugin();
  keyOps = createNativeKeyOps(hardware);
});

Then("the phone's saved state names its keys but holds none of them", function () {
  const saved = JSON.parse(JSON.stringify(phoneA)) as DeviceState;
  assert.deepStrictEqual(saved, phoneA, "The state should survive being stored as JSON, as the plugin stores it.");
  const aliases = [saved.signingKey, saved.biometricSigningKey, saved.biometricWrapKey].map(
    (k) => (k as { alias: string }).alias
  );
  assert.strictEqual(new Set(aliases).size, 3);
  for (const alias of aliases) assert.ok(fakeHardware().keys.has(alias), `${alias} is not in the hardware.`);
  assert.doesNotMatch(JSON.stringify(saved), /"d":/, "A private key component reached the saved state.");
});

When("someone adds a face to the phone", function () {
  fakeHardware().addFace();
});

When(/^she (tries|cancels) Face ID$/, async function (how: string) {
  if (how === "cancels") fakeHardware().cancelNextPrompt = true;
  signaturesBefore = fakeHardware().signatures;
  const challenge = take(flows.deviceChallenge(session()))!.challenge;
  try {
    faceIdOutcome = { result: await unlockWithBiometrics(currentPhone()!, challenge, "Open your notes", keyOps), error: null };
  } catch (error) {
    faceIdOutcome = { result: null, error };
  }
});

Then("she is told her Face ID settings changed and to use her PIN", function () {
  assert.ok(faceIdOutcome?.error instanceof BiometricsChangedError, `Expected BiometricsChangedError, got ${faceIdOutcome?.error}`);
  assert.match((faceIdOutcome!.error as Error).message, /PIN/);
});

Then("the phone signed nothing", function () {
  assert.strictEqual(faceIdOutcome?.result, null);
  assert.strictEqual(fakeHardware().signatures, signaturesBefore);
});

Then("{int} signatures made by the hardware all verify on the server", async function (n: number) {
  const { key, publicJwk } = await keyOps.createSigningKey("virasat.test.many", false);
  for (let i = 0; i < n; i++) {
    const challenge = `challenge-${i}-${randomSecretHex(4)}`;
    const signature = await keyOps.sign(key, challenge);
    assert.ok(flows.signatureValid(publicJwk, challenge, signature), `Signature ${i} did not verify.`);
  }
});

Then("a signature that is not DER is refused before it reaches the server", function () {
  assert.throws(() => derToRawEcdsaSignature(new Uint8Array(64).fill(7)), /Not a DER ECDSA signature/);
  assert.throws(() => derToRawEcdsaSignature(new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01])), /Not a DER/);
});

When("she forgets this phone", async function () {
  const bridge = createNativeBridgeWith(fakeHardware(), "ios");
  await bridge.saveDevice(phoneA!);
  await bridge.saveRefreshToken(refreshToken ?? "refresh");
  assert.deepStrictEqual(await bridge.loadDevice(), phoneA);
  await bridge.forgetDevice();
});

Then("the phone holds no keys of hers and no saved sign-in", async function () {
  const bridge = createNativeBridgeWith(fakeHardware(), "ios");
  assert.strictEqual(fakeHardware().keys.size, 0, `Left behind: ${[...fakeHardware().keys.keys()].join(", ")}`);
  assert.strictEqual(await bridge.loadDevice(), null);
  assert.strictEqual(await bridge.loadRefreshToken(), null);
});

let replacedKeys: DeviceState | null = null;

When("she sets up this phone again", async function () {
  const old = phoneA!;
  const prepared = await prepareEnrolment(true, keyOps);
  const enrolled = take(
    await flows.enrolDevice(session(), {
      name: "Phone",
      platform: "ios",
      signingPublicKey: prepared.signingPublicKey,
      biometricPublicKey: prepared.biometricPublicKey,
      pin: PIN,
      replacesDeviceId: old.deviceId,
    })
  );
  assert.ok(enrolled, `Setting the phone up again failed: ${JSON.stringify(last)}`);
  phoneA = await finishEnrolment(
    prepared,
    { deviceId: enrolled!.deviceId!, email: person.email, serverShareHex: enrolled!.serverShareHex, vaultKeyBytes: person.vaultKeyBytes },
    keyOps
  );
  // As the app does once the new enrolment is saved (lib/auth/client.ts).
  await keyOps.discard(keysOf(old));
  replacedKeys = old;
});

Then("the phone holds only the new keys", function () {
  const aliases = (s: DeviceState) => keysOf(s).map((k) => (k as { alias: string }).alias).sort();
  assert.deepStrictEqual([...fakeHardware().keys.keys()].sort(), aliases(phoneA!));
  assert.notDeepStrictEqual(aliases(replacedKeys!), aliases(phoneA!));
});

/* --- Hardening (phase 5) ----------------------------------------------- */

let networkStatuses: number[] = [];
let lastLimited: Response | null = null;

async function loginFrom(address: string, n: number): Promise<Response> {
  const { POST } = await import("../../app/api/auth/login/route");
  return POST(
    new Request("https://api.virasat.test/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": address },
      body: JSON.stringify({ email: `stranger${n}@example.com`, authKeyHex: "00".repeat(32) }),
    })
  );
}

When("a script tries {int} sign-ins for different accounts from one network", async function (n: number) {
  networkStatuses = [];
  for (let i = 0; i < n; i++) {
    const res = await loginFrom("203.0.113.9", i);
    networkStatuses.push(res.status);
    if (res.status === 429) lastLimited = res;
  }
});

Then("the first {int} are answered and the {int}st is refused with status 429", function (answered: number, nth: number) {
  assert.ok(networkStatuses.slice(0, answered).every((s) => s !== 429), JSON.stringify(networkStatuses));
  assert.strictEqual(networkStatuses[nth - 1], 429);
});

Then("it is told how long to wait", async function () {
  assert.ok(lastLimited);
  assert.ok(Number(lastLimited!.headers.get("retry-after")) > 0);
  assert.match((await lastLimited!.json()).error, /Please wait \d+ minutes?/);
});

Then("a sign-in from another network is still answered", async function () {
  assert.notStrictEqual((await loginFrom("198.51.100.4", 0)).status, 429);
});

Then(/^her phones list shows (\d+) phones?(, with the new one marked as this phone)?$/, function (n: string, marked?: string) {
  const listed = take(flows.listDevices(session()))!.devices;
  assert.strictEqual(listed.length, Number(n), JSON.stringify(listed));
  if (marked) assert.strictEqual(listed.find((d) => d.current)?.id, phoneB!.deviceId);
});

When("from the new phone she removes the first phone", function () {
  take(flows.removeDevice(session(), phoneA!.deviceId));
  assert.ok(last?.ok, JSON.stringify(last));
});

When("she removes this phone from its own phones list", function () {
  take(flows.removeDevice(session(), phoneA!.deviceId));
});

Then("the first phone has no share of its PIN key on the server", function () {
  assert.strictEqual(authStore.devices.get(phoneA!.deviceId)!.serverShareHex, null);
});

Then("signing in on the first phone needs a code from her email, as for a phone never seen", async function () {
  await signIn(person.email, person.password, phoneA!.deviceId);
  assert.deepStrictEqual([...session().needs], ["email-code"]);
});

When("she changes her password from {string} to {string}", async function (current: string, next: string) {
  const { authKeyHex: currentAuthKeyHex } = await loginProof(current, kdfOf(person.email));
  const fresh = await wrapWithPassword(next, person.vaultKeyBytes);
  last = await flows.changePassword(session(), { currentAuthKeyHex, ...fresh.send });
  if (last.ok) person.password = next;
});

Then(/^her account uses Argon2id with (\d+) MiB$/, function (mib: string) {
  const kdf = authStore.userByEmail(person.email)!.kdf;
  assert.strictEqual(kdf.algorithm, "argon2id");
  assert.strictEqual(kdf.memoryKiB, Number(mib) * 1024);
});

Given("her account still uses the older PBKDF2 settings", async function () {
  const kdf = { saltHex: "ab".repeat(16), iterations: 600_000 };
  const keys = await loginProof(person.password, kdf);
  const user = authStore.userByEmail(person.email)!;
  user.kdf = kdf;
  user.authHash = (await import("../../lib/auth/secrets")).slowHash(keys.authKeyHex);
  user.wrappedVaultKey = await (await import("../../lib/crypto/keys")).wrapBytes(person.vaultKeyBytes, keys.wrapKey);
});

Then("her account still uses PBKDF2", function () {
  assert.strictEqual(authStore.userByEmail(person.email)!.kdf.algorithm, undefined);
});

/** What the app sends after a PBKDF2 sign-in (lib/auth/client.ts), with these settings. */
async function upgradeFrom(password: string, vaultKeyBytes: Uint8Array) {
  const { authKeyHex: currentAuthKeyHex } = await loginProof(password, kdfOf(person.email));
  const fresh = await wrapWithPassword(password, vaultKeyBytes);
  return flows.upgradeKdf(session(), { currentAuthKeyHex, ...fresh.send });
}

When("the app moves her account to the new settings", async function () {
  last = await upgradeFrom(person.password, person.vaultKeyBytes);
  assert.ok(last.ok, JSON.stringify(last));
});

When("someone signs in with her password on a phone of their own", async function () {
  onNewPhone = true;
  await signIn(person.email, person.password, undefined);
});

When("they try to move her account to settings of their choosing", async function () {
  // Their own vault key: if this were accepted, hers would be lost.
  last = await upgradeFrom(person.password, crypto.getRandomValues(new Uint8Array(32)));
});

Then("no {string} email was sent", function (subject: string) {
  assert.ok(!listOutbox().some((e) => e.subject === subject), `"${subject}" was sent`);
});

Given("her phone has alerts turned on", function () {
  take(flows.registerPushToken(session(), "a1b2c3d4e5f6a1b2c3d4e5f6"));
  assert.ok(last?.ok, JSON.stringify(last));
});

Then("her phone was alerted once", function () {
  assert.strictEqual(pushOutbox.length, 1);
  assert.strictEqual(pushOutbox[0].token, "a1b2c3d4e5f6a1b2c3d4e5f6");
});

Then("the alert names no person, address or note", function () {
  const shown = `${pushOutbox[0].title} ${pushOutbox[0].body}`;
  assert.doesNotMatch(shown, new RegExp(`${nameFor(person.email)}|${person.email}|@|note`, "i"));
});

Then("no phone was alerted", function () {
  assert.strictEqual(pushOutbox.length, 0);
});
