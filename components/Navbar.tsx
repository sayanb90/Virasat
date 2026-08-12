"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Vault, Users, HeartPulse, ShieldCheck, LogOut, ChevronDown, Lock } from "lucide-react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
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
    photoUrl: "",
  });

  useEffect(() => {
    // Subscribe to real Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const name = user.displayName || user.email?.split("@")[0] || "User";
        const email = user.email || "";
        const initials = name
          ? name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
          : "U";

        setCurrentUser({
          name,
          email,
          provider: "Google Auth",
          initials,
          photoUrl: user.photoURL || "",
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (user: { name: string; email: string; avatarUrl?: string; provider: string }) => {
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
      photoUrl: user.avatarUrl || "",
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser({
        name: "Sayan Bhattacharjee",
        email: "sayan.b@example.com",
        provider: "Signed Out",
        initials: "SB",
        photoUrl: "",
      });
      setIsProfileMenuOpen(false);
      setIsAuthModalOpen(true);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const navLinks = [
    { href: "/vault", label: "My Family Chest", icon: Vault, desc: "Encrypted Vault Items" },
    { href: "/beneficiaries", label: "Loved Ones & Heirs", icon: Users, desc: "Designated Beneficiaries" },
    { href: "/heartbeat", label: "Safety Status & Simulation", icon: HeartPulse, desc: "Dead Man's Switch" },
    { href: "/audit", label: "Audit Security Log", icon: ShieldCheck, desc: "Zero-Knowledge Logs" },
  ];

  return (
    <>
      {/* Top Header Bar - Peaceful Sage Theme */}
      <header className="sticky top-0 z-40 bg-[#0F1317]/95 backdrop-blur-md border-b border-emerald-900/20 px-4 py-3.5">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#52B788] to-[#74C69D] flex items-center justify-center shadow-[0_0_20px_rgba(82,183,136,0.3)] group-hover:scale-105 transition-all">
              <Lock className="w-5 h-5 text-[#0F1317]" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-[#F4F1DE] block leading-none">Virasat</span>
              <span className="text-[10px] text-[#52B788] font-mono tracking-widest uppercase">Peaceful Estate</span>
            </div>
          </Link>

          {/* Top Right Profile Avatar & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-2 p-1.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-emerald-500/20 transition-all cursor-pointer"
            >
              {currentUser.photoUrl ? (
                <img
                  src={currentUser.photoUrl}
                  alt={currentUser.name}
                  className="w-8.5 h-8.5 rounded-xl object-cover border border-[#52B788]/40"
                />
              ) : (
                <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-tr from-[#52B788] to-[#74C69D] flex items-center justify-center text-[#0F1317] font-black text-xs shadow-inner">
                  {currentUser.initials}
                </div>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-[#52B788] transition-transform duration-200 ${isProfileMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-3xl bg-[#151A20] border border-emerald-500/30 p-3 shadow-2xl space-y-2 z-50 animate-in fade-in duration-150">
                {/* User Info Header */}
                <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/20 flex items-center space-x-3">
                  {currentUser.photoUrl ? (
                    <img
                      src={currentUser.photoUrl}
                      alt={currentUser.name}
                      className="w-9 h-9 rounded-xl object-cover border border-[#52B788]/40 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-[#52B788]/20 border border-[#52B788]/40 flex items-center justify-center text-[#52B788] font-bold text-xs shrink-0">
                      {currentUser.initials}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-[#F4F1DE] truncate">{currentUser.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{currentUser.email}</p>
                    <span className="inline-block mt-0.5 text-[9px] font-mono px-1.5 py-0.2 bg-[#52B788]/20 text-[#74C69D] rounded border border-[#52B788]/30">
                      {currentUser.provider} Active
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
                            ? "bg-[#52B788]/20 text-[#74C69D] border border-[#52B788]/40"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Icon className="w-4 h-4 text-[#52B788] shrink-0" />
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
                  onClick={handleSignOut}
                  className="w-full flex items-center space-x-2 p-2.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Switch Account / Sign Out</span>
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
