"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearAuthCallbackUrl, hasAuthCallbackParams, recoverSessionFromUrl } from "@/lib/authRecovery";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [themeAccent, setThemeAccent] = useState<"cyan" | "green" | "amber">("cyan");
  const [sessionReady, setSessionReady] = useState(false);

  const isGreen = themeAccent === "green";
  const isAmber = themeAccent === "amber";

  const accentText = isGreen
    ? "text-green-400"
    : isAmber
      ? "text-amber-400"
      : "text-cyan-400";

  const accentBg = isGreen
    ? "bg-green-600"
    : isAmber
      ? "bg-amber-500"
      : "bg-cyan-600";

  const accentHoverBg = isGreen
    ? "hover:bg-green-500"
    : isAmber
      ? "hover:bg-amber-400"
      : "hover:bg-cyan-500";

  const accentFocusBorder = isGreen
    ? "focus:border-green-500/50"
    : isAmber
      ? "focus:border-amber-500/50"
      : "focus:border-cyan-500/50";

  const topGlow = isGreen
    ? "bg-green-500/10"
    : isAmber
      ? "bg-amber-500/10"
      : "bg-cyan-500/10";

  const bottomGlow = isGreen
    ? "bg-emerald-600/10"
    : isAmber
      ? "bg-orange-500/10"
      : "bg-blue-600/10";

  const selectionClass = isGreen
    ? "selection:bg-green-500/30"
    : isAmber
      ? "selection:bg-amber-500/30"
      : "selection:bg-cyan-500/30";

  useEffect(() => {
    const savedAccent = localStorage.getItem("theme_accent");
    if (savedAccent === "green" || savedAccent === "amber" || savedAccent === "cyan") {
      setThemeAccent(savedAccent);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrapRecoverySession = async () => {
      setVerifying(true);
      setError(null);

      try {
        let session = null;

        if (hasAuthCallbackParams()) {
          session = await recoverSessionFromUrl();
          clearAuthCallbackUrl("/update-password");
        } else {
          const {
            data: { session: existingSession },
          } = await supabase.auth.getSession();
          session = existingSession;
        }

        if (!session?.user?.id) {
          throw new Error("This reset link is expired or invalid. Please request a new one.");
        }

        if (mounted) {
          setSessionReady(true);
        }
      } catch (recoveryError) {
        if (mounted) {
          setSessionReady(false);
          setError(
            recoveryError instanceof Error && recoveryError.message
              ? recoveryError.message
              : "This reset link is expired or invalid. Please request a new one."
          );
        }
      } finally {
        if (mounted) setVerifying(false);
      }
    };

    void bootstrapRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!password || password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess("Password updated successfully. Redirecting to login...");
      window.setTimeout(() => {
        router.replace("/login?reset=success");
      }, 1200);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`min-h-screen bg-black flex items-center justify-center p-6 font-sans ${selectionClass}`}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] h-[40%] w-[40%] ${topGlow} rounded-full blur-[120px]`} />
        <div className={`absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] ${bottomGlow} rounded-full blur-[120px]`} />
      </div>

      <div className="z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter text-white">
            Niki<span className={accentText}>Ai</span>
          </h1>
          <p className="text-sm font-mono uppercase tracking-widest text-slate-500">
            Update Password
          </p>
        </div>

        <div className="rounded-[2.5rem] border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl backdrop-blur-xl">
          {verifying ? (
            <div className="space-y-4 text-center">
              <p className="text-sm font-bold text-white">Verifying reset link...</p>
              <p className="text-xs text-slate-500">
                Hold on while we confirm your recovery session.
              </p>
            </div>
          ) : !sessionReady ? (
            <div className="space-y-6 text-center">
              <div className="text-4xl">⚠️</div>
              <p className="text-sm font-bold text-white">Reset link unavailable</p>
              <p className="text-xs text-slate-500">
                {error ?? "This reset link is expired or invalid. Please request a new one."}
              </p>
              <Link
                href="/login"
                className={`block w-full rounded-2xl py-4 text-center text-xs font-black uppercase tracking-tighter text-white transition-all ${accentBg} ${accentHoverBg}`}
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <p className="mb-2 text-center text-xs text-slate-400">
                Enter your new password below.
              </p>

              <input
                type="password"
                placeholder="NEW PASSWORD"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-medium text-white placeholder-slate-700 transition-all focus:outline-none ${accentFocusBorder}`}
                required
              />

              <input
                type="password"
                placeholder="CONFIRM NEW PASSWORD"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-medium text-white placeholder-slate-700 transition-all focus:outline-none ${accentFocusBorder}`}
                required
              />

              {error && (
                <p className="text-center text-[10px] font-black uppercase text-red-500">
                  {error}
                </p>
              )}

              {success && (
                <p className={`text-center text-[10px] font-black uppercase ${accentText}`}>
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-2xl py-4 text-xs font-black uppercase tracking-tighter text-white transition-all disabled:bg-zinc-800 ${accentBg} ${accentHoverBg}`}
              >
                {loading ? "Saving..." : "Save New Password"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-[10px] font-mono uppercase tracking-widest text-slate-600">
          Secure Academic Environment
        </p>
      </div>
    </main>
  );
}
