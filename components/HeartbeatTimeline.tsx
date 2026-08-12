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
      badge: "Phase 0",
      title: "Silent Period",
      range: "Month 0 – 9 (Days 0–270)",
      desc: "App operates in complete silence. Zero intrusive alerts or logins required.",
      icon: ShieldCheck,
      color: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
      startDay: 0,
      endDay: 270,
    },
    {
      id: 1,
      badge: "Phase 1",
      title: "Gentle Reminders",
      range: "Month 9 – 11 (Days 270–330)",
      desc: "5 gentle check-in emails spaced 12–14 days apart asking if you are safe.",
      icon: Mail,
      color: "border-sky-500/40 text-sky-400 bg-sky-500/10",
      startDay: 270,
      endDay: 330,
    },
    {
      id: 2,
      badge: "Phase 2",
      title: "Urgent Escalation",
      range: "Month 11 – 11.5 (Days 330–345)",
      desc: "5 urgent SMS & email alerts spaced 3–4 days apart with warning notifications.",
      icon: AlertTriangle,
      color: "border-amber-500/40 text-amber-400 bg-amber-500/10",
      startDay: 330,
      endDay: 345,
    },
    {
      id: 3,
      badge: "Phase 3",
      title: "Critical Countdown",
      range: "Month 11.5 – 12 (Days 345–365)",
      desc: "10 daily emergency alerts via Email, SMS & WhatsApp to confirm well-being.",
      icon: Flame,
      color: "border-rose-500/40 text-rose-400 bg-rose-500/10",
      startDay: 345,
      endDay: 365,
    },
    {
      id: 4,
      badge: "Phase 4",
      title: "Vault Released",
      range: "Month 12+ (Day 365+)",
      desc: "Chest keys released securely to your designated loved ones & heirs.",
      icon: Unlock,
      color: "border-purple-500/40 text-purple-400 bg-purple-500/10",
      startDay: 365,
      endDay: 999,
    },
  ];

  return (
    <div className="space-y-6 bg-[#0F111A] border border-white/10 rounded-3xl p-6 shadow-2xl">
      {/* Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h3 className="text-lg font-black text-white flex items-center space-x-2">
            <span>1-Year Heartbeat & Escalation Cycle</span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Automated state machine tracking 365 days of heartbeat silence before digital estate release.
          </p>
        </div>

        <div className={`px-4 py-2.5 rounded-2xl border ${phaseInfo.badgeBg} ${phaseInfo.badgeColor} flex items-center space-x-2 text-xs font-mono font-bold shadow-lg shrink-0`}>
          <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
          <span>{phaseInfo.name}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-mono text-gray-300 font-bold">
          <span>Day {elapsedDays} of 365</span>
          <span>{progressPercent.toFixed(1)}% Cycle Completed</span>
        </div>
        <div className="w-full h-3.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/15 relative">
          <div
            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-500 via-sky-500 via-amber-500 to-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Spacious De-cluttered Phase Cards (Stacked Vertical List) */}
      <div className="space-y-3 pt-2">
        {phases.map((p) => {
          const Icon = p.icon;
          const isActive = elapsedDays >= p.startDay && elapsedDays < p.endDay;
          const isPast = elapsedDays >= p.endDay;

          return (
            <div
              key={p.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isActive
                  ? `${p.color} ring-2 ring-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.2)] bg-black/60`
                  : isPast
                  ? "bg-white/5 border-white/10 opacity-75"
                  : "bg-black/30 border-white/5 opacity-60"
              }`}
            >
              <div className="flex items-start space-x-3.5">
                <div className={`p-3 rounded-2xl border ${p.color} shrink-0 mt-0.5`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2.5 flex-wrap">
                    <span className="text-[11px] font-mono font-extrabold uppercase px-2 py-0.5 rounded bg-white/10 text-white">
                      {p.badge}
                    </span>
                    <h4 className="font-extrabold text-white text-sm">{p.title}</h4>
                    <span className="text-xs text-gray-400 font-mono">({p.range})</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{p.desc}</p>
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-end sm:justify-center">
                {isActive ? (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black tracking-wide flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>ACTIVE NOW</span>
                  </span>
                ) : isPast ? (
                  <span className="px-3 py-1 rounded-xl bg-white/10 text-gray-400 text-xs font-mono flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Completed</span>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-xl bg-black/40 text-gray-500 text-xs font-mono">
                    Upcoming
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
