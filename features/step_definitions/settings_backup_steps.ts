import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { cycleBoundaries, getPhaseFromElapsedDays } from "../../lib/state/heartbeatMachine";
import { buildBackup, parseBackup, BackupFormatError, type BackupFile } from "../../lib/vault/backup";
import type { VaultItemRecord } from "../../lib/state/mockDatabase";

let cycleDays = 365;
let bounds = cycleBoundaries(cycleDays);
let elapsed = 0;
let note: VaultItemRecord;
let backup: BackupFile;
let serialised = "";
let readBack: BackupFile | null = null;
let readError: Error | null = null;

Given("a check-in cycle of {int} days", function (days: number) {
  cycleDays = days;
  bounds = cycleBoundaries(days);
});

Then("silence should last {int} days", function (days: number) {
  assert.strictEqual(bounds.silentEnd, days);
});

Then("the full cycle should be {int} days", function (days: number) {
  assert.strictEqual(bounds.total, days);
});

Then("gentle reminders should begin before urgent ones", function () {
  assert.ok(
    bounds.silentEnd < bounds.gentleEnd && bounds.gentleEnd < bounds.urgentEnd,
    `boundaries out of order: ${bounds.silentEnd}/${bounds.gentleEnd}/${bounds.urgentEnd}`
  );
  assert.ok(bounds.urgentEnd < bounds.total, "urgent phase must end before release");
});

When("{int} days have passed without a check-in", function (days: number) {
  elapsed = days;
});

Then("the safety state should have left the silent period", function () {
  const phase = getPhaseFromElapsedDays(elapsed, cycleDays);
  assert.ok(phase.phase > 0, `expected to have escalated, still in phase ${phase.phase}`);
});

Then("the safety state should still be in the silent period", function () {
  const phase = getPhaseFromElapsedDays(elapsed, cycleDays);
  assert.strictEqual(phase.phase, 0, `expected silence, got phase ${phase.phase}`);
});

Given("a note whose body was encrypted to {string}", function (plaintext: string) {
  // Stand-in for real AES-GCM output: what matters for backup is that the
  // record carries ciphertext, never the plaintext it came from.
  note = {
    id: "note-test-1",
    title: "Bank locker",
    subcategoryId: "assets.locker",
    mimeType: "text/plain",
    ciphertextHex: Buffer.from(plaintext, "utf8").toString("hex"),
    ivHex: "0123456789abcdef01234567",
    encryptedChestKeyHex: "deadbeef",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedBeneficiaryIds: ["ben-1"],
  };
});

When("a backup file is produced", function () {
  backup = buildBackup([note]);
  serialised = JSON.stringify(backup);
});

Then("the backup should not contain the words {string}", function (phrase: string) {
  assert.ok(
    !serialised.includes(phrase),
    `backup leaked plaintext: it contained "${phrase}"`
  );
});

Then("the backup should keep the ciphertext and IV needed to restore it", function () {
  assert.ok(backup.notes[0].ciphertextHex.length > 0, "ciphertext missing");
  assert.ok(backup.notes[0].ivHex.length > 0, "IV missing");
});

When("the backup file is read back", function () {
  readBack = parseBackup(serialised);
});

Then("it should contain {int} note", function (count: number) {
  assert.ok(readBack, "nothing was read back");
  assert.strictEqual(readBack.notes.length, count);
});

When("a file that is not a backup is read back", function () {
  readError = null;
  try {
    parseBackup(JSON.stringify({ hello: "world" }));
  } catch (err) {
    readError = err as Error;
  }
});

Then("reading it should fail with a clear message", function () {
  assert.ok(readError, "a non-backup file was accepted");
  assert.ok(readError instanceof BackupFormatError, "wrong error type");
  assert.match(readError.message, /not a Virasat backup/);
});
