"use client";

import React, { useState, useEffect } from "react";
import { AuditLogRecord } from "@/lib/state/mockDatabase";
import { ShieldCheck, CheckCircle2, Key, Lock, Eye } from "lucide-react";

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Fetch audit error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionIcon = (action: string) => {
    switch (action) {
      case "HEARTBEAT_CHECKIN":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case "VAULT_ITEM_DECRYPT":
        return <Eye className="w-4 h-4 text-sky-600" />;
      case "VAULT_ITEM_ENCRYPT":
      case "VAULT_ITEM_ADD":
        return <Lock className="w-4 h-4 text-indigo-600" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
          <span>Security & Activity Log</span>
        </h2>
        <p className="text-xs text-slate-500">
          A clear record of safety check-ins and vault access.
        </p>
      </div>

      {/* Safety Summary Banner */}
      <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center space-x-3 text-xs text-emerald-900">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
        <span>
          <strong>Zero-Knowledge Security:</strong> Only you have the keys to view contents. Activity records confirm that your vault is intact.
        </span>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-3xl p-6">
            No activity records yet.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start space-x-3.5"
            >
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 shrink-0">
                {getActionIcon(log.action)}
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs">{log.details}</h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                  <span className="font-mono">{log.ipAddress}</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">{log.category}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
