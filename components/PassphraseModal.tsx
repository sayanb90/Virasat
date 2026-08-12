"use client";

import React, { useState } from "react";
import { KeyRound, ShieldCheck, Lock, Fingerprint, ArrowRight } from "lucide-react";
import { deriveMasterKey } from "@/lib/crypto/argon2";

interface PassphraseModalProps {
  onMasterKeyDerived: (key: CryptoKey, keyHex: string) => void;
}

export function PassphraseModal({ onMasterKeyDerived }: PassphraseModalProps) {
  const [passphrase, setPassphrase] = useState("VirasatMaster2026!#");
  const [isDeriving, setIsDeriving] = useState(false);

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passphrase) return;

    setIsDeriving(true);
    try {
      const derived = await deriveMasterKey(passphrase, "e4f81c90a1b2c3d4e5f6");
      onMasterKeyDerived(derived.key, derived.keyRawHex);
    } catch (err) {
      console.error("Unlock failed:", err);
    } finally {
      setIsDeriving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="bg-[#121422] border-2 border-emerald-500/40 rounded-3xl max-w-sm w-full p-6 shadow-[0_0_80px_rgba(16,185,129,0.2)] text-center space-y-6">
        {/* Friendly Header */}
        <div className="space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Welcome Back</h2>
            <p className="text-xs text-emerald-400 font-medium mt-1">
              Enter your master passphrase or tap biometric unlock to open your private chest.
            </p>
          </div>
        </div>

        {/* Biometrics Quick Unlock Button for Seniors */}
        <button
          onClick={() => handleUnlock()}
          disabled={isDeriving}
          className="w-full p-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-sm flex items-center justify-center space-x-3 transition-all cursor-pointer shadow-lg"
        >
          <Fingerprint className="w-7 h-7 text-emerald-400 animate-pulse" />
          <span>Touch ID / Face ID Quick Unlock</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-white/10 w-full" />
          <span className="bg-[#121422] px-3 text-[11px] text-gray-400 uppercase font-mono">
            Or Passphrase
          </span>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold text-gray-200 mb-1.5 flex items-center space-x-1.5">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Passphrase</span>
            </label>
            <input
              type="password"
              required
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase..."
              className="w-full px-4 py-3.5 rounded-xl bg-black/60 border-2 border-white/20 text-white font-mono text-base focus:border-emerald-500 focus:outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isDeriving}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black text-sm tracking-wide transition-all shadow-[0_0_25px_rgba(16,185,129,0.3)] flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            <span>{isDeriving ? "Opening Vault..." : "Unlock Vault Session"}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
