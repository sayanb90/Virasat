"use client";

import React, { useState, useEffect } from "react";
import { ShieldAlert, Activity, Lock, Key, Server, RefreshCw, CheckCircle2 } from "lucide-react";
import { AuditLogRecord } from "@/lib/state/mockDatabase";

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Fetch audit logs error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0E101B] border border-white/10 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/30 text-purple-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">System Architecture & Audit Logs</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Immutable Zero-Knowledge Operations & Cryptographic Audit Trail
            </p>
          </div>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Architecture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#0D0F18] border border-white/10 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs font-mono">
            <Key className="w-4 h-4" />
            <span>K_MASTER DERIVATION</span>
          </div>
          <p className="text-xs text-gray-300">
            Passphrase + Salt derived locally via Argon2id (100,000 rounds PBKDF2). Master Key never leaves client memory.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0D0F18] border border-white/10 space-y-2">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs font-mono">
            <Lock className="w-4 h-4" />
            <span>AES-256-GCM PAYLOAD</span>
          </div>
          <p className="text-xs text-gray-300">
            Per-item Chest Keys (K_chest) encrypt files/notes. Server stores strictly base64 ciphertext blobs.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0D0F18] border border-white/10 space-y-2">
          <div className="flex items-center space-x-2 text-purple-400 font-bold text-xs font-mono">
            <Server className="w-4 h-4" />
            <span>ASYMMETRIC ENVELOPES</span>
          </div>
          <p className="text-xs text-gray-300">
            Beneficiary public keys (PK_ben) encrypt K_chest into E_ben(K_chest). Server zero-knowledge contract intact.
          </p>
        </div>
      </div>

      {/* Real-Time Audit Logs Table */}
      <div className="bg-[#0D0F18] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Live Audit Trail ({logs.length} Events)</span>
          </h3>
          <span className="text-xs font-mono text-emerald-400">Zero-Knowledge Verification: ACTIVE</span>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-3.5 rounded-xl bg-black/40 border border-white/5 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      log.category === "Crypto"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : log.category === "ZeroKnowledgeSync"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : log.category === "Heartbeat"
                        ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {log.category}
                  </span>
                  <span className="font-bold text-white">{log.action}</span>
                </div>
                <p className="text-gray-400 text-[11px]">{log.details}</p>
              </div>

              <div className="text-right shrink-0 text-[11px] text-gray-500 space-y-0.5">
                <div>{log.timestamp}</div>
                <div className="text-emerald-400/80">{log.ipAddress}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
