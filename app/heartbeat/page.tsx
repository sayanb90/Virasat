"use client";

import React, { useState, useEffect } from "react";
import { HeartPulse, Mail, CheckCircle2, AlertTriangle, ShieldCheck, Flame, Bell, Send } from "lucide-react";
import { HeartbeatTimeline } from "@/components/HeartbeatTimeline";
import { TimeMachineControl } from "@/components/TimeMachineControl";
import { PhaseInfo, EscalationNotification } from "@/lib/state/heartbeatMachine";

export default function HeartbeatPage() {
  const [heartbeatState, setHeartbeatState] = useState<{
    simulatedElapsedDays: number;
    phaseInfo: PhaseInfo;
    notifications: EscalationNotification[];
    lastCheckInDate: string;
  } | null>(null);

  const fetchHeartbeatState = async () => {
    try {
      const res = await fetch("/api/heartbeat");
      const data = await res.json();
      if (data.success) {
        setHeartbeatState(data);
      }
    } catch (err) {
      console.error("Fetch heartbeat error:", err);
    }
  };

  useEffect(() => {
    fetchHeartbeatState();
  }, []);

  const handleUpdateElapsedDays = (newElapsedDays: number) => {
    fetchHeartbeatState();
  };

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0E101B] border border-white/10 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/30 text-rose-400">
            <HeartPulse className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">1-Year Heartbeat & Escalation Control</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Automated Dead Man&apos;s Switch State Machine • Zero-Intrusion Silent Engine
            </p>
          </div>
        </div>

        {heartbeatState && (
          <div className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-gray-300">
            <span>Last Check-In: </span>
            <span className="text-emerald-400 font-bold">
              {new Date(heartbeatState.lastCheckInDate).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Heartbeat Timeline Component */}
      {heartbeatState && (
        <HeartbeatTimeline
          phaseInfo={heartbeatState.phaseInfo}
          elapsedDays={heartbeatState.simulatedElapsedDays}
        />
      )}

      {/* Time Machine Fast-Forward Simulator */}
      {heartbeatState && (
        <TimeMachineControl
          currentElapsedDays={heartbeatState.simulatedElapsedDays}
          onUpdate={handleUpdateElapsedDays}
        />
      )}

      {/* Transactional Email Dispatcher Log */}
      <div className="bg-[#0D0F18] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-sky-500/10 rounded-xl border border-sky-500/30 text-sky-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Escalation Notification Logs</h3>
              <p className="text-xs text-gray-400 font-mono">
                Transactional Email / SMS Dispatches (Resend API Integration Simulator)
              </p>
            </div>
          </div>

          <span className="px-3 py-1 bg-white/5 rounded-full text-xs font-mono text-gray-400 border border-white/10">
            {heartbeatState?.notifications?.length || 0} Alerts Dispatched
          </span>
        </div>

        {/* Notifications List */}
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {heartbeatState?.notifications?.length === 0 ? (
            <div className="py-8 text-center text-gray-500 font-mono text-xs space-y-2">
              <ShieldCheck className="w-8 h-8 text-emerald-400/60 mx-auto" />
              <p>Phase 0 (Silent Period): Zero emails sent during the first 9 months.</p>
              <p className="text-gray-600">Use the Time-Machine simulator above to advance to Month 9+.</p>
            </div>
          ) : (
            heartbeatState?.notifications.map((notif) => (
              <div
                key={notif.id}
                className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        notif.phase === 1
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                          : notif.phase === 2
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : notif.phase === 3
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                      }`}
                    >
                      {notif.phaseName}
                    </span>
                    <span className="font-bold text-white">{notif.title}</span>
                  </div>
                  <p className="text-gray-400 font-mono text-[11px]">{notif.previewText}</p>
                </div>

                <div className="text-right shrink-0 font-mono text-[11px] space-y-0.5">
                  <div className="text-gray-300">
                    {notif.channel}: {notif.recipient}
                  </div>
                  <div className="text-emerald-400 flex items-center justify-end space-x-1">
                    <Send className="w-3 h-3" />
                    <span>Day {notif.sentAtSimulatedDay} (Simulated)</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
