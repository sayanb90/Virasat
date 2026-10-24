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
  openPinCopy,
  prepareEnrolment,
  signForPin,
  unlockWithBiometrics,
  type DeviceState,
} from "../../lib/device/core";
import type { SocialProvider, WrappedKey } from "../../lib/auth/types";

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
  const prepared = await prepareEnrolment(true);
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
  });
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
  const { signature, open } = await unlockWithBiometrics(phone, challenge);
  take(flows.proveDevice(session(), { method: "biometric", signature }));
  assert.ok(last?.ok, `Face ID was refused: ${JSON.stringify(last)}`);
  person.vaultKeyBytes = await open();
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
  const signature = await signForPin(phone, challenge);
  const proved = take(flows.proveDevice(session(), { method: "pin", signature, pin }));
  serverShare = (proved as flows.DeviceProofResult | null)?.serverShareHex;
});

When("she enters {int} wrong PINs", async function (n: number) {
  for (let i = 0; i < n; i++) {
    await signIn(person.email, person.password, phoneA!.deviceId);
    const challenge = take(flows.deviceChallenge(session()))!.challenge;
    const signature = await signForPin(phoneA!, challenge);
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
  const { signature, open } = await unlockWithBiometrics(phoneB!, challenge);
  take(flows.proveDevice(session(), { method: "biometric", signature }));
  assert.ok(last?.ok);
  assert.strictEqual(bufferToHex(await open()), bufferToHex(person.vaultKeyBytes));
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
