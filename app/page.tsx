"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Vault, Users, ShieldCheck, FileText, Sparkles, HeartPulse, ChevronRight } from "lucide-react";
import { PhaseInfo, EscalationNotification } from "@/lib/state/heartbeatMachine";

export default function SeniorFriendlyHomePage() {
  const [heartbeatState, setHeartbeatState] = useState<{
    simulatedElapsedDays: number;
    phaseInfo: PhaseInfo;
    notifications: EscalationNotification[];
    lastCheckInDate: string;
  } | null>(null);

  const [checkInSuccess, setCheckInSuccess] = useState(false);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/heartbeat");
      const data = await res.json();
      if (data.success) {
        setHeartbeatState(data);
      }
    } catch (err) {
      console.error("Fetch state error:", err);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const handleCheckIn = async () => {
    setIsSubmittingCheckIn(true);
    try {
      const res = await fetch("/api/heartbeat", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCheckInSuccess(true);
        setTimeout(() => setCheckInSuccess(false), 3000);
        fetchState();
      }
    } catch (err) {
      console.error("Check-in error:", err);
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Primary Senior Safety Status Card */}
      <div className="bg-white border border-slate-200/90 rounded-[28px] p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Protection Active
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>

        {/* Reassuring Status Banner */}
        <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-100 flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">All Safe & Protected</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Virasat operates silently. We won&apos;t disturb you for the next 9 months.
            </p>
          </div>
        </div>

        {/* Large 1-Tap "I AM SAFE & WELL" Button */}
        <button
          onClick={handleCheckIn}
          disabled={isSubmittingCheckIn}
          className={`w-full py-4.5 px-6 rounded-2xl font-black text-base tracking-wide transition-all duration-200 flex items-center justify-center space-x-3 cursor-pointer shadow-md ${
            checkInSuccess
              ? "bg-emerald-600 text-white scale-[1.02] shadow-emerald-600/30"
              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 active:scale-[0.98]"
          }`}
        >
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          <span>{checkInSuccess ? "Check-In Confirmed!" : isSubmittingCheckIn ? "Confirming..." : "I AM SAFE & WELL"}</span>
        </button>

        <div className="text-center text-xs text-slate-500">
          Last confirmed: {heartbeatState ? new Date(heartbeatState.lastCheckInDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today"}
        </div>
      </div>

      {/* Quick Access to Estate Items (4 Clean Cards) */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
          Your Digital Chest
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/vault"
            className="p-4.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-3 group shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
              <Vault className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                Financial Assets
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">Bank logins & crypto</p>
            </div>
          </Link>

          <Link
            href="/vault"
            className="p-4.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-3 group shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                Personal Notes
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">Letters & passwords</p>
            </div>
          </Link>

          <Link
            href="/beneficiaries"
            className="p-4.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-3 group shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                Loved Ones
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">Designated heirs</p>
            </div>
          </Link>

          <Link
            href="/vault"
            className="p-4.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-3 group shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                Legal Documents
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">Wills & trust PDFs</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Simple "How Virasat Protects You" Explainer */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3.5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          How Virasat Protects You
        </h3>

        <div className="space-y-3 text-xs">
          <div className="flex items-start space-x-3">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <p className="text-slate-700 leading-relaxed">
              <strong className="text-slate-900">Complete Silence (0–9 Months):</strong> We operate quietly and never spam you with daily prompts.
            </p>
          </div>

          <div className="flex items-start space-x-3">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-800 font-bold flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <p className="text-slate-700 leading-relaxed">
              <strong className="text-slate-900">Gentle Reminder (9–11 Months):</strong> If you are away, we send gentle check-in emails before escalating.
            </p>
          </div>

          <div className="flex items-start space-x-3">
            <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center shrink-0 mt-0.5">
              3
            </span>
            <p className="text-slate-700 leading-relaxed">
              <strong className="text-slate-900">Safe Delivery (12+ Months):</strong> If you don&apos;t check in after a full year, your chest is securely delivered to your loved ones.
            </p>
          </div>
        </div>

        <div className="pt-1">
          <Link
            href="/heartbeat"
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1"
          >
            <span>Learn more about safety cycle</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
