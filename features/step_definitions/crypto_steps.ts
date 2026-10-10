import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { webcrypto } from "node:crypto";

// Polyfill WebCrypto for Node environment during Cucumber execution
// Node exposes WebCrypto under a different name, and the crypto helpers
// expect a browser-shaped global. Narrowing the cast keeps this honest
// without reaching for `any`.
const globals = globalThis as unknown as { crypto?: Crypto; window?: unknown };
if (!globals.crypto) {
  globals.crypto = webcrypto as unknown as Crypto;
}
if (!globals.window) {
  globals.window = globalThis;
}

import { deriveMasterKey, bufferToHex, hexToBuffer, generateSalt } from "../../lib/crypto/argon2";
import { encryptPayload, decryptPayloadToString, generateChestKey, exportKeyToHex, importKeyFromHex } from "../../lib/crypto/aes-gcm";
import { generateBeneficiaryKeyPair, encryptChestKeyForBeneficiary, decryptChestKeyWithBeneficiaryPrivateKey } from "../../lib/crypto/asymmetric";

let passphrase = "";
let saltHex = "";
let masterKey: CryptoKey;
let ciphertextHex = "";
let ivHex = "";
let decryptedText = "";

let benKeyPair: Awaited<ReturnType<typeof generateBeneficiaryKeyPair>>;
let chestKeyHex = "";
let encryptedEnvelopeHex = "";
let decryptedChestKeyHex = "";

Given("a user passphrase {string} and a salt hex {string}", function (inputPassphrase: string, inputSalt: string) {
  passphrase = inputPassphrase;
  saltHex = inputSalt;
});

When("the WebCrypto PBKDF2 key derivation is executed", async function () {
  const result = await deriveMasterKey(passphrase, saltHex);
  masterKey = result.key;
});

Then("a 256-bit AES-GCM Master Key K_master should be derived", function () {
  assert.ok(masterKey, "MasterKey must be derived");
  assert.strictEqual(masterKey.algorithm.name, "AES-GCM");
});

Then("the key should be extractable for in-memory volatile session storage", function () {
  assert.strictEqual(masterKey.extractable, true);
});

Given("a valid master key K_master", async function () {
  const result = await deriveMasterKey("VirasatMaster2026!#", "e4f81c90a1b2c3d4e5f6a7b8c9d0e1f2");
  masterKey = result.key;
});

Given("plaintext secret notes {string}", function (notes: string) {
  decryptedText = notes;
});

When("the payload is encrypted using AES-256-GCM with a 12-byte random IV", async function () {
  const encResult = await encryptPayload(decryptedText, masterKey);
  ciphertextHex = encResult.ciphertextHex;
  ivHex = encResult.ivHex;
});

Then("the result should contain a ciphertext hex string and IV hex string", function () {
  assert.ok(ciphertextHex && ciphertextHex.length > 0, "Ciphertext hex must not be empty");
  assert.ok(ivHex && ivHex.length === 24, "IV hex must be 24 characters (12 bytes)");
});

Then("decrypting the ciphertext hex with K_master and IV hex should restore {string}", async function (expectedText: string) {
  const restoredText = await decryptPayloadToString(ciphertextHex, ivHex, masterKey);
  assert.strictEqual(restoredText, expectedText);
});

Given("a beneficiary with an RSA-OAEP 2048-bit public key", async function () {
  benKeyPair = await generateBeneficiaryKeyPair();
  assert.ok(benKeyPair.publicKey, "RSA Public Key should be generated");
});

Given("a generated 256-bit Chest Key K_chest", async function () {
  const chestKey = await generateChestKey();
  chestKeyHex = await exportKeyToHex(chestKey);
  assert.ok(chestKeyHex && chestKeyHex.length === 64, "K_chest hex must be 64 characters (256 bits)");
});

When("K_chest is envelope encrypted with the beneficiary's public key", async function () {
  encryptedEnvelopeHex = await encryptChestKeyForBeneficiary(chestKeyHex, benKeyPair.publicKey);
});

Then("the resulting envelope string E_ben\\(K_chest) should be produced", function () {
  assert.ok(encryptedEnvelopeHex && encryptedEnvelopeHex.length > 0, "Envelope hex must be produced");
});

Then("only the beneficiary's RSA private key should be able to decrypt K_chest", async function () {
  decryptedChestKeyHex = await decryptChestKeyWithBeneficiaryPrivateKey(encryptedEnvelopeHex, benKeyPair.privateKey);
  assert.strictEqual(decryptedChestKeyHex, chestKeyHex);
});

/* --- Key material must never reach the console ------------------------- */

let recordedConsole: string[] = [];
let realConsoleLog: typeof console.log | null = null;
let recordedMasterKeyHex = "";
let recordedChestKeyHex = "";

Given("the console is being recorded", function () {
  recordedConsole = [];
  realConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    recordedConsole.push(args.map((a) => String(a)).join(" "));
  };
});

When("a chest key is generated, exported and re-imported", async function () {
  recordedChestKeyHex = await exportKeyToHex(await generateChestKey());
  await importKeyFromHex(recordedChestKeyHex);
  // Capture K_master's hex via a fresh derivation with the same inputs, so
  // the assertions below have the exact string to search the log for.
  recordedMasterKeyHex = (await deriveMasterKey(passphrase, saltHex)).keyRawHex;
  if (realConsoleLog) {
    console.log = realConsoleLog;
    realConsoleLog = null;
  }
});

function assertNotLogged(needle: string, label: string): void {
  assert.ok(needle.length > 0, `${label} was empty, so this assertion proves nothing.`);
  // If the logger were a no-op here (NODE_ENV=production in CI, say) every
  // assertion below would pass without testing anything. Fail loudly instead.
  assert.ok(
    recordedConsole.length > 0,
    "Nothing was captured from the console, so this scenario cannot prove that " +
      "key material is kept out of it. Check that cryptoLog is active."
  );
  const hit = recordedConsole.find((line) => line.includes(needle));
  assert.strictEqual(hit, undefined, `${label} was written to the console: ${hit}`);
}

/**
 * A prefix is as damaging as the whole string, so check the shortest slice an
 * attacker could still use: 8 hex characters (4 bytes) of key material.
 */
function assertNoPrefixLogged(secretHex: string, label: string): void {
  assertNotLogged(secretHex, label);
  assertNotLogged(secretHex.slice(0, 8), `${label} (first 4 bytes)`);
}

Then("the console output should not contain the salt", function () {
  assertNoPrefixLogged(saltHex, "The salt");
});

Then("the console output should not contain the master key", function () {
  assertNoPrefixLogged(recordedMasterKeyHex, "K_master");
});

Then("the console output should not contain the passphrase", function () {
  assertNotLogged(passphrase, "The passphrase");
});

Then("the console output should not contain any chest key material", function () {
  assertNoPrefixLogged(recordedChestKeyHex, "A chest key");
});
