import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}
if (!globalThis.window) {
  (globalThis as any).window = globalThis;
}

import { deriveMasterKey } from "../../lib/crypto/argon2";
import { packAndEncryptSecretPayload, decryptAndUnpackSecretPayload } from "../../lib/crypto/payloadCodec";

let masterKey: CryptoKey;
let title = "";
let textNotes = "";
let fileName = "";
let fileSize = 0;
let fileBuffer: ArrayBuffer | null = null;
let ciphertextHex = "";
let ivHex = "";
let unpackedResult: any;

Given("secret title {string}", function (inputTitle: string) {
  title = inputTitle;
});

Given("plaintext notes {string}", function (inputNotes: string) {
  textNotes = inputNotes;
});

Given("an attached PDF document {string} of size {int} bytes", function (inputFileName: string, inputSize: number) {
  fileName = inputFileName;
  fileSize = inputSize;
  fileBuffer = new Uint8Array(inputSize).fill(0x41).buffer as ArrayBuffer;
});

When("the secret payload is packed and encrypted using AES-256-GCM", async function () {
  const kdf = await deriveMasterKey("VirasatMaster2026!#", "e4f81c90a1b2c3d4e5f6a7b8c9d0e1f2");
  masterKey = kdf.key;

  const res = await packAndEncryptSecretPayload(textNotes, fileBuffer, "application/pdf", fileName, masterKey);
  ciphertextHex = res.ciphertextHex;
  ivHex = res.ivHex;
});

Then("unpacking the decrypted payload should restore both the exact plaintext notes {string}", async function (expectedNotes: string) {
  unpackedResult = await decryptAndUnpackSecretPayload(ciphertextHex, ivHex, masterKey);
  assert.strictEqual(unpackedResult.textNotes, expectedNotes);
});

Then("the PDF document buffer of {int} bytes", function (expectedSize: number) {
  assert.ok(unpackedResult.fileBuffer, "File buffer must exist");
  assert.strictEqual(unpackedResult.fileBuffer.byteLength, expectedSize);
});

Given("an existing encrypted secret with notes {string} and attached file {string}", async function (initialNotes: string, initialFile: string) {
  const kdf = await deriveMasterKey("VirasatMaster2026!#", "e4f81c90a1b2c3d4e5f6a7b8c9d0e1f2");
  masterKey = kdf.key;
  textNotes = initialNotes;
  fileName = initialFile;
  fileBuffer = new Uint8Array(100).fill(0x42).buffer as ArrayBuffer;

  const res = await packAndEncryptSecretPayload(textNotes, fileBuffer, "application/pdf", fileName, masterKey);
  ciphertextHex = res.ciphertextHex;
  ivHex = res.ivHex;
});

When("the user edits the notes to {string} and saves changes", async function (updatedNotes: string) {
  textNotes = updatedNotes;
  const res = await packAndEncryptSecretPayload(textNotes, fileBuffer, "application/pdf", fileName, masterKey);
  ciphertextHex = res.ciphertextHex;
  ivHex = res.ivHex;
});

Then("re-encrypting the payload should update the text notes", async function () {
  unpackedResult = await decryptAndUnpackSecretPayload(ciphertextHex, ivHex, masterKey);
  assert.strictEqual(unpackedResult.textNotes, "Updated notes for family");
});

Then("retain the attached {string} file attachment intact", function (expectedFileName: string) {
  assert.ok(unpackedResult.fileBuffer, "File buffer must be retained");
  assert.strictEqual(unpackedResult.fileName, expectedFileName);
});

Given("an existing encrypted secret with notes {string} and attached image {string}", async function (initialNotes: string, initialImage: string) {
  const kdf = await deriveMasterKey("VirasatMaster2026!#", "e4f81c90a1b2c3d4e5f6a7b8c9d0e1f2");
  masterKey = kdf.key;
  textNotes = initialNotes;
  fileName = initialImage;
  fileBuffer = new Uint8Array(50).fill(0x43).buffer as ArrayBuffer;

  const res = await packAndEncryptSecretPayload(textNotes, fileBuffer, "image/jpeg", fileName, masterKey);
  ciphertextHex = res.ciphertextHex;
  ivHex = res.ivHex;
});

When("the user selects delete attachment", async function () {
  fileBuffer = null;
  const res = await packAndEncryptSecretPayload(textNotes, null, "text/plain", "", masterKey);
  ciphertextHex = res.ciphertextHex;
  ivHex = res.ivHex;
});

Then("saving the secret should remove the image attachment", async function () {
  unpackedResult = await decryptAndUnpackSecretPayload(ciphertextHex, ivHex, masterKey);
  assert.strictEqual(unpackedResult.fileBuffer, undefined);
});

Then("keep the text notes {string} safely stored", function (expectedNotes: string) {
  assert.strictEqual(unpackedResult.textNotes, expectedNotes);
});
