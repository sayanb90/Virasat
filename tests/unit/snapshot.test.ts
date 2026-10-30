import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { authStore } from "@/lib/auth/store";
import { vaultFor, resetVaultsForTesting, allVaults } from "@/lib/state/mockDatabase";
import { listOutbox, record as recordEmail, resetOutbox, alreadySent } from "@/lib/email/outbox";
import { alreadyApplied, listLedger, record as recordLedger, resetLedger } from "@/lib/billing/ledger";
import {
  SNAPSHOT_FORMAT,
  loadSnapshotFile,
  restoreSnapshot,
  saveSnapshotFile,
  startFilePersistence,
  takeSnapshot,
} from "@/lib/persistence/snapshot";

let dir: string;
beforeEach(() => {
  authStore.resetForTesting();
  resetVaultsForTesting();
  resetOutbox();
  resetLedger();
  dir = mkdtempSync(path.join(tmpdir(), "virasat-data-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A little of everything a real store holds. */
function populate() {
  authStore.users.set("user-1", {
    id: "user-1",
    name: "Meera",
    email: "meera@example.com",
    emailVerifiedAt: "2026-10-24T00:00:00.000Z",
    kdf: { algorithm: "argon2id", saltHex: "ab".repeat(16), iterations: 2, memoryKiB: 65536, parallelism: 1 },
    authHash: "hash",
    wrappedVaultKey: { ivHex: "00", ciphertextHex: "11" },
    recovery: null,
    createdAt: "2026-10-24T00:00:00.000Z",
  } as never);
  authStore.usersByEmail.set("meera@example.com", "user-1");
  authStore.socialNonces.set("nonce-1", 123);
  authStore.recoveryFailures.set("user-1", 2);
  authStore.pushTokens.set("dev-1", { token: "a1b2c3d4e5f6a1b2", platform: "ios", updatedAt: "now" });
  authStore.lastCodesForTesting.set("meera@example.com", "123456");

  const vault = vaultFor("user-1");
  vault.addVaultItem({
    id: "note-1",
    title: "SBI nomination",
    subcategoryId: "banks.nominees",
    mimeType: "text/plain",
    ciphertextHex: "ab",
    ivHex: "cd",
    encryptedChestKeyHex: "ef",
    createdAt: "t",
    updatedAt: "t",
    assignedBeneficiaryIds: [],
  });
  vault.updateSettings({ checkInCycleDays: 180 });
  vault.simulatedElapsedDays = 42;

  recordEmail({ idempotencyKey: "k1", to: "meera@example.com", subject: "S", driver: "console", status: "sent", at: "t" });
  recordLedger({ eventId: "evt_1", type: "subscription.charged", outcome: "applied", at: "t" });
}

describe("a snapshot", () => {
  test("holds every store, and restores it exactly", () => {
    populate();
    const snap = JSON.parse(JSON.stringify(takeSnapshot(new Date("2026-10-24T12:00:00Z"))));
    assert.equal(snap.format, SNAPSHOT_FORMAT);
    assert.equal(snap.savedAt, "2026-10-24T12:00:00.000Z");

    authStore.resetForTesting();
    resetVaultsForTesting();
    resetOutbox();
    resetLedger();
    restoreSnapshot(snap);

    assert.equal(authStore.users.get("user-1")?.name, "Meera");
    assert.equal(authStore.usersByEmail.get("meera@example.com"), "user-1");
    assert.equal(authStore.socialNonces.get("nonce-1"), 123);
    assert.equal(authStore.recoveryFailures.get("user-1"), 2);
    assert.equal(authStore.pushTokens.get("dev-1")?.platform, "ios");
    assert.equal(authStore.lastCodesForTesting.size, 0, "test-only captures are not saved");

    const vault = vaultFor("user-1");
    assert.equal(vault.getVaultItem("note-1")?.title, "SBI nomination");
    assert.equal(vault.getSettings().checkInCycleDays, 180);
    assert.equal(vault.simulatedElapsedDays, 42);
    assert.ok(vault.getAuditLogs().length >= 2);

    assert.equal(listOutbox().length, 1);
    assert.ok(alreadySent("k1"), "a sent email stays sent: no duplicate after a restart");
    assert.equal(listLedger().length, 1);
    assert.ok(alreadyApplied("evt_1"), "a payment stays applied: no double credit after a restart");
  });

  test("replaces what was in memory, and a missing map is left empty", () => {
    populate();
    const snap = takeSnapshot();
    vaultFor("user-2");
    authStore.users.set("user-2", {} as never);
    restoreSnapshot({ ...snap, auth: { ...snap.auth, socialNonces: undefined } as never });
    assert.equal(authStore.users.has("user-2"), false);
    assert.deepEqual(allVaults().map((v) => v.userId), ["user-1"]);
    assert.equal(authStore.socialNonces.size, 0);
  });

  test("refuses a file that is not ours, or from another version", () => {
    assert.throws(() => restoreSnapshot({ format: "something-else" } as never), /not a Virasat data file/);
    assert.throws(() => restoreSnapshot({ ...takeSnapshot(), version: 99 }), /version 99; this build reads version 1/);
  });
});

describe("the data file", () => {
  test("is written atomically, owner-only, and read back", () => {
    populate();
    const file = path.join(dir, "nested", "db.json");
    saveSnapshotFile(file);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(existsSync(`${file}.${process.pid}.tmp`), false);
    assert.equal(loadSnapshotFile(file).auth.users[0][0], "user-1");
  });

  test("loads at start, and saves only when something changed", () => {
    populate();
    const file = path.join(dir, "db.json");
    saveSnapshotFile(file);
    authStore.resetForTesting();
    resetVaultsForTesting();

    const lines: string[] = [];
    const p = startFilePersistence(file, { intervalMs: 60_000, log: (l) => void lines.push(l) });
    try {
      assert.match(lines[0], /loaded .*db\.json: 1 account$/);
      assert.equal(vaultFor("user-1").getVaultItem("note-1")?.title, "SBI nomination");
      assert.equal(p.flush(), false, "nothing changed");

      vaultFor("user-1").simulatedElapsedDays = 100;
      assert.equal(p.flush(), true);
      assert.equal(JSON.parse(readFileSync(file, "utf8")).vaults[0].vault.simulatedElapsedDays, 100);
      assert.equal(p.flush(), false);
    } finally {
      p.stop();
    }
  });

  test("a file that does not exist yet is created on the first change", () => {
    const file = path.join(dir, "new.json");
    const lines: string[] = [];
    const p = startFilePersistence(file, { intervalMs: 60_000, log: (l) => void lines.push(l) });
    try {
      assert.match(lines[0], /does not exist yet/);
      assert.equal(p.flush(), false);
      assert.equal(existsSync(file), false);
      vaultFor("user-9");
      assert.equal(p.flush(), true);
      assert.equal(loadSnapshotFile(file).vaults[0].userId, "user-9");
    } finally {
      p.stop();
    }
  });

  test("a damaged file stops the start rather than starting empty", () => {
    const file = path.join(dir, "bad.json");
    writeFileSync(file, "{ not json");
    assert.throws(() => startFilePersistence(file, { log: () => {} }));
  });

  test("SIGTERM saves what changed since the last save, then exits", async () => {
    const file = path.join(dir, "stop.json");
    // A server: starts persisting, makes a change, says so, then idles.
    const server = `
      const { startFilePersistence } = require("./lib/persistence/snapshot");
      const { vaultFor } = require("./lib/state/mockDatabase");
      startFilePersistence(process.argv[1], { intervalMs: 60_000, log: () => {} });
      vaultFor("user-sigterm");
      console.log("ready");
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ["--require", "./tests/unit/setup.cjs", "-e", server, file], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "inherit"],
    });
    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.stdout!.on("data", (d: Buffer) => d.toString().includes("ready") && resolve());
    });
    assert.equal(existsSync(file), false, "nothing saved before the signal");
    const code = await new Promise<number | null>((resolve) => {
      child.on("exit", resolve);
      child.kill("SIGTERM");
    });
    assert.equal(code, 0);
    assert.deepEqual(loadSnapshotFile(file).vaults.map((v) => v.userId), ["user-sigterm"]);
  });
});
