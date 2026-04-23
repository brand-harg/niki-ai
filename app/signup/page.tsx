"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [themeAccent, setThemeAccent] = useState<"cyan" | "green" | "amber">("cyan");

  const isGreen = themeAccent === "green";
  const isAmber = themeAccent === "amber";
  const accentText = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const accentBg = isGreen ? "bg-green-600" : isAmber ? "bg-amber-500" : "bg-cyan-600";
  const accentHoverBg = isGreen ? "hover:bg-green-500" : isAmber ? "hover:bg-amber-400" : "hover:bg-cyan-500";
  const accentFocusBorder = isGreen ? "focus:border-green-500/50" : isAmber ? "focus:border-amber-500/50" : "focus:border-cyan-500/50";
  const topGlow = isGreen ? "bg-green-500/10" : isAmber ? "bg-amber-500/10" : "bg-cyan-500/10";
  const bottomGlow = isGreen ? "bg-emerald-600/10" : isAmber ? "bg-orange-500/10" : "bg-blue-600/10";
  const selectionClass = isGreen ? "selection:bg-green-500/30" : isAmber ? "selection:bg-amber-500/30" : "selection:bg-cyan-500/30";

  useEffect(() => {
    let mounted = true;

    const savedAccent = localStorage.getItem("theme_accent");
    if (savedAccent === "green" || savedAccent === "amber" || savedAccent === "cyan") {
      setThemeAccent(savedAccent);
    }

    const redirectIfSignedIn = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted && session?.user?.id) {
        router.replace("/");
        router.refresh();
      }
    };

    redirectIfSignedIn();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session?.user?.id) {
        router.replace("/");
        router.refresh();
        return;
      }

      setNotice("Account created. Check your email if confirmation is required.");
      window.setTimeout(() => {
        router.replace("/login");
      }, 900);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`min-h-screen bg-black flex items-center justify-center p-6 font-sans ${selectionClass}`}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${topGlow} rounded-full blur-[120px]`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${bottomGlow} rounded-full blur-[120px]`} />
      </div>

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black tracking-tighter uppercase text-white mb-2">
            Niki<span className={accentText}>Ai</span>
          </h1>
          <p className="text-slate-500 text-sm font-mono uppercase tracking-widest">
            Create Account
          </p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleSignup} className="space-y-4">
            <input
              type="email"
              placeholder="EMAIL ADDRESS"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white placeholder-slate-700 focus:outline-none ${accentFocusBorder} transition-all text-sm font-medium`}
              autoComplete="email"
              required
            />
            <input
              type="password"
              placeholder="PASSWORD"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white placeholder-slate-700 focus:outline-none ${accentFocusBorder} transition-all text-sm font-medium`}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <input
              type="password"
              placeholder="CONFIRM PASSWORD"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={`w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white placeholder-slate-700 focus:outline-none ${accentFocusBorder} transition-all text-sm font-medium`}
              autoComplete="new-password"
              minLength={8}
              required
            />

            {error && (
              <p className="text-red-500 text-[10px] font-black uppercase text-center">
                {error}
              </p>
            )}

            {notice && (
              <p className={`${accentText} text-[10px] font-black uppercase text-center`}>
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full ${accentBg} ${accentHoverBg} disabled:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-tighter transition-all`}
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-slate-600 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Back to Login
            </Link>
          </div>
        </div>

        <p className="text-center text-slate-600 text-[10px] font-mono mt-8 uppercase tracking-widest">
          Secure Academic Environment
        </p>
      </div>
    </main>
  );
}
