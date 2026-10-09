"use client";

import React, { useRef, useState, useSyncExternalStore } from "react";
import { Download, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";
import { useVaultSession } from "@/lib/vault/VaultSession";
import { UnlockScreen } from "@/components/UnlockScreen";
import { fetchNotes } from "@/lib/vault/notes";
import {
  BackupFormatError,
  backupFileName,
  buildBackup,
  downloadBackup,
  forgetBackup,
  getHistoryServerSnapshot,
  getHistorySnapshot,
  parseBackup,
  recordBackup,
  subscribeHistory,
} from "@/lib/vault/backup";

export default function BackupPage() {
  const { masterKey } = useVaultSession();
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);

  // History lives in this browser only; the backup files themselves are
  // wherever the user chose to put them.

  const makeBackup = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const notes = await fetchNotes();
      const backup = buildBackup(notes);
      const fileName = backupFileName(new Date(backup.createdAt));
      downloadBackup(backup, fileName);

      recordBackup({
        id: `bk-${Date.now()}`,
        createdAt: backup.createdAt,
        noteCount: backup.noteCount,
        fileName,
      });
      setMessage(
        `Saved ${backup.noteCount} ${backup.noteCount === 1 ? "note" : "notes"} to ${fileName}.`
      );
    } catch (err) {
      console.error("Backup failed:", err);
      setError("We could not make a backup just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const backup = parseBackup(await file.text());

      let restored = 0;
      for (const note of backup.notes) {
        const res = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(note),
        });
        if (res.ok) restored += 1;
      }

      setMessage(
        `Restored ${restored} of ${backup.notes.length} ${
          backup.notes.length === 1 ? "note" : "notes"
        }. Open My notes to check them.`
      );
    } catch (err) {
      if (err instanceof BackupFormatError) {
        setError(err.message);
      } else {
        console.error("Restore failed:", err);
        setError("We could not read that backup. Please try another file.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!masterKey) return <UnlockScreen />;

  return (
    <div className="pb-12">
      <Eyebrow>Backup</Eyebrow>
      <PageTitle>Backup</PageTitle>

      <div className="mb-6 flex gap-3 rounded-[16px] bg-[var(--action-soft)] p-4">
        <ShieldCheck
          className="mt-[2px] h-6 w-6 shrink-0 text-[var(--action)]"
          aria-hidden="true"
        />
        <p className="text-[16px] leading-relaxed text-[var(--text)]">
          A backup file stays encrypted. Nothing is unscrambled to make it, so it is safe to keep
          on Google Drive, iCloud or a USB stick — and just as unreadable as it is here without
          your passphrase.
        </p>
      </div>

      <div className="space-y-3">
        <Button size="lg" onClick={makeBackup} disabled={busy}>
          <Download className="h-5 w-5" aria-hidden="true" />
          {busy ? "Working…" : "Make a new backup"}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          onClick={() => restoreInput.current?.click()}
          disabled={busy}
        >
          <Upload className="h-5 w-5" aria-hidden="true" />
          Restore from a backup file
        </Button>
        <input
          ref={restoreInput}
          type="file"
          accept="application/json,.json"
          onChange={restore}
          className="hidden"
        />
      </div>

      {message && (
        <p role="status" className="mt-4 text-[17px] text-[var(--success)]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[17px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <h2 className="mt-10 text-[22px] font-bold text-[var(--text)]">Backup history</h2>
      <p className="mt-2 text-[17px] leading-relaxed text-[var(--text-muted)]">
        Every backup you have made from this device. Removing one here only clears it from this
        list — we never touch the file itself, so delete it from your own drive if you no longer
        want it.
      </p>

      {history.length === 0 ? (
        <p className="mt-6 text-[17px] text-[var(--text-faint)]">
          You have not made a backup yet.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold text-[var(--text)]">
                  {entry.fileName}
                </p>
                <p className="text-[16px] text-[var(--text-muted)]">
                  {new Date(entry.createdAt).toLocaleString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {entry.noteCount} {entry.noteCount === 1 ? "note" : "notes"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => forgetBackup(entry.id)}
                aria-label={`Remove ${entry.fileName} from this list`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--danger)]"
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
