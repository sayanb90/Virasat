"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Vault, Users, HeartPulse, ShieldCheck, User, LogOut, ChevronDown, Lock } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";

export function Navbar() {
  const pathname = usePathname();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    name: "Sayan Bhattacharjee",
    email: "sayan.b@example.com",
    provider: "Google",
    initials: "SB",
  });

  const handleLoginSuccess = (user: { name: string; email: string; provider: string }) => {
    const initials = user.name
      ? user.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : "SB";

    setCurrentUser({
      name: user.name,
      email: user.email,
      provider: user.provider,
      initials,
    });
  };

  const navLinks = [
    { href: "/vault", label: "My Family Chest", icon: Vault, desc: "Encrypted Vault Items" },
    { href: "/beneficiaries", label: "Loved Ones & Heirs", icon: Users, desc: "Designated Beneficiaries" },
    { href: "/heartbeat", label: "Safety Status & Simulation", icon: HeartPulse, desc: "Dead Man's Switch" },
    { href: "/audit", label: "Audit Security Log", icon: ShieldCheck, desc: "Zero-Knowledge Logs" },
  ];

  return (
    <>
      {/* Top Professional Header Bar */}
      <header className="sticky top-0 z-40 bg-[#0B0C14]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] group-hover:scale-105 transition-all">
              <Lock className="w-5 h-5 text-black" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white block leading-none">Virasat</span>
              <span className="text-[10px] text-amber-400 font-mono tracking-widest uppercase">Digital Estate</span>
            </div>
          </Link>

          {/* Top Right Profile Avatar & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-2 p-1.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-black font-black text-xs shadow-inner">
                {currentUser.initials}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isProfileMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-3xl bg-[#121422] border border-amber-500/30 p-3 shadow-2xl space-y-2 z-50 animate-in fade-in duration-150">
                {/* User Info Header */}
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xs">
                    {currentUser.initials}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{currentUser.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{currentUser.email}</p>
                    <span className="inline-block mt-0.5 text-[9px] font-mono px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                      {currentUser.provider} Auth Active
                    </span>
                  </div>
                </div>

                <div className="border-t border-white/10 my-1" />

                {/* Navigation Links */}
                <div className="space-y-1">
                  {navLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className={`flex items-center space-x-3 p-2.5 rounded-xl text-xs font-bold transition-all ${
                          isActive
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="block">{link.label}</span>
                          <span className="text-[9px] text-gray-500 font-normal block">{link.desc}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="border-t border-white/10 my-1" />

                {/* Switch Account / Sign Out */}
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    setIsAuthModalOpen(true);
                  }}
                  className="w-full flex items-center space-x-2 p-2.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Switch Account / Sign In</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </>
  );
}
