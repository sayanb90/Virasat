"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { HeartPulse, CheckCircle2, Vault, Users, ShieldCheck, ArrowRight, Lock, Sparkles } from "lucide-react";
import { PassphraseModal } from "@/components/PassphraseModal";
import { PhaseInfo } from "@/lib/state/heartbeatMachine";

export default function SeniorHomePage() {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [masterKeyHex, setMasterKeyHex] = useState<string>("");
  const [heartbeatData, setHeartbeatData] = useState<{
    simulatedElapsedDays: number;
    phaseInfo: PhaseInfo;
  } | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [beneficiaryCount, setBeneficiaryCount] = useState(0);
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const fetchStats = async () => {
    try {
      const [hbRes, vaultRes, benRes] = await Promise.all([
        fetch("/api/heartbeat"),
        fetch("/api/vault"),
        fetch("/api/beneficiaries"),
      ]);

      const hb = await hbRes.json();
      const vault = await vaultRes.json();
      const ben = await benRes.json();

      if (hb.success) {
        setHeartbeatData({
          simulatedElapsedDays: hb.simulatedElapsedDays,
          phaseInfo: hb.phaseInfo,
        });
      }
      if (vault.success) setItemCount(vault.items.length);
      if (ben.success) setBeneficiaryCount(ben.beneficiaries.length);
    } catch (err) {
      console.error("Fetch stats error:", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleOneTapCheckIn = async () => {
    setIsCheckingIn(true);
    try {
      const res = await fetch("/api/heartbeat", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCheckInSuccess(true);
        fetchStats();
        setTimeout(() => setCheckInSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Check-in error:", err);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const daysRemaining = heartbeatData ? 365 - heartbeatData.simulatedElapsedDays : 365;

  return (
    <div className="space-y-6">
      {/* Session Unlock Modal */}
      {!masterKey && (
        <PassphraseModal
          onMasterKeyDerived={(key, hex) => {
            setMasterKey(key);
            setMasterKeyHex(hex);
          }}
        />
      )}

      {/* Prominent One-Tap Check-In Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-[#101E17] via-[#0D1813] to-[#121A22] border-2 border-emerald-500/40 text-center space-y-4 shadow-[0_0_40px_rgba(16,185,129,0.15)] relative overflow-hidden">
        <div className="flex items-center justify-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          <span>ZERO-INTRUSION SAFETY ENGINE</span>
        </div>

        <div>
          <h1 className="text-2xl font-black text-white">Virasat Digital Estate Vault</h1>
          <p className="text-sm text-gray-300 mt-1 max-w-xs mx-auto leading-relaxed">
            No intrusive check-ins needed. Tap below anytime to confirm you are safe & well.
          </p>
        </div>

        {/* Big 80px Senior One-Tap Button */}
        <div className="pt-2">
          <button
            onClick={handleOneTapCheckIn}
            disabled={isCheckingIn}
            className="w-full py-5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-black font-black text-lg tracking-wide shadow-[0_0_35px_rgba(16,185,129,0.4)] transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-3 cursor-pointer disabled:opacity-50"
          >
            <HeartPulse className="w-8 h-8 text-black animate-bounce" />
            <span>{isCheckingIn ? "Recording Safety..." : "I AM SAFE & WELL"}</span>
          </button>
        </div>

        {checkInSuccess && (
          <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center space-x-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Safety Confirmed! Your 1-Year Silent Period is active.</span>
          </div>
        )}
      </div>

      {/* Clear Plain-English Status Card */}
      <div className="p-5 rounded-2xl bg-[#0E101A] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Vault Status</span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
            SILENT & PROTECTED
          </span>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-black text-white font-mono">{daysRemaining} Days</span>
          <span className="text-xs text-gray-400">until next automated check-in prompt</span>
        </div>

        {/* 1-Year Simple Progress Bar */}
        <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden p-0.5 border border-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-md"
            style={{ width: `${Math.min(100, ((heartbeatData?.simulatedElapsedDays || 0) / 365) * 100)}%` }}
          />
        </div>
      </div>

      {/* Two Main Action Cards for Senior Access */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/vault"
          className="p-5 rounded-2xl bg-[#0D0F18] border border-white/10 hover:border-amber-500/40 transition-all group space-y-3 block"
        >
          <div className="flex items-center justify-between">
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 text-amber-400">
              <Vault className="w-6 h-6" />
            </div>
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
              {itemCount} Secrets
            </span>
          </div>

          <div>
            <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
              My Family Chest
            </h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Confidential bank passcodes, house deeds, and family messages.
            </p>
          </div>

          <div className="flex items-center text-xs font-bold text-amber-400 space-x-1 pt-1">
            <span>Open Family Chest</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link
          href="/beneficiaries"
          className="p-5 rounded-2xl bg-[#0D0F18] border border-white/10 hover:border-sky-500/40 transition-all group space-y-3 block"
        >
          <div className="flex items-center justify-between">
            <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/30 text-sky-400">
              <Users className="w-6 h-6" />
            </div>
            <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
              {beneficiaryCount} Heirs
            </span>
          </div>

          <div>
            <h3 className="text-base font-bold text-white group-hover:text-sky-400 transition-colors">
              My Trusted Loved Ones
            </h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Designate family members who will receive access after 12 months.
            </p>
          </div>

          <div className="flex items-center text-xs font-bold text-sky-400 space-x-1 pt-1">
            <span>Manage Loved Ones</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      </div>
    </div>
  );
}
