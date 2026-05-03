"use client";

import { useEffect } from "react";
import { logSafeError } from "@/lib/safeLogger";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logSafeError("app.route-boundary", error, {
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#030303] px-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
          NikiAI
        </p>
        <h1 className="mt-4 text-2xl font-black tracking-tight">
          Something went wrong.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The app hit an unexpected issue. Your private study content is not shown here.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-6 rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-black transition hover:bg-cyan-300"
        >
          Try Again
        </button>
      </section>
    </main>
  );
}
