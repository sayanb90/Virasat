// The browser crypto helpers reach for window.crypto.
const g = globalThis as { window?: unknown };
if (!g.window) g.window = globalThis;

import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { authStore } from "@/lib/auth/store";
import * as flows from "@/lib/auth/flows";
import { vaultFor, resetVaultsForTesting } from "@/lib/state/mockDatabase";
import { resetOutbox } from "@/lib/email/outbox";
import { loginProof, openWithPassword, openWithRecoveryCode } from "@/lib/crypto/account";
import { importVaultKey } from "@/lib/crypto/keys";
import { decryptAndUnpackSecretPayload } from "@/lib/crypto/payloadCodec";
import { cycleBoundaries, getPhaseFromElapsedDays } from "@/lib/state/heartbeatMachine";
import { demoPassword, elapsedDaysFor, generateMockDb, plusAddress, type LadderStage } from "@/lib/dev/mockDb";
import { sendMockEmails } from "@/lib/dev/mockEmails";
import { redirected, sendEmail } from "@/lib/email";
import { quietConsole } from "./harness";

const INBOX = "tester@example.com";
const PASSWORD = "Mango-River-Lamp-42";

beforeEach(() => {
  authStore.resetForTesting();
  resetVaultsForTesting();
  resetOutbox();
  process.env.EMAIL_DRIVER = "console";
  delete process.env.EMAIL_REDIRECT_TO;
});

async function seed() {
  const restore = quietConsole();
  try {
    return await generateMockDb({ inbox: INBOX, password: PASSWORD, now: new Date("2026-10-24T12:00:00Z") });
  } finally {
    restore();
  }
}

describe("the mock database", () => {
  test("one account per ladder stage, in one inbox's plus-addresses", async () => {
    const { password, accounts } = await seed();
    assert.equal(password, PASSWORD);
    assert.deepEqual(
      accounts.map((a) => [a.email, a.stage, a.phase]),
      [
        ["tester@example.com", "healthy", 0],
        ["tester+owner.gentle@example.com", "gentle", 1],
        ["tester+owner.urgent@example.com", "urgent", 2],
        ["tester+owner.critical@example.com", "critical", 3],
        ["tester+owner.released@example.com", "released", 4],
        ["tester+owner.vacation@example.com", "on-vacation", 1],
      ]
    );
    for (const a of accounts) {
      const vault = vaultFor(a.userId);
      assert.equal(vault.getSettings().checkInCycleDays, a.cycleDays);
      assert.equal(vault.simulatedElapsedDays, a.elapsedDays);
      assert.equal(
        new Date(vault.lastCheckInDate).getTime(),
        new Date("2026-10-24T12:00:00Z").getTime() - a.elapsedDays * 86_400_000
      );
      assert.ok(a.beneficiaries.every((b) => /^tester\+[a-z]+@example\.com$/.test(b)));
    }
    assert.equal(vaultFor(accounts[5].userId).isOnVacation(new Date("2026-10-25T00:00:00Z")), true);
    assert.equal(authStore.sessions.size, 0, "seeded accounts start signed out");
    assert.equal(authStore.lastCodesForTesting.size, 0, "no codes are left captured");
    assert.equal(authStore.captureCodesForTesting, false);
  });

  test("a seeded account signs in with its password, and its notes really decrypt", async () => {
    const { accounts } = await seed();
    const main = accounts[0];
    const kdf = flows.prelogin(main.email);
    assert.ok(kdf.ok);
    assert.equal(kdf.data.algorithm, "argon2id", "made the way new accounts are");
    const { authKeyHex } = await loginProof(PASSWORD, kdf.data);
    const login = await flows.login({ email: main.email, authKeyHex });
    assert.ok(login.ok, JSON.stringify(login));
    const vaultKey = await importVaultKey(await openWithPassword(PASSWORD, kdf.data, login.data.wrappedVaultKey));

    const notes = vaultFor(main.userId).getVaultItems();
    assert.equal(notes.length, 6);
    for (const n of notes) {
      assert.match(n.id, /^note-/);
      const opened = await decryptAndUnpackSecretPayload(n.ciphertextHex, n.ivHex, vaultKey);
      assert.ok((opened.textNotes ?? "").length > 20, n.title);
    }
    const nominee = notes.find((n) => n.subcategoryId === "banks.nominees")!;
    assert.match((await decryptAndUnpackSecretPayload(nominee.ciphertextHex, nominee.ivHex, vaultKey)).textNotes!, /Nominee is Meera/);
    assert.equal(nominee.assignedBeneficiaryIds.length, 1, "addressed to Meera only");
  });

  test("the printed Recovery Kit code opens the main account's vault", async () => {
    const { accounts } = await seed();
    const main = accounts[0];
    assert.match(main.recoveryCode!, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
    assert.equal(accounts[1].recoveryCode, undefined, "only the main account's is printed");
    const user = authStore.users.get(main.userId)!;
    const bytes = await openWithRecoveryCode(main.recoveryCode!, user.recovery!.wrappedVaultKey);
    assert.equal(bytes.length, 32);
  });

  test("friends are accepted or still invited, as seeded", async () => {
    const { accounts } = await seed();
    const friends = vaultFor(accounts[0].userId).getTrustedFriends();
    assert.deepEqual(friends.map((f) => [f.email, f.status]), [
      ["tester+priya@example.com", "Accepted"],
      ["tester+rahul@example.com", "Invited"],
    ]);
    assert.equal(accounts[0].trustedFriends[1].inviteToken, friends[1].inviteToken);
  });

  test("refuses to seed over accounts that already exist", async () => {
    await seed();
    await assert.rejects(generateMockDb({ inbox: INBOX, password: PASSWORD }), /already has an account/);
  });

  test("a flow that refuses stops the run and says which step", async () => {
    await assert.rejects(generateMockDb({ inbox: "not-an-email", password: PASSWORD }), /Could not start sign-up for not-an-email: .*valid email/);
  });

  test("without a password, one is made up and shared by every account", async () => {
    const restore = quietConsole();
    try {
      const { password, accounts } = await generateMockDb({ inbox: INBOX });
      assert.match(password, /^[A-Z][a-z]+-[A-Z][a-z]+-[A-Z][a-z]+-\d{2}$/);
      assert.equal(accounts.length, 6);
    } finally {
      restore();
    }
  });

  test("a generated password is three words and a number", async () => {
    let i = 0;
    const fixed = () => [0, 0.5, 0.99, 0.5][i++ % 4];
    assert.equal(demoPassword(fixed), "Mango-Monsoon-Saffron-55");
    assert.match(demoPassword(), /^[A-Z][a-z]+-[A-Z][a-z]+-[A-Z][a-z]+-\d{2}$/);
  });

  test("plus-addresses and stage days", () => {
    assert.equal(plusAddress("Me@Gmail.com"), "me@gmail.com");
    assert.equal(plusAddress("me@gmail.com", "meera"), "me+meera@gmail.com");
    assert.equal(plusAddress("me+old@gmail.com", "meera"), "me+meera@gmail.com", "an existing tag is replaced");
    const b = cycleBoundaries(365);
    const stages: LadderStage[] = ["healthy", "gentle", "urgent", "critical", "released", "on-vacation"];
    assert.deepEqual(stages.map((s) => elapsedDaysFor(s, 365)), [12, b.silentEnd + 2, b.gentleEnd + 2, b.urgentEnd + 2, 366, b.silentEnd + 2]);
    assert.equal(getPhaseFromElapsedDays(elapsedDaysFor("released", 90), 90).isTriggered, true);
  });
});

describe("sending what the seeded state calls for", () => {
  test("invitations, ladder reminders and release notices, once each; nothing for the healthy or the away", async () => {
    const { accounts } = await seed();
    const restore = quietConsole();
    try {
      const rows = await sendMockEmails(accounts);
      const by = (owner: string) => rows.filter((r) => r.owner === owner);
      assert.deepEqual(by(accounts[0].email).map((r) => [r.to, r.subject]), [
        ["tester+rahul@example.com", "Sayan has asked you to be a Trusted Friend"],
      ]);
      assert.ok(by(accounts[1].email).length >= 1 && by(accounts[1].email).every((r) => r.to === accounts[1].email));
      assert.ok(by(accounts[4].email).some((r) => r.to === "tester+mary@example.com" && /Joseph left something for you/.test(r.subject)));
      assert.deepEqual(by(accounts[5].email), [], "on vacation: nothing");
      assert.ok(rows.every((r) => r.status === "sent"));
      assert.deepEqual(await sendMockEmails(accounts), [], "a second run sends nothing again");
    } finally {
      restore();
    }
  });
});

describe("when the email driver fails", () => {
  test("each row carries the driver's error", async () => {
    const { accounts } = await seed();
    process.env.EMAIL_DRIVER = "nonsense";
    const restore = quietConsole();
    try {
      const rows = await sendMockEmails(accounts.slice(0, 1));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "failed");
      assert.match(rows[0].error!, /EMAIL_DRIVER="nonsense" is not a driver/);
    } finally {
      restore();
    }
  });
});

describe("EMAIL_REDIRECT_TO", () => {
  const message = {
    to: { email: "tester+meera@example.com", name: "Meera" },
    subject: "Hello",
    text: "Body",
    html: "<p>Body</p>",
    idempotencyKey: "k-1",
  };

  test("unset, or already the target: the message is untouched", () => {
    assert.equal(redirected(message, undefined), message);
    assert.equal(redirected(message, "  "), message);
    assert.equal(redirected(message, "TESTER+MEERA@example.com"), message);
  });

  test("set: delivered to one inbox, saying who it was for", () => {
    const r = redirected(message, "inbox@example.com");
    assert.deepEqual(r.to, { email: "inbox@example.com", name: "Meera" });
    assert.equal(r.subject, "[to tester+meera@example.com] Hello");
    assert.match(r.text, /^\[Redirected by EMAIL_REDIRECT_TO\. Meant for: Meera <tester\+meera@example\.com>\]\n\nBody$/);
    assert.match(r.html!, /Meant for: Meera &lt;tester\+meera@example\.com>\]<\/p><p>Body<\/p>$/);
    assert.equal(r.idempotencyKey, "k-1");
    const noName = redirected({ ...message, to: { email: "x@example.com" }, html: undefined }, "inbox@example.com");
    assert.match(noName.text, /Meant for: x@example\.com\]/);
    assert.equal(noName.html, undefined);
  });

  test("sendEmail hands the driver the redirected message, and the outbox keeps the intended recipient", async () => {
    process.env.EMAIL_REDIRECT_TO = "inbox@example.com";
    const lines: string[] = [];
    const log = console.log;
    console.log = (l: string) => void lines.push(l);
    try {
      const prev = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      try {
        assert.equal((await sendEmail(message)).ok, true);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = prev;
      }
    } finally {
      console.log = log;
    }
    assert.match(lines.join("\n"), /To:\s+Meera <inbox@example\.com>/);
    assert.match(lines.join("\n"), /Subject: \[to tester\+meera@example\.com\] Hello/);
    const { listOutbox } = await import("@/lib/email/outbox");
    assert.equal(listOutbox()[0].to, "tester+meera@example.com");
  });
});
