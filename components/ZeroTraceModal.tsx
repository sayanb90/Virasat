"use client";

import React, { useEffect } from "react";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { DecryptedMemoryItem } from "@/lib/crypto/zeroTraceViewer";

/**
 * Shows a decrypted note to a Beneficiary.
 *
 * The plaintext lives only in this component's memory for as long as the
 * dialog is open — it is never written to storage, and closing the dialog
 * drops the reference.
 */
export function ZeroTraceModal({
  item,
  onClose,
}: {
  item: DecryptedMemoryItem | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="flex max-h-[88dvh] w-full max-w-[560px] flex-col rounded-t-[22px] bg-white sm:rounded-[22px]"
      >
        <div className="flex items-start gap-3 border-b border-[var(--border)] p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--text-faint)]">{item.category}</p>
            <h2 className="text-[24px] font-bold leading-snug text-[var(--text)]">{item.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="whitespace-pre-wrap text-[19px] leading-relaxed text-[var(--text)]">
            {item.textPayload || "This note has a title but no details."}
          </p>
        </div>

        <div className="border-t border-[var(--border)] p-5">
          <p className="mb-3 flex items-start gap-2 text-[15px] leading-relaxed text-[var(--text-faint)]">
            <Eye className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
            This note is only held in this window. Closing it leaves no copy behind.
          </p>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
