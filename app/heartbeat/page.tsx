"use client";

import React, { useState, useEffect } from "react";
import { HeartbeatTimeline } from "@/components/HeartbeatTimeline";
import { TimeMachineControl } from "@/components/TimeMachineControl";
import { EscalationLog } from "@/components/EscalationLog";
import { PhaseInfo, EscalationNotification } from "@/lib/state/heartbeatMachine";
import { HeartPulse, ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";

export default function HeartbeatPage() {
  const [data, setData] = useState<{
    simulatedElapsedDays: number;
    phaseInfo: PhaseInfo;
    notifications: EscalationNotification[];
    lastCheckInDate: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/heartbeat");
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error("Fetch state error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const handleUpdate = (newElapsedDays: number) => {
    fetchState();
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Info */}
      <div className="space-y-1">
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <HeartPulse className="w-6 h-6 text-emerald-600" />
          <span>Safety Status & Protection</span>
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Learn how Virasat monitors your safety and ensures your loved ones receive your estate when needed.
        </p>
      </div>

      {/* 1-Year Protection Timeline */}
      <HeartbeatTimeline
        phaseInfo={data.phaseInfo}
        elapsedDays={data.simulatedElapsedDays}
      />

      {/* Interactive Time Machine Tester */}
      <TimeMachineControl
        currentElapsedDays={data.simulatedElapsedDays}
        onUpdate={handleUpdate}
      />

      {/* Notifications & Dispatch Log */}
      <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-extrabold text-slate-900">
            Escalation Dispatch Log
          </h3>
          <span className="text-xs text-slate-500">
            {data.notifications.length} Total Dispatches
          </span>
        </div>

        {data.notifications.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="font-bold text-slate-800">Zero Notifications Dispatched</p>
            <p>Protection is currently in peaceful Phase 0. No alerts have been sent.</p>
          </div>
        ) : (
          <EscalationLog notifications={data.notifications} />
        )}
      </div>
    </div>
  );
}
