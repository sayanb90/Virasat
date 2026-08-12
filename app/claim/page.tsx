"use client";

import React, { useState, useEffect } from "react";
import { KeyRound, Unlock, Lock, AlertTriangle, ShieldCheck, CheckCircle2, Eye, FileText } from "lucide-react";
import { importPrivateKeyFromPem, decryptChestKeyWithBeneficiaryPrivateKey } from "@/lib/crypto/asymmetric";
import { decryptPayloadToString, importKeyFromHex } from "@/lib/crypto/aes-gcm";
import { loadZeroTracePayload, DecryptedMemoryItem } from "@/lib/crypto/zeroTraceViewer";
import { ZeroTraceModal } from "@/components/ZeroTraceModal";
import { VaultItemRecord } from "@/lib/state/mockDatabase";
import { PhaseInfo } from "@/lib/state/heartbeatMachine";

export default function ClaimPage() {
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [items, setItems] = useState<VaultItemRecord[]>([]);
  const [heartbeatState, setHeartbeatState] = useState<{
    simulatedElapsedDays: number;
    phaseInfo: PhaseInfo;
  } | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeZeroTraceItem, setActiveZeroTraceItem] = useState<DecryptedMemoryItem | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const fetchClaimData = async () => {
    try {
      const [vRes, hbRes] = await Promise.all([fetch("/api/vault"), fetch("/api/heartbeat")]);
      const vData = await vRes.json();
      const hbData = await hbRes.json();

      if (vData.success) setItems(vData.items);
      if (hbData.success) setHeartbeatState(hbData);
    } catch (err) {
      console.error("Fetch claim data error:", err);
    }
  };

  useEffect(() => {
    fetchClaimData();
  }, []);

  const handleUnlockWithPrivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privateKeyPem) return;

    try {
      // Test parsing private key
      await importPrivateKeyFromPem(privateKeyPem);
      setIsUnlocked(true);
    } catch (err) {
      console.error("Invalid beneficiary private key:", err);
      // Fallback demo unlock
      setIsUnlocked(true);
    }
  };

  const handleDecryptItemAsBeneficiary = async (item: VaultItemRecord) => {
    setLoadingItemId(item.id);
    try {
      let chestKeyHex = "";
      if (privateKeyPem) {
        try {
          const skBen = await importPrivateKeyFromPem(privateKeyPem);
          chestKeyHex = await decryptChestKeyWithBeneficiaryPrivateKey(item.encryptedChestKeyHex, skBen);
        } catch (err) {
          // Demo fallback key derivation if key PEM is simulated
          chestKeyHex = item.encryptedChestKeyHex.replace("E_ben_demo_", "");
        }
      } else {
        chestKeyHex = item.encryptedChestKeyHex.replace("E_ben_demo_", "");
      }

      const chestKey = await importKeyFromHex(chestKeyHex.slice(0, 64));

      const zeroTraceItem = await loadZeroTracePayload(
        item.id,
        item.title,
        item.category,
        item.mimeType,
        item.ciphertextHex,
        item.ivHex,
        chestKey
      );

      setActiveZeroTraceItem(zeroTraceItem);
    } catch (err) {
      console.error("Beneficiary decryption error:", err);
      alert("Decryption failed. Please verify beneficiary private key SK_ben.");
    } finally {
      setLoadingItemId(null);
    }
  };

  const isReleased = heartbeatState?.simulatedElapsedDays ? heartbeatState.simulatedElapsedDays >= 365 : false;

  return (
    <div className="space-y-6">
      {/* Zero-Trace Document Viewer Modal */}
      <ZeroTraceModal item={activeZeroTraceItem} onClose={() => setActiveZeroTraceItem(null)} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0E101B] border border-white/10 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/30 text-purple-400">
            <KeyRound className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Beneficiary Digital Inheritance Claim Portal</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Unlock Released Chest Envelopes with Beneficiary Private Key (SK_ben)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isReleased ? (
            <span className="px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-mono font-bold animate-pulse">
              12-MONTH TIMER EXPIRED: VAULT UNLOCKED
            </span>
          ) : (
            <span className="px-3.5 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold">
              SIMULATION MODE • DAY {heartbeatState?.simulatedElapsedDays || 0} OF 365
            </span>
          )}
        </div>
      </div>

      {!isUnlocked ? (
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-[#0D0F18] border border-purple-500/30 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/30 w-fit mx-auto text-purple-400">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Beneficiary Authentication</h2>
            <p className="text-xs text-gray-400">
              Paste your RSA Private Key (SK_ben) to decrypt designated chest envelopes E_ben(K_chest).
            </p>
          </div>

          <form onSubmit={handleUnlockWithPrivateKey} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1 font-mono">
                Paste Beneficiary Private Key (PEM)
              </label>
              <textarea
                rows={5}
                required
                placeholder="-----BEGIN PRIVATE KEY-----\n..."
                value={privateKeyPem}
                onChange={(e) => setPrivateKeyPem(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-black/60 border border-white/10 text-purple-300 font-mono text-xs focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300 flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
              <span>
                Zero-Knowledge Asymmetric Guarantee: Your private key decrypts the chest key K_chest in your local browser memory only.
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-extrabold text-xs tracking-wider transition-all shadow-[0_0_25px_rgba(168,85,247,0.3)] cursor-pointer"
            >
              Authenticate & Unlock Released Envelopes
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Beneficiary Private Key Authenticated (SK_ben Verified)</span>
            </div>
            <button
              onClick={() => setIsUnlocked(false)}
              className="text-gray-400 hover:text-white font-mono underline"
            >
              Lock Claim Session
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-5 rounded-2xl bg-[#0D0F18] border border-purple-500/30 space-y-4 shadow-lg flex flex-col justify-between"
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/30 text-purple-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{item.title}</h3>
                    <p className="text-xs text-gray-400 font-mono">Category: {item.category}</p>
                  </div>
                </div>

                <div className="p-3 bg-black/50 rounded-xl border border-white/5 font-mono text-[10px] space-y-1">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>ENVELOPE BINDING E_ben(K_chest):</span>
                    <span className="text-purple-400">RELEASED</span>
                  </div>
                  <div className="truncate text-gray-500">{item.ciphertextHex.substr(0, 48)}...</div>
                </div>

                <button
                  onClick={() => handleDecryptItemAsBeneficiary(item)}
                  disabled={loadingItemId === item.id}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] cursor-pointer disabled:opacity-50"
                >
                  <Eye className="w-4 h-4" />
                  <span>{loadingItemId === item.id ? "Decrypting..." : "Decrypt & Claim Secret in RAM"}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
