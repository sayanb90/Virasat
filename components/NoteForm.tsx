"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { Breadcrumb } from "@/components/ui/Page";
import { saveNote, type NoteDraft } from "@/lib/vault/notes";
import type { BeneficiaryRecord } from "@/lib/state/mockDatabase";

export interface NoteFormProps {
  mode: "create" | "edit";
  groupLabel: string;
  subcategoryLabel: string;
  subcategoryId: string;
  masterKey: CryptoKey;
  beneficiaries: BeneficiaryRecord[];
  noteId?: string;
  initialTitle?: string;
  initialBody?: string;
  initialFileName?: string;
  initialBeneficiaryId?: string;
  onCancel: () => void;
  onSaved: (noteId: string) => void;
}

export function NoteForm({
  mode,
  groupLabel,
  subcategoryLabel,
  subcategoryId,
  masterKey,
  beneficiaries,
  noteId,
  initialTitle = "",
  initialBody = "",
  initialFileName,
  initialBeneficiaryId,
  onCancel,
  onSaved,
}: NoteFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [attachment, setAttachment] = useState<{ buffer: ArrayBuffer; name: string; mimeType: string } | null>(null);
  const [keptFileName, setKeptFileName] = useState(initialFileName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Notes go to the primary Beneficiary without asking. The chooser only
  // appears once a second Beneficiary exists, so the common case stays a
  // two-field form and the capability is there when it is actually needed.
  const [beneficiaryId, setBeneficiaryId] = useState(
    initialBeneficiaryId ?? beneficiaries[0]?.id ?? ""
  );
  const canChooseRecipient = beneficiaries.length > 1;

  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachment({
      buffer: await file.arrayBuffer(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
    });
    setKeptFileName(undefined);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Please give this note a title so your family can find it.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const draft: NoteDraft = {
        ...(noteId ? { id: noteId } : {}),
        title: title.trim(),
        subcategoryId,
        body,
        beneficiaryId: beneficiaryId || beneficiaries[0]?.id,
        file: attachment,
      };
      const saved = await saveNote(draft, masterKey, beneficiaries);
      onSaved(saved.id);
      router.refresh();
    } catch (err) {
      console.error("Save failed:", err);
      setError("We could not save this note. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const attachedLabel = attachment?.name ?? keptFileName;

  return (
    <div className="flex flex-1 flex-col pb-4">
      <div className="flex-1">
        <Breadcrumb parent={{ label: groupLabel, href: "/notes" }} current={subcategoryLabel} />

        <h1 className="mb-6 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--text)]">
          {mode === "create" ? "New note" : "Edit note"}
        </h1>

        <div className="space-y-4">
          <ReadOnlyField label="Category" value={subcategoryLabel} />

          {canChooseRecipient && (
            <div className="rounded-[14px] border border-[var(--border-strong)] bg-white px-4 py-3 focus-within:border-[var(--action)]">
              <label
                htmlFor="note-recipient"
                className="block text-[15px] font-semibold text-[var(--action)]"
              >
                Who should receive this?
              </label>
              <select
                id="note-recipient"
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
                className="min-h-[40px] w-full bg-transparent pt-1 pr-6 text-[19px] text-[var(--text)] outline-none"
              >
                {beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.relationship ? `${b.name} — ${b.relationship}` : b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-[14px] border border-[var(--border-strong)] bg-white px-4 py-3 focus-within:border-[var(--action)]">
            <label htmlFor="note-title" className="block text-[15px] font-semibold text-[var(--action)]">
              Title
            </label>
            <input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="For example, your insurer's name"
              className="w-full bg-transparent pt-1 text-[19px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
          </div>

          <div className="rounded-[14px] border border-[var(--border-strong)] bg-white px-4 py-3 focus-within:border-[var(--action)]">
            <label htmlFor="note-body" className="block text-[15px] font-semibold text-[var(--action)]">
              Add note
            </label>
            <textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder="Write anything your family will need to know."
              className="w-full resize-y bg-transparent pt-1 text-[19px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
          </div>

          <div>
            <p className="mb-2.5 text-[15px] font-semibold text-[var(--text-faint)]">Attachments</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => photoInput.current?.click()}>
                <Camera className="h-5 w-5" aria-hidden="true" />
                Take photo
              </Button>
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <Paperclip className="h-5 w-5" aria-hidden="true" />
                Attach file
              </Button>
            </div>

            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              className="hidden"
            />
            <input ref={fileInput} type="file" onChange={handleFile} className="hidden" />

            {attachedLabel && (
              <div className="mt-3 flex items-center gap-3 rounded-[12px] bg-[var(--surface-sunken)] px-4 py-3">
                <Paperclip className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[17px] text-[var(--text)]">
                  {attachedLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    setKeptFileName(undefined);
                  }}
                  aria-label={`Remove attachment ${attachedLabel}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-white hover:text-[var(--danger)]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[16px] text-[var(--danger)]">
              {error}
            </p>
          )}

          <p className="pt-1 text-[15px] leading-relaxed text-[var(--text-faint)]">
            This note is encrypted on your device before it is saved. Nobody at Virasat can read it.
          </p>
        </div>
      </div>

      <BottomBar>
        <Button variant="quiet" onClick={onCancel} disabled={saving} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? "Saving…" : "Save"}
        </Button>
      </BottomBar>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3">
      <p className="text-[15px] font-semibold text-[var(--action)]">{label}</p>
      <p className="pt-1 text-[19px] text-[var(--text)]">{value}</p>
    </div>
  );
}
