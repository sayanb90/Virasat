"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { HeartPulse, CheckCircle2, Vault, Users, ShieldCheck, ArrowRight, Lock, Key, Sparkles, FileText, Briefcase } from "lucide-react";
import { PhaseInfo, EscalationNotification } from "@/lib/state/heartbeatMachine";

export default function PeacefulHomePage() {
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
    <div className="space-y-6 pb-6">
      {/* Peaceful Status Hero Card */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#151C22] to-[#12161A] border border-[#52B788]/20 p-6 rounded-[32px] shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#52B788] animate-ping" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#52B788]">
              MY STATUS
            </span>
          </div>
          <span className="text-[11px] font-mono text-gray-400">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Ambient Heartbeat Wave Visual */}
        <div className="h-16 flex items-center justify-center relative my-2">
          <svg className="w-full h-full text-[#52B788]/40 overflow-visible" viewBox="0 0 400 60" preserveAspectRatio="none">
            <path
              d="M0,30 Q50,30 80,30 T120,30 T140,10 T160,50 T180,20 T200,40 T220,30 T300,30 T400,30"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="drop-shadow-[0_0_10px_rgba(82,183,136,0.6)]"
            />
          </svg>
        </div>

        {/* 1-Tap Primary Check-In Pill Button */}
        <button
          onClick={handleCheckIn}
          disabled={isSubmittingCheckIn}
          className={`w-full py-4 px-6 rounded-2xl font-black text-sm tracking-wide transition-all duration-300 flex items-center justify-center space-x-2 cursor-pointer shadow-[0_0_25px_rgba(82,183,136,0.3)] ${
            checkInSuccess
              ? "bg-emerald-400 text-black scale-105"
              : "bg-gradient-to-r from-[#52B788] to-[#74C69D] hover:from-[#40A073] hover:to-[#52B788] text-[#0F1317]"
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>{checkInSuccess ? "CHECK-IN CONFIRMED!" : isSubmittingCheckIn ? "CONFIRMING..." : "I AM SAFE & WELL"}</span>
        </button>

        <div className="text-center text-xs text-gray-400 space-y-1">
          <p>Last check-in: {heartbeatState ? new Date(heartbeatState.lastCheckInDate).toLocaleTimeString() : "Just now"}</p>
          <p className="text-[#52B788] font-bold text-[11px]">Phase 0: Silent & Secure • 0 Notifications Sent</p>
        </div>
      </div>

      {/* Quick Access Grid (4 Peaceful Cards) */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/vault"
          className="p-4 rounded-3xl bg-[#151A20] border border-white/10 hover:border-[#52B788]/40 transition-all space-y-3 group shadow-md"
        >
          <div className="p-2.5 w-10 h-10 rounded-2xl bg-[#52B788]/15 text-[#52B788] flex items-center justify-center">
            <Vault className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-xs group-hover:text-[#52B788] transition-colors">
              FINANCIAL ASSETS
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Bank Passwords & Crypto</p>
          </div>
        </Link>

        <Link
          href="/vault"
          className="p-4 rounded-3xl bg-[#151A20] border border-white/10 hover:border-[#52B788]/40 transition-all space-y-3 group shadow-md"
        >
          <div className="p-2.5 w-10 h-10 rounded-2xl bg-[#52B788]/15 text-[#52B788] flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-xs group-hover:text-[#52B788] transition-colors">
              PERSONAL LEGACY
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Confidential Notes & Messages</p>
          </div>
        </Link>

        <Link
          href="/beneficiaries"
          className="p-4 rounded-3xl bg-[#151A20] border border-white/10 hover:border-[#52B788]/40 transition-all space-y-3 group shadow-md"
        >
          <div className="p-2.5 w-10 h-10 rounded-2xl bg-[#52B788]/15 text-[#52B788] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-xs group-hover:text-[#52B788] transition-colors">
              LOVED ONES & HEIRS
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Estate Executors</p>
          </div>
        </Link>

        <Link
          href="/vault"
          className="p-4 rounded-3xl bg-[#151A20] border border-white/10 hover:border-[#52B788]/40 transition-all space-y-3 group shadow-md"
        >
          <div className="p-2.5 w-10 h-10 rounded-2xl bg-[#52B788]/15 text-[#52B788] flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-xs group-hover:text-[#52B788] transition-colors">
              LEGAL DOCUMENTS
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Wills & Trust PDFs</p>
          </div>
        </Link>
      </div>

      {/* Recent Activity Card */}
      <div className="p-5 rounded-3xl bg-[#151A20] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">Recent Activity</h3>
          <Link href="/audit" className="text-[11px] text-[#52B788] hover:underline font-mono">
            View Audit Log
          </Link>
        </div>

        <div className="space-y-2">
          <div className="p-3 rounded-2xl bg-black/40 border border-white/5 flex items-center space-x-3 text-xs">
            <div className="p-2 rounded-xl bg-[#52B788]/15 text-[#52B788]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-white">Vault Security & Zero-Knowledge State Active</p>
              <p className="text-[10px] text-gray-400 font-mono">100% Client-Encrypted</p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-black/40 border border-white/5 flex items-center space-x-3 text-xs">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-white">Heartbeat Confirmation Recorded</p>
              <p className="text-[10px] text-gray-400 font-mono">Timer reset for 365 days</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
