import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { webcrypto } from "node:crypto";

// Polyfill WebCrypto for Node environment during Cucumber execution
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}
if (!globalThis.window) {
  (globalThis as any).window = globalThis;
}

import { deriveMasterKey, bufferToHex, hexToBuffer, generateSalt } from "../../lib/crypto/argon2";
import { encryptPayload, decryptPayloadToString, generateChestKey, exportKeyToHex } from "../../lib/crypto/aes-gcm";
import { generateBeneficiaryKeyPair, encryptChestKeyForBeneficiary, decryptChestKeyWithBeneficiaryPrivateKey } from "../../lib/crypto/asymmetric";

let passphrase = "";
let saltHex = "";
let masterKey: CryptoKey;
let ciphertextHex = "";
let ivHex = "";
let decryptedText = "";

let benKeyPair: any;
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
