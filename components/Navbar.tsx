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
    { href: "/vault", label: "My Family Chest", icon: Vault, desc: "Passwords, Notes & Documents" },
    { href: "/beneficiaries", label: "Loved Ones & Heirs", icon: Users, desc: "Designated Beneficiaries" },
    { href: "/heartbeat", label: "Safety Status & How It Works", icon: HeartPulse, desc: "Silent Protection Cycle" },
    { href: "/audit", label: "Security & Activity Log", icon: ShieldCheck, desc: "Recent Safety Records" },
  ];

  return (
    <>
      {/* Top Header Bar - Clean Light Theme */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-all">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-slate-900 block leading-none">Virasat</span>
              <span className="text-[10px] text-emerald-700 font-bold tracking-widest uppercase">Digital Estate</span>
            </div>
          </Link>

          {/* Top Right Profile Avatar & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-2 p-1 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
            >
              {currentUser.photoUrl ? (
                <img
                  src={currentUser.photoUrl}
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-xl object-cover border border-emerald-500/30 shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-xs shadow-xs">
                  {currentUser.initials}
                </div>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-600 pr-1 transition-transform duration-200 ${isProfileMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-3xl bg-white border border-slate-200 p-3.5 shadow-xl space-y-2 z-50 animate-in fade-in duration-150 ring-1 ring-slate-900/5">
                {/* User Info Header */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center space-x-3">
                  {currentUser.photoUrl ? (
                    <img
                      src={currentUser.photoUrl}
                      alt={currentUser.name}
                      className="w-10 h-10 rounded-xl object-cover border border-emerald-500/30 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 font-black text-xs shrink-0">
                      {currentUser.initials}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                    <span className="inline-block mt-1 text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                      {currentUser.provider} Active
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 my-1" />

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
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          <Icon className="w-4 h-4 shrink-0" />
                        </div>
                        <div>
                          <span className="block text-slate-900">{link.label}</span>
                          <span className="text-[10px] text-slate-500 font-normal block">{link.desc}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="border-t border-slate-100 my-1" />

                {/* Switch Account / Sign Out */}
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center space-x-2 p-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
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
