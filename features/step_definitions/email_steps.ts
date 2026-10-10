import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";

import {
  trustedFriendInvite,
  safetyCheckIn,
  beneficiaryRelease,
  type TemplateContext,
} from "../../lib/email/templates";
import { parseFrom, resolveDriver, sendEmail } from "../../lib/email";
import { listOutbox, resetOutbox, alreadySent } from "../../lib/email/outbox";
import type { EmailMessage } from "../../lib/email/types";

const CTX: TemplateContext = { appUrl: "https://virasat.test" };

/*
 * Stand-ins for the secrets that must never appear. These are the exact
 * shapes the real values take: a 64-char hex master key, a PEM private key,
 * the user's passphrase, and a note body.
 */
const MASTER_KEY_HEX = "ec8d2eb65ff27afb1122334455667788990011223344556677889900aabbccdd";
const RECOVERY_KEY_PEM =
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ\n-----END PRIVATE KEY-----";
const PASSPHRASE = "VirasatMaster2026!#";
const NOTE_BODY = "Bank locker 447, Canara Bank Jayanagar. Key is in the almirah.";

let message: EmailMessage;
let lastDriverName = "";

function build(template: string): EmailMessage {
  switch (template) {
    case "trusted-friend":
      return trustedFriendInvite(CTX, {
        friendName: "Meera",
        friendEmail: "meera@example.com",
        ownerName: "Mr Sharma",
        inviteToken: "tok_abc123",
      });
    case "gentle":
    case "urgent":
    case "critical":
      return safetyCheckIn(CTX, {
        ownerName: "Mr Sharma",
        ownerEmail: "sharma@example.com",
        tone: template,
        daysUntilRelease: 20,
        notificationId: `notif-${template}-1`,
      });
    case "release":
      return beneficiaryRelease(CTX, {
        beneficiaryName: "Anita",
        beneficiaryEmail: "anita@example.com",
        ownerName: "Mr Sharma",
        noteCount: 3,
        releaseId: "ben-1:365",
      });
    default:
      throw new Error(`Unknown template "${template}" in the test table.`);
  }
}

/** Every part of the message a recipient could read. */
function allText(m: EmailMessage): string {
  return [m.subject, m.text, m.html ?? ""].join("\n");
}

Given("an email built from the {string} template", function (template: string) {
  message = build(template);
});

function assertAbsent(needle: string, label: string): void {
  const haystack = allText(message);
  assert.ok(haystack.length > 0, "The message was empty, so this proves nothing.");
  assert.ok(
    !haystack.includes(needle),
    `${label} appeared in the email "${message.subject}".`
  );
  // A prefix is as damaging as the whole string for key material.
  const prefix = needle.replace(/\s+/g, "").slice(0, 16);
  if (prefix.length === 16) {
    assert.ok(
      !haystack.replace(/\s+/g, "").includes(prefix),
      `A 16-character prefix of ${label} appeared in the email "${message.subject}".`
    );
  }
}

Then("the message should not contain the master key", function () {
  assertAbsent(MASTER_KEY_HEX, "The master key");
});

Then("the message should not contain the recovery key", function () {
  assertAbsent(RECOVERY_KEY_PEM, "The recovery key");
  assert.ok(
    !allText(message).includes("BEGIN PRIVATE KEY"),
    "A PEM private key block appeared in the email."
  );
});

Then("the message should not contain the passphrase", function () {
  assertAbsent(PASSPHRASE, "The passphrase");
});

Then("the message should not contain the note body", function () {
  assertAbsent(NOTE_BODY, "A note body");
});

/**
 * The exact-string checks above only catch a template that interpolates one
 * of those specific test values. This catches the general case: anything in
 * the message that has the *shape* of a secret, however it got there.
 */
Then("the message should contain nothing shaped like a secret", function () {
  const haystack = allText(message);
  const patterns: Array<{ re: RegExp; what: string }> = [
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: "a PEM private key block" },
    { re: /\b[0-9a-fA-F]{32,}\b/, what: "a run of 32+ hex characters (a key or IV)" },
    { re: /\b[A-Za-z0-9+/]{40,}={0,2}\b/, what: "a long base64 blob" },
  ];

  const found = patterns.filter((p) => p.re.test(haystack));
  assert.deepStrictEqual(
    found.map((f) => f.what),
    [],
    `The email "${message.subject}" contains ${found.map((f) => f.what).join(" and ")}. ` +
      "No Virasat email may carry key material."
  );
});

Then("the message should have a plain text part", function () {
  assert.ok(
    message.text && message.text.trim().length > 0,
    "The message has no plain text part, which this audience often needs."
  );
});

Then("the message should tell the reader the key is not in the email", function () {
  const text = message.text.toLowerCase();
  assert.ok(
    text.includes("not in this email") && text.includes("do not have a copy"),
    "The release notice must say plainly that the key is neither enclosed nor held by us."
  );
});

Then("the message should avoid the words {string}", function (list: string) {
  const banned = list.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const haystack = allText(message).toLowerCase();
  const found = banned.filter((w) => haystack.includes(w));
  assert.deepStrictEqual(
    found,
    [],
    `These engineering words reached a 65+ reader: ${found.join(", ")}`
  );
});

Then("the message should contain a link to the invite acceptance page", function () {
  assert.ok(
    message.text.includes("https://virasat.test/trusted-friends/accept/tok_abc123"),
    `The invite had no acceptance link. Text was:\n${message.text}`
  );
});

/* --- Idempotency and driver configuration ----------------------------- */

let sendResults: Array<{ ok: boolean; skipped?: boolean; error?: string }> = [];

function fixedMessage(): EmailMessage {
  return {
    to: { email: "anita@example.com", name: "Anita" },
    subject: "Test",
    text: "Test body",
    idempotencyKey: "fixed-key-1",
  };
}

Given("a console mailer with an empty outbox", function () {
  process.env.EMAIL_DRIVER = "console";
  resetOutbox();
  sendResults = [];
});

Given("a mailer whose driver is not configured", function () {
  process.env.EMAIL_DRIVER = "resend";
  delete process.env.RESEND_API_KEY;
  resetOutbox();
  sendResults = [];
});

Given("the email driver is set to {string}", function (name: string) {
  process.env.EMAIL_DRIVER = name;
  lastDriverName = name;
});

When("the same message is sent three times", async function () {
  for (let i = 0; i < 3; i++) sendResults.push(await sendEmail(fixedMessage()));
});

When("the same message is sent twice", async function () {
  for (let i = 0; i < 2; i++) sendResults.push(await sendEmail(fixedMessage()));
});

Then("only one email should have left the building", function () {
  const actuallySent = sendResults.filter((r) => r.ok && !r.skipped);
  assert.strictEqual(
    actuallySent.length,
    1,
    `Expected exactly one real send, got ${actuallySent.length}.`
  );
  assert.strictEqual(sendResults.filter((r) => r.skipped).length, 2);
});

Then("the outbox should hold {int} entry", function (count: number) {
  assert.strictEqual(listOutbox().length, count);
});

Then("both attempts should be recorded as failures", function () {
  assert.strictEqual(sendResults.length, 2);
  assert.ok(sendResults.every((r) => !r.ok), "A send succeeded without a configured driver.");
  assert.strictEqual(listOutbox().filter((e) => e.status === "failed").length, 2);
});

Then("the message should still be retryable", function () {
  assert.strictEqual(
    alreadySent("fixed-key-1"),
    false,
    "A failed send closed the idempotency key, so a release notice could be lost forever."
  );
});

Then("the mailer should report that it is not ready", function () {
  assert.strictEqual(resolveDriver().ready, false);
});

Then("the reason should name the valid drivers", function () {
  const reason = resolveDriver().notReadyReason ?? "";
  for (const expected of ["console", "resend", "sendgrid"]) {
    assert.ok(reason.includes(expected), `The reason did not mention "${expected}": ${reason}`);
  }
  assert.ok(reason.includes(lastDriverName), "The reason did not quote the bad driver name.");
});

/* --- EMAIL_FROM parsing ----------------------------------------------- */

Then("parsing {string} should give name {string} and address {string}", function (
  raw: string,
  name: string,
  email: string
) {
  const parsed = parseFrom(raw);
  assert.strictEqual(parsed.name ?? "", name);
  assert.strictEqual(parsed.email, email);
});
