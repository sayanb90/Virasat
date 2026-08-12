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
    <div className="flex flex-col items-center min-h-screen bg-[#06070B] py-4 px-2 sm:px-4">
      {/* Device Frame Toggle Bar */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between px-4 py-2 bg-[#121422] border border-white/10 rounded-2xl shadow-lg text-xs font-medium text-gray-300">
        <div className="flex items-center space-x-2">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-white">App View Mode</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setDeviceType(deviceType === "iPhone" ? "Android" : "iPhone")}
            className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-[11px] font-mono text-emerald-400 cursor-pointer"
          >
            {deviceType === "iPhone" ? "📱 iOS (iPhone)" : "🤖 Android"}
          </button>

          <button
            onClick={() => setIsMobileFrame(!isMobileFrame)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white cursor-pointer"
            title="Toggle Device Frame"
          >
            {isMobileFrame ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Device Shell or Full Screen */}
      {isMobileFrame ? (
        <div className="relative w-full max-w-[420px] h-[860px] bg-[#0A0C14] border-[10px] border-[#1C1F2E] rounded-[50px] shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden ring-1 ring-white/10">
          {/* iOS Dynamic Island / Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-5 bg-black rounded-full z-50 flex items-center justify-end px-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#121422] border border-white/10" />
          </div>

          {/* Status Bar */}
          <div className="h-11 pt-2 px-7 flex items-center justify-between text-xs text-white font-semibold z-40 bg-[#0A0C14] shrink-0">
            <span>{currentTime}</span>
            <div className="flex items-center space-x-2 text-gray-300">
              <Signal className="w-3.5 h-3.5" />
              <Wifi className="w-3.5 h-3.5" />
              <Battery className="w-4 h-4 text-emerald-400" />
            </div>
          </div>

          {/* Mobile Screen Content Area */}
          <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col">
            {children}
          </div>

          {/* iOS Bottom Gesture Indicator Bar */}
          <div className="h-5 bg-[#0A0C14] flex items-center justify-center shrink-0 z-40">
            <div className="w-32 h-1 bg-white/30 rounded-full" />
          </div>
        </div>
      ) : (
        <div className="w-full max-w-4xl bg-[#0A0C14] rounded-3xl border border-white/10 p-4 sm:p-6 shadow-2xl">
          {children}
        </div>
      )}
    </div>
  );
}
