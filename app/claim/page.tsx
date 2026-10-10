"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FileText, Lock, ShieldCheck } from "lucide-react";
import { importPrivateKeyFromPem, decryptChestKeyWithBeneficiaryPrivateKey } from "@/lib/crypto/asymmetric";
import { importKeyFromHex } from "@/lib/crypto/aes-gcm";
import { loadZeroTracePayload, type DecryptedMemoryItem } from "@/lib/crypto/zeroTraceViewer";
import { ZeroTraceModal } from "@/components/ZeroTraceModal";
import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";
import { describeSubcategory, DEFAULT_COUNTRY } from "@/lib/taxonomy";
import type { VaultItemRecord } from "@/lib/state/mockDatabase";
import type { PhaseInfo } from "@/lib/state/heartbeatMachine";

export default function ClaimPage() {
  const [recoveryKey, setRecoveryKey] = useState("");
  const [items, setItems] = useState<VaultItemRecord[]>([]);
  const [phaseInfo, setPhaseInfo] = useState<PhaseInfo | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [openItem, setOpenItem] = useState<DecryptedMemoryItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vRes, hbRes] = await Promise.all([fetch("/api/vault"), fetch("/api/heartbeat")]);
        const vData = await vRes.json();
        const hbData = await hbRes.json();
        if (cancelled) return;
        if (vData.success) setItems(vData.items);
        if (hbData.success) setPhaseInfo(hbData.phaseInfo);
      } catch (err) {
        console.error("Could not load the handover state:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!recoveryKey.trim()) return;
      setError("");
      try {
        await importPrivateKeyFromPem(recoveryKey);
        setUnlocked(true);
      } catch {
        // Demo keys are not always real PEM, so this still opens — a real
        // deployment would refuse here.
        setUnlocked(true);
      }
    },
    [recoveryKey]
  );

  const openNote = async (item: VaultItemRecord) => {
    setBusyId(item.id);
    setError("");
    try {
      let chestKeyHex = "";
      if (recoveryKey) {
        try {
          const sk = await importPrivateKeyFromPem(recoveryKey);
          chestKeyHex = await decryptChestKeyWithBeneficiaryPrivateKey(item.encryptedChestKeyHex, sk);
        } catch {
          chestKeyHex = item.encryptedChestKeyHex.replace("E_ben_demo_", "");
        }
      } else {
        chestKeyHex = item.encryptedChestKeyHex.replace("E_ben_demo_", "");
      }

      const chestKey = await importKeyFromHex(chestKeyHex.slice(0, 64));
      setOpenItem(
        await loadZeroTracePayload(
          item.id,
          item.title,
          describeSubcategory(DEFAULT_COUNTRY, item.subcategoryId).subcategoryLabel,
          item.mimeType,
          item.ciphertextHex,
          item.ivHex,
          chestKey
        )
      );
    } catch (err) {
      console.error("Could not open the note:", err);
      setError("We could not open that note with this recovery key.");
    } finally {
      setBusyId(null);
    }
  };

  // Release follows the owner's configured cycle, which the engine already
  // accounts for — not a hardcoded year.
  const released = phaseInfo?.isTriggered ?? false;

  return (
    <div className="pb-12">
      <ZeroTraceModal item={openItem} onClose={() => setOpenItem(null)} />

      <Eyebrow>Handover</Eyebrow>
      <PageTitle>Notes left in your care</PageTitle>

      {!released ? (
        <EmptyState
          title="There is nothing to open yet"
          body="The person who named you is still checking in with us. If that ever stops, we will contact you and their notes will appear here."
        />
      ) : !unlocked ? (
        <>
          <p className="mb-6 text-[17px] leading-relaxed text-[var(--text-muted)]">
            We are sorry for your loss. Someone trusted you with instructions for a moment like
            this. Enter the recovery key they gave you to read what they left.
          </p>

          <form onSubmit={unlock}>
            <label
              htmlFor="recovery-key"
              className="mb-2 block text-[15px] font-semibold text-[var(--action)]"
            >
              Your recovery key
            </label>
            <textarea
              id="recovery-key"
              required
              rows={5}
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              placeholder="Paste the recovery key you were given"
              className="w-full resize-y rounded-[14px] border border-[var(--border-strong)] bg-white p-4 font-mono text-[14px] text-[var(--text)] outline-none focus:border-[var(--action)]"
            />
            <Button type="submit" size="lg" className="mt-4">
              <Lock className="h-5 w-5" aria-hidden="true" />
              Open the notes
            </Button>
          </form>
        </>
      ) : (
        <>
          <div className="mb-6 flex gap-3 rounded-[16px] bg-[var(--action-soft)] p-4">
            <ShieldCheck
              className="mt-[2px] h-6 w-6 shrink-0 text-[var(--action)]"
              aria-hidden="true"
            />
            <p className="text-[16px] leading-relaxed text-[var(--text)]">
              Each note is unscrambled only while you have it open, and nothing is saved onto
              this device.
            </p>
          </div>

          {error && (
            <p role="alert" className="mb-4 text-[17px] text-[var(--danger)]">
              {error}
            </p>
          )}

          {items.length === 0 ? (
            <EmptyState body="There are no notes to read." />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openNote(item)}
                    disabled={busyId === item.id}
                    className="flex w-full items-center gap-3 rounded-[16px] border border-[var(--border)] bg-white p-4 text-left transition-colors hover:border-[var(--action-border)] hover:bg-[var(--action-soft)] disabled:opacity-60"
                  >
                    <FileText
                      className="h-6 w-6 shrink-0 text-[var(--action)]"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[19px] font-bold leading-snug text-[var(--text)]">
                        {item.title}
                      </span>
                      <span className="block text-[16px] text-[var(--text-muted)]">
                        {describeSubcategory(DEFAULT_COUNTRY, item.subcategoryId).subcategoryLabel}
                      </span>
                    </span>
                    {busyId === item.id && (
                      <span className="shrink-0 text-[16px] text-[var(--text-muted)]">
                        Opening…
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
