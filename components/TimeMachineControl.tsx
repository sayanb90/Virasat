"use client";

import React, { useState } from "react";
import { FastForward, Calendar, CheckCircle2, Zap } from "lucide-react";

interface TimeMachineControlProps {
  currentElapsedDays: number;
  onUpdate: (newElapsedDays: number) => void;
}

export function TimeMachineControl({ currentElapsedDays, onUpdate }: TimeMachineControlProps) {
  const [loading, setLoading] = useState(false);

  const handleSimulate = async (action: string, value?: number) => {
    setLoading(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          advanceDays: value,
          setToDay: value,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onUpdate(data.simulatedElapsedDays);
      }
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleHeartbeatCheckIn = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/heartbeat", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        onUpdate(0);
      }
    } catch (err) {
      console.error("Check-in error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#10121D] border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-6">
      {/* Header & Primary Check-In */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/30 text-amber-400">
            <Zap className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">Escalation Time-Machine Simulator</h3>
            <p className="text-xs text-gray-400">
              Fast-forward simulated time to test 1-year escalation triggers and email dispatches.
            </p>
          </div>
        </div>

        <button
          onClick={handleHeartbeatCheckIn}
          disabled={loading}
          className="flex items-center justify-center space-x-2 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-black text-xs rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer disabled:opacity-50 shrink-0"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>I AM ALIVE (Reset 365-Day Timer)</span>
        </button>
      </div>

      {/* Fast-Forward Preset Buttons Grid (Responsive 2-col on mobile / 3-col on desktop) */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-gray-300">
          Fast-Forward Simulator Presets:
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <button
            onClick={() => handleSimulate("advance", 30)}
            disabled={loading}
            className="p-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <FastForward className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white text-xs block">+30 Days</span>
              <span className="text-[10px] text-gray-400">Advance 1 Month</span>
            </div>
          </button>

          <button
            onClick={() => handleSimulate("set", 270)}
            disabled={loading}
            className="p-3.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-2xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-300">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sky-200 text-xs block">Month 9 (Day 270)</span>
              <span className="text-[10px] text-sky-300/80">Phase 1 Reminders</span>
            </div>
          </button>

          <button
            onClick={() => handleSimulate("set", 330)}
            disabled={loading}
            className="p-3.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-2xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-amber-200 text-xs block">Month 11 (Day 330)</span>
              <span className="text-[10px] text-amber-300/80">Phase 2 Escalation</span>
            </div>
          </button>

          <button
            onClick={() => handleSimulate("set", 345)}
            disabled={loading}
            className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-2xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-rose-200 text-xs block">Month 11.5 (Day 345)</span>
              <span className="text-[10px] text-rose-300/80">Phase 3 Countdown</span>
            </div>
          </button>

          <button
            onClick={() => handleSimulate("set", 365)}
            disabled={loading}
            className="p-3.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-2xl text-left transition-all cursor-pointer flex items-center space-x-3 sm:col-span-2 md:col-span-2"
          >
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-purple-200 text-xs block">Month 12+ (Day 365+)</span>
              <span className="text-[10px] text-purple-300/80">Phase 4 Release Chest Keys to Heirs</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
