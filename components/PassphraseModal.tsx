"use client";

import React, { useState } from "react";
import { deriveMasterKey } from "@/lib/crypto/argon2";
import { Key, Lock, Eye, EyeOff, ShieldCheck, AlertTriangle } from "lucide-react";

interface PassphraseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyDerived: (key: CryptoKey) => void;
}

export function PassphraseModal({ isOpen, onClose, onKeyDerived }: PassphraseModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase || passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // In production, each user has their salt stored in mock DB. Default salt used for demo.
      const defaultSalt = "e4f81c90a1b2c3d4e5f6a7b8c9d0e1f2";
      const { key } = await deriveMasterKey(passphrase, defaultSalt);
      onKeyDerived(key);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to derive Master Key.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-[28px] max-w-md w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Unlock Master Key</h3>
            <p className="text-xs text-slate-500">
              Derive K_master via WebCrypto PBKDF2.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Master Vault Passphrase
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter your master passphrase..."
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Tip for testing: Type any 8+ character passphrase.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Zero-Knowledge: Your passphrase is never sent to our servers. Key derivation runs strictly in your local browser.</span>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-1/2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? "Deriving Key..." : "Unlock Vault"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
