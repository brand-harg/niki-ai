"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function AuthConfirmedPage() {
  const [themeAccent] = useState<"cyan" | "green" | "amber">(() => {
    if (typeof window === "undefined") return "cyan";
    const savedAccent = localStorage.getItem("theme_accent");
    return savedAccent === "cyan" || savedAccent === "green" || savedAccent === "amber"
      ? savedAccent
      : "cyan";
  });

  useEffect(() => {
    // Confirmation links can establish a temporary session. We clear it here so
    // the user follows the normal post-confirmation login path.
    void supabase.auth.signOut();
  }, []);

  const isGreen = themeAccent === "green";
  const isAmber = themeAccent === "amber";
  const accentText = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const accentBg = isGreen ? "bg-green-600" : isAmber ? "bg-amber-500" : "bg-cyan-600";
  const accentHoverBg = isGreen ? "hover:bg-green-500" : isAmber ? "hover:bg-amber-400" : "hover:bg-cyan-500";
  const topGlow = isGreen ? "bg-green-500/10" : isAmber ? "bg-amber-500/10" : "bg-cyan-500/10";
  const bottomGlow = isGreen ? "bg-emerald-600/10" : isAmber ? "bg-orange-500/10" : "bg-blue-600/10";
  const selectionClass = isGreen ? "selection:bg-green-500/30" : isAmber ? "selection:bg-amber-500/30" : "selection:bg-cyan-500/30";

  return (
    <main className={`min-h-screen bg-black flex items-center justify-center p-6 font-sans ${selectionClass}`}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full blur-[120px] ${topGlow}`} />
        <div className={`absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full blur-[120px] ${bottomGlow}`} />
      </div>

      <div className="z-10 w-full max-w-md rounded-[2.5rem] border border-white/5 bg-[#0a0a0a] p-8 text-center shadow-2xl backdrop-blur-xl">
        <h1 className="text-4xl font-black uppercase tracking-tighter text-white">
          Niki<span className={accentText}>Ai</span>
        </h1>
        <p className="mt-8 text-lg font-black uppercase tracking-tight text-white">
          Email confirmed successfully.
        </p>
        <p className="mt-3 text-sm font-medium text-slate-400">
          You can now log in.
        </p>

        <Link
          href="/login?confirmed=success"
          className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl py-4 text-xs font-black uppercase tracking-tighter text-white transition-all ${accentBg} ${accentHoverBg}`}
        >
          Back to Login
        </Link>
      </div>
    </main>
  );
}
