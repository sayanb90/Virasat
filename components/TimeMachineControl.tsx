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
    <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="space-y-1 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-amber-600" />
          <h3 className="text-sm font-extrabold text-slate-900">
            Testing & Simulation Mode
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Fast-forward simulated time to test how Virasat handles 9 months of silence and estate transfer.
        </p>
      </div>

      {/* Primary Reset Action */}
      <button
        onClick={handleHeartbeatCheckIn}
        disabled={loading}
        className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
      >
        <CheckCircle2 className="w-4 h-4" />
        <span>Confirm Safety & Reset Timer to Day 0</span>
      </button>

      {/* Simulator Actions List (Clean Vertical Stack with Zero Overflow) */}
      <div className="space-y-2.5">
        <label className="block text-xs font-bold text-slate-700">
          Fast-Forward Time Simulator:
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={() => handleSimulate("advance", 30)}
            disabled={loading}
            className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2 rounded-lg bg-sky-100 text-sky-700 shrink-0">
              <FastForward className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-xs block">+30 Days</span>
              <span className="text-[10px] text-slate-500">Advance 1 Month</span>
            </div>
          </button>

          <button
            onClick={() => handleSimulate("set", 270)}
            disabled={loading}
            className="p-3 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2 rounded-lg bg-sky-200 text-sky-800 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sky-950 text-xs block">Month 9 (Day 270)</span>
              <span className="text-[10px] text-sky-700">Phase 1 Reminders</span>
            </div>
          </button>

          <button
            onClick={() => handleSimulate("set", 330)}
            disabled={loading}
            className="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2 rounded-lg bg-amber-200 text-amber-800 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-amber-950 text-xs block">Month 11 (Day 330)</span>
              <span className="text-[10px] text-amber-700">Phase 2 Escalation</span>
            </div>
          </button>

          <button
            onClick={() => handleSimulate("set", 365)}
            disabled={loading}
            className="p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-left transition-all cursor-pointer flex items-center space-x-3"
          >
            <div className="p-2 rounded-lg bg-purple-200 text-purple-800 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-purple-950 text-xs block">Month 12+ (Day 365+)</span>
              <span className="text-[10px] text-purple-700">Phase 4 Estate Release</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
