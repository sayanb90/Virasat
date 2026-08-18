"use client";

import React, { useState } from "react";
import { Smartphone, Monitor, Wifi, Battery, Signal } from "lucide-react";

interface MobileDeviceFrameProps {
  children: React.ReactNode;
}

export function MobileDeviceFrame({ children }: MobileDeviceFrameProps) {
  const [isMobileFrame, setIsMobileFrame] = useState(true);
  const [deviceType, setDeviceType] = useState<"iPhone" | "Android">("iPhone");

  const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#F1F5F9] py-4 px-2 sm:px-4">
      {/* Device Frame Toggle Bar */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between px-4 py-2 bg-white border border-slate-200 rounded-2xl shadow-sm text-xs font-medium text-slate-600">
        <div className="flex items-center space-x-2">
          <Smartphone className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-slate-900">App Preview Mode</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setDeviceType(deviceType === "iPhone" ? "Android" : "iPhone")}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 text-[11px] font-medium text-emerald-700 cursor-pointer"
          >
            {deviceType === "iPhone" ? "📱 iOS (iPhone)" : "🤖 Android"}
          </button>

          <button
            onClick={() => setIsMobileFrame(!isMobileFrame)}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
            title="Toggle Device Frame"
          >
            {isMobileFrame ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Device Shell or Full Screen */}
      {isMobileFrame ? (
        <div className="relative w-full max-w-[430px] h-[890px] bg-[#F8FAFC] border-[10px] border-[#0F172A] rounded-[52px] shadow-[0_25px_60px_-15px_rgba(15,23,42,0.25)] flex flex-col overflow-hidden ring-1 ring-slate-900/10">
          {/* iOS Dynamic Island / Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-5 bg-[#0F172A] rounded-full z-50 flex items-center justify-end px-2">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
          </div>

          {/* iOS Status Bar */}
          <div className="h-11 pt-2 px-7 flex items-center justify-between text-xs text-slate-900 font-semibold z-40 bg-[#F8FAFC] shrink-0">
            <span>{currentTime}</span>
            <div className="flex items-center space-x-2 text-slate-600">
              <Signal className="w-3.5 h-3.5" />
              <Wifi className="w-3.5 h-3.5" />
              <Battery className="w-4 h-4 text-emerald-600" />
            </div>
          </div>

          {/* Mobile Screen Content Area */}
          <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col bg-[#F8FAFC] px-4 py-2">
            {children}
          </div>

          {/* iOS Bottom Gesture Indicator Bar */}
          <div className="h-5 bg-[#F8FAFC] flex items-center justify-center shrink-0 z-40">
            <div className="w-32 h-1 bg-slate-300 rounded-full" />
          </div>
        </div>
      ) : (
        <div className="w-full max-w-4xl bg-[#F8FAFC] rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}
