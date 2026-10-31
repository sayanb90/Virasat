/**
 * Virasat - Every store, saved to one JSON file and loaded back.
 *
 * Until the real database (the Runbook (Notion), blocker 1), this is how data
 * survives a restart: the accounts and sessions (lib/auth/store.ts), every
 * vault (lib/state/mockDatabase.ts), the email outbox and the billing ledger.
 * `npm run db:mock` writes one of these files; a server started with
 * DATA_FILE pointing at it loads it, and saves back as things change.
 *
 * Development and demos only: one process, one file, no concurrent writers.
 * The file holds what a database would: password hashes, wrapped keys and
 * ciphertext, never a password or a vault key. It is written owner-only and
 * kept out of git (/data).
 *
 * Left out on purpose: the per-network rate limits (they restart counting)
 * and anything only the tests read.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { authStore, type AuthSnapshot } from "../auth/store";
import { restoreVaults, snapshotVaults, type VaultSnapshot } from "../state/mockDatabase";
import { restoreOutbox, snapshotOutbox, type OutboxSnapshot } from "../email/outbox";
import { restoreLedger, snapshotLedger, type LedgerSnapshot } from "../billing/ledger";

export const SNAPSHOT_FORMAT = "virasat-dev-db";
export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: number;
  savedAt: string;
  auth: AuthSnapshot;
  vaults: Array<{ userId: string; vault: VaultSnapshot }>;
  outbox: OutboxSnapshot;
  ledger: LedgerSnapshot;
}

export function takeSnapshot(now: Date = new Date()): Snapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    savedAt: now.toISOString(),
    auth: authStore.toSnapshot(),
    vaults: snapshotVaults(),
    outbox: snapshotOutbox(),
    ledger: snapshotLedger(),
  };
}

/** Replaces everything in memory with the snapshot. */
export function restoreSnapshot(snap: Snapshot): void {
  if (snap?.format !== SNAPSHOT_FORMAT) throw new Error("This is not a Virasat data file.");
  if (snap.version !== SNAPSHOT_VERSION) {
    throw new Error(`This data file is version ${snap.version}; this build reads version ${SNAPSHOT_VERSION}.`);
  }
  authStore.restore(snap.auth);
  restoreVaults(snap.vaults);
  restoreOutbox(snap.outbox);
  restoreLedger(snap.ledger);
}

/** Writes atomically (a temporary file, then a rename), readable by the owner only. */
export function saveSnapshotFile(file: string, snap: Snapshot = takeSnapshot()): string {
  const json = JSON.stringify(snap);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, json, { mode: 0o600 });
  renameSync(tmp, file);
  return json;
}

export function loadSnapshotFile(file: string): Snapshot {
  return JSON.parse(readFileSync(file, "utf8")) as Snapshot;
}

export interface FilePersistence {
  /** Writes now if anything changed since the last write. */
  flush(): boolean;
  stop(): void;
}

/**
 * Loads `file` if it exists, then saves whenever the stores change: checked
 * every `intervalMs`, and once more when the process is asked to stop.
 */
export function startFilePersistence(
  file: string,
  { intervalMs = 2_000, log = console.info }: { intervalMs?: number; log?: (line: string) => void } = {}
): FilePersistence {
  if (existsSync(file)) {
    restoreSnapshot(loadSnapshotFile(file));
    const users = authStore.users.size;
    log(`[data] loaded ${file}: ${users} account${users === 1 ? "" : "s"}`);
  } else {
    log(`[data] ${file} does not exist yet; it will be created on the first change`);
  }

  // What is on disk, without its timestamp, so an unchanged store is not rewritten.
  const body = (snap: Snapshot) => JSON.stringify({ ...snap, savedAt: "" });
  let written = existsSync(file) ? body(loadSnapshotFile(file)) : body(takeSnapshot());

  const flush = () => {
    const snap = takeSnapshot();
    const now = body(snap);
    if (now === written) return false;
    saveSnapshotFile(file, snap);
    written = now;
    return true;
  };

  const timer = setInterval(flush, intervalMs);
  timer.unref();
  const onExit = () => {
    try {
      flush();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGTERM", onExit);
  process.once("SIGINT", onExit);

  return {
    flush,
    stop() {
      clearInterval(timer);
      process.removeListener("SIGTERM", onExit);
      process.removeListener("SIGINT", onExit);
    },
  };
}
