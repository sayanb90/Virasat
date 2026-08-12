"use client";

import React, { useState } from "react";
import { ShieldCheck, Info, Lock, Key, Server } from "lucide-react";

export function SecurityBadge() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium hover:bg-emerald-500/20 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)]"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>ZERO-KNOWLEDGE VERIFIED</span>
        <Info className="w-3 h-3 text-emerald-400/70" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#12141C] border border-emerald-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-emerald-400">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Zero-Knowledge Security Specification</h3>
                <p className="text-xs text-emerald-400/80 font-mono">End-to-End Client-Side Cryptography</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-gray-300">
              <div className="flex items-start space-x-3 p-3 bg-white/5 rounded-xl border border-white/10">
                <Key className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Key Derivation (K_master):</span>
                  <p className="text-gray-400 mt-0.5">
                    Argon2id KDF derives Master Key locally using user passphrase + salt. K_master NEVER leaves client memory.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 bg-white/5 rounded-xl border border-white/10">
                <Lock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Payload Encryption (AES-256-GCM):</span>
                  <p className="text-gray-400 mt-0.5">
                    Every file/secret uses a unique Chest Key (K_chest). Ciphertext is encrypted client-side before transmission.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 bg-white/5 rounded-xl border border-white/10">
                <Server className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Server Blob Storage Contract:</span>
                  <p className="text-gray-400 mt-0.5">
                    The backend strictly stores encrypted base64 ciphertext blobs and RSA-4096 beneficiary envelopes E_ben(K_chest).
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-xl transition-all"
              >
                Close & Verify
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
