"use client";

import React, { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Paperclip, Trash2 } from "lucide-react";
import { useLocale } from "@/lib/locale/LocaleProvider";
import { locateSubcategory } from "@/lib/taxonomy";
import { useVaultSession } from "@/lib/vault/VaultSession";
import { UnlockScreen } from "@/components/UnlockScreen";
import { NoteForm } from "@/components/NoteForm";
import { Breadcrumb, EmptyState } from "@/components/ui/Page";
import { Button, ButtonLink } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { decryptNoteBody, deleteNote, fetchBeneficiaries, fetchNotes } from "@/lib/vault/notes";
import type { BeneficiaryRecord, VaultItemRecord } from "@/lib/state/mockDatabase";

export default function NotePage({
  params,
}: {
  params: Promise<{ subcategoryId: string; noteId: string }>;
}) {
  const { subcategoryId, noteId } = use(params);
  const router = useRouter();
  const { taxonomy, ready } = useLocale();
  const { masterKey } = useVaultSession();

  const [note, setNote] = useState<VaultItemRecord | null>(null);
  const [body, setBody] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Bumping this re-runs the fetch effect (used after an edit is saved).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!masterKey) return;
    let cancelled = false;

    (async () => {
      try {
        const all = await fetchNotes();
        if (cancelled) return;

        const found = all.find((n) => n.id === noteId) ?? null;
        setNote(found);

        if (found) {
          try {
            const decrypted = await decryptNoteBody(found, masterKey);
            if (cancelled) return;
            setBody(decrypted.body);
            setFileName(decrypted.fileName);
          } catch {
            if (!cancelled) setError("We could not open this note with your current passphrase.");
          }
        }
      } catch (err) {
        console.error("Could not load note:", err);
        if (!cancelled) setError("We could not load this note.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [masterKey, noteId, reloadToken]);

  useEffect(() => {
    fetchBeneficiaries().then(setBeneficiaries).catch(() => setBeneficiaries([]));
  }, []);

  const location = locateSubcategory(taxonomy, subcategoryId);

  const handleDelete = async () => {
    if (!note) return;
    const ok = window.confirm(
      `Delete "${note.title}"? Your family will no longer receive this note. This cannot be undone.`
    );
    if (!ok) return;

    try {
      await deleteNote(note.id);
      router.replace(`/notes/${subcategoryId}`);
    } catch (err) {
      console.error("Delete failed:", err);
      setError("We could not delete this note. Please try again.");
    }
  };

  if (!masterKey) return <UnlockScreen />;
  if (!ready) return null;

  if (loading) {
    return <p className="py-14 text-center text-[17px] text-[var(--text-muted)]">Opening your note…</p>;
  }

  if (!note || !location) {
    return (
      <EmptyState
        title="We could not find that note"
        body="It may have been deleted, or the link may be out of date."
        action={<ButtonLink href="/notes" size="lg">Back to categories</ButtonLink>}
      />
    );
  }

  if (editing) {
    return (
      <NoteForm
        mode="edit"
        groupLabel={location.group.label}
        subcategoryLabel={location.subcategory.label}
        subcategoryId={subcategoryId}
        masterKey={masterKey}
        beneficiaries={beneficiaries}
        noteId={note.id}
        initialTitle={note.title}
        initialBody={body}
        initialFileName={fileName}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setLoading(true);
          setReloadToken((n) => n + 1);
        }}
      />
    );
  }

  const updated = new Date(note.updatedAt);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
        <Breadcrumb parent={{ label: location.group.label, href: "/notes" }} current={location.subcategory.label} />

        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--text)]">
          {note.title}
        </h1>

        <p className="mt-2 flex items-center gap-2 text-[16px] text-[var(--text-faint)]">
          <Calendar className="h-[18px] w-[18px]" aria-hidden="true" />
          <time dateTime={note.updatedAt}>
            {updated.toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </p>

        {error && (
          <p role="alert" className="mt-4 text-[16px] text-[var(--danger)]">
            {error}
          </p>
        )}

        {body.trim() ? (
          <p className="mt-6 whitespace-pre-wrap text-[19px] leading-relaxed text-[var(--text)]">
            {body}
          </p>
        ) : (
          <p className="mt-6 text-[17px] italic text-[var(--text-faint)]">
            This note has a title but no details yet.
          </p>
        )}

        {fileName && (
          <div className="mt-6 flex items-center gap-3 rounded-[12px] bg-[var(--surface-sunken)] px-4 py-3">
            <Paperclip className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[17px] text-[var(--text)]">{fileName}</span>
          </div>
        )}

        <div className="mt-10">
          <Button variant="danger" onClick={handleDelete}>
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            Delete this note
          </Button>
        </div>
      </div>

      <BottomBar>
        <ButtonLink href={`/notes/${subcategoryId}/new`} variant="quiet" className="flex-1">
          New note
        </ButtonLink>
        <Button onClick={() => setEditing(true)} className="flex-1">
          Edit
        </Button>
      </BottomBar>
    </div>
  );
}
