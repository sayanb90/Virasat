"use client";

import React from "react";
import { PhaseInfo } from "@/lib/state/heartbeatMachine";
import { ShieldCheck, Mail, AlertTriangle, Flame, Unlock, CheckCircle2 } from "lucide-react";

interface HeartbeatTimelineProps {
  phaseInfo: PhaseInfo;
  elapsedDays: number;
}

export function HeartbeatTimeline({ phaseInfo, elapsedDays }: HeartbeatTimelineProps) {
  const progressPercent = Math.min(100, (elapsedDays / 365) * 100);

  const phases = [
    {
      id: 0,
      badge: "Step 1",
      title: "Peaceful Silent Period",
      range: "Months 0 – 9 (Days 0–270)",
      desc: "Virasat operates quietly in the background. No logins, notifications, or interruptions required.",
      icon: ShieldCheck,
      color: "bg-emerald-50 border-emerald-200 text-emerald-800",
      startDay: 0,
      endDay: 270,
    },
    {
      id: 1,
      badge: "Step 2",
      title: "Gentle Check-in Reminders",
      range: "Months 9 – 11 (Days 270–330)",
      desc: "5 gentle emails spaced 12–14 days apart to make sure everything is okay.",
      icon: Mail,
      color: "bg-sky-50 border-sky-200 text-sky-800",
      startDay: 270,
      endDay: 330,
    },
    {
      id: 2,
      badge: "Step 3",
      title: "Urgent Escalation",
      range: "Months 11 – 11.5 (Days 330–345)",
      desc: "5 priority SMS & email notifications sent every few days.",
      icon: AlertTriangle,
      color: "bg-amber-50 border-amber-200 text-amber-800",
      startDay: 330,
      endDay: 345,
    },
    {
      id: 3,
      badge: "Step 4",
      title: "Critical Daily Countdown",
      range: "Months 11.5 – 12 (Days 345–365)",
      desc: "Daily emergency alerts across SMS, WhatsApp, and Email to confirm your safety.",
      icon: Flame,
      color: "bg-rose-50 border-rose-200 text-rose-800",
      startDay: 345,
      endDay: 365,
    },
    {
      id: 4,
      badge: "Step 5",
      title: "Estate Release to Loved Ones",
      range: "Month 12+ (Day 365+)",
      desc: "Your digital chest keys are securely released to your designated family heirs.",
      icon: Unlock,
      color: "bg-purple-50 border-purple-200 text-purple-800",
      startDay: 365,
      endDay: 999,
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-6">
      {/* Header & Status */}
      <div className="space-y-2 border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">
            1-Year Protection Timeline
          </h3>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            {phaseInfo.name}
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          If you are safe, a single tap once a year keeps your vault completely protected.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-semibold text-slate-600">
          <span>Day {elapsedDays} of 365</span>
          <span>{progressPercent.toFixed(0)}% of 1-Year Cycle</span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
          <div
            className="h-full rounded-full transition-all duration-500 bg-emerald-600"
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>
      </div>

      {/* Vertical Steps List - Clean and Legible for Seniors */}
      <div className="space-y-3 pt-1">
        {phases.map((p) => {
          const Icon = p.icon;
          const isActive = elapsedDays >= p.startDay && elapsedDays < p.endDay;
          const isPast = elapsedDays >= p.endDay;

          return (
            <div
              key={p.id}
              className={`p-4 rounded-2xl border transition-all ${
                isActive
                  ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs"
                  : isPast
                  ? "bg-slate-50/70 border-slate-200 opacity-80"
                  : "bg-white border-slate-100 opacity-60"
              }`}
            >
              <div className="flex items-start space-x-3.5">
                <div className={`p-2.5 rounded-xl shrink-0 ${isActive ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-600"}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                        {p.badge}
                      </span>
                      <h4 className="font-bold text-slate-900 text-xs">{p.title}</h4>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">{p.range}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{p.desc}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
