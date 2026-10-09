/**
 * Backup export and restore.
 *
 * Notes are already stored as AES-256-GCM ciphertext with their IV and the
 * sealed beneficiary envelope, so a backup is simply those records written to
 * a file. Nothing is decrypted to produce it, which means the file is as safe
 * on Google Drive or iCloud as it is here — and equally unreadable without
 * the passphrase.
 */

import type { VaultItemRecord } from "@/lib/state/mockDatabase";

export const BACKUP_FORMAT = "virasat-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  noteCount: number;
  notes: VaultItemRecord[];
}

export interface BackupHistoryEntry {
  id: string;
  createdAt: string;
  noteCount: number;
  fileName: string;
}

const HISTORY_KEY = "virasat.backups";
const EMPTY_HISTORY: BackupHistoryEntry[] = [];

/**
 * History is exposed as an external store so the page can read it with
 * useSyncExternalStore instead of an effect. getSnapshot must be
 * referentially stable between changes or useSyncExternalStore loops.
 */
let cache: BackupHistoryEntry[] = EMPTY_HISTORY;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();

export function subscribeHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getHistorySnapshot(): BackupHistoryEntry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(HISTORY_KEY);
  } catch {
    return EMPTY_HISTORY;
  }
  if (raw === cacheRaw) return cache;

  cacheRaw = raw;
  if (!raw) {
    cache = EMPTY_HISTORY;
    return cache;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    cache = Array.isArray(parsed) ? (parsed as BackupHistoryEntry[]) : EMPTY_HISTORY;
  } catch {
    cache = EMPTY_HISTORY;
  }
  return cache;
}

export function getHistoryServerSnapshot(): BackupHistoryEntry[] {
  return EMPTY_HISTORY;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function buildBackup(notes: VaultItemRecord[]): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    noteCount: notes.length,
    notes,
  };
}

export function backupFileName(when: Date = new Date()): string {
  const stamp = when.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `virasat-backup-${stamp}.json`;
}

/** Triggers a download without ever sending the file anywhere. */
export function downloadBackup(backup: BackupFile, fileName: string): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export class BackupFormatError extends Error {}

export function parseBackup(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupFormatError("That file is not a Virasat backup.");
  }

  const candidate = parsed as Partial<BackupFile>;
  if (candidate?.format !== BACKUP_FORMAT || !Array.isArray(candidate.notes)) {
    throw new BackupFormatError("That file is not a Virasat backup.");
  }
  if (typeof candidate.version !== "number" || candidate.version > BACKUP_VERSION) {
    throw new BackupFormatError(
      "That backup was made by a newer version of Virasat. Please update the app first."
    );
  }

  return {
    format: BACKUP_FORMAT,
    version: candidate.version,
    createdAt: candidate.createdAt ?? new Date().toISOString(),
    noteCount: candidate.notes.length,
    notes: candidate.notes as VaultItemRecord[],
  };
}

export function readHistory(): BackupHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BackupHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordBackup(entry: BackupHistoryEntry): void {
  const next = [entry, ...readHistory()].slice(0, 20);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the file still downloaded, only the log is lost */
  }
  notify();
}

export function forgetBackup(id: string): void {
  const next = readHistory().filter((e) => e.id !== id);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  notify();
}
