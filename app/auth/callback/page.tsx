"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureProfileForSession } from "@/lib/authProfile";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Finishing sign in...");

  useEffect(() => {
    let mounted = true;

    const finishAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const next = params.get("next") || "/";

      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          await ensureProfileForSession(data.session);
        } else {
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();
          if (error) throw error;
          await ensureProfileForSession(session);
        }

        if (mounted) {
          setStatus("Signed in. Redirecting...");
          router.replace(next);
          router.refresh();
        }
      } catch (error) {
        console.error("Auth callback failed:", error);
        if (mounted) {
          setStatus("Sign in failed. Redirecting to login...");
          window.setTimeout(() => router.replace("/login"), 1200);
        }
      }
    };

    finishAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-black px-6 text-center text-white">
      <div className="rounded-3xl border border-white/10 bg-white/[0.035] px-8 py-7 shadow-2xl">
        <h1 className="text-2xl font-black uppercase tracking-tight">
          Niki<span className="text-cyan-400">Ai</span>
        </h1>
        <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">
          {status}
        </p>
      </div>
    </main>
  );
}
