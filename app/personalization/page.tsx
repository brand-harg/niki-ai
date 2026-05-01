"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  readLocalPersonalizationSettings,
  writeLocalPersonalizationSettings,
} from "@/lib/personalization";
import { useRouter } from "next/navigation";

export default function PersonalizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [themeAccent, setThemeAccent] = useState("cyan");

  const [data, setData] = useState(DEFAULT_PERSONALIZATION_SETTINGS);
  const [persistedData, setPersistedData] = useState(DEFAULT_PERSONALIZATION_SETTINGS);
  const [syncState, setSyncState] = useState<"saved" | "draft" | "saving" | "error">("saved");

  const hydratePersonalizationState = useCallback(async (sessionOverride?: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null) => {
      const savedAccent = localStorage.getItem("theme_accent");
      if (savedAccent === "cyan" || savedAccent === "green" || savedAccent === "amber") {
        setThemeAccent(savedAccent);
      }

      const session =
        sessionOverride ??
        (
          await supabase.auth.getSession()
        ).data.session;

      if (!session) {
        const nextLocal = readLocalPersonalizationSettings();
        setData(nextLocal);
        setPersistedData(nextLocal);
        setSyncState("saved");
        setIsGuestMode(true);
        setLoading(false);
        return nextLocal;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("about_user, response_style, default_niki_mode, theme_accent")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) console.log("Personalization fetch error:", error);

      if (profile) {
        const nextData = {
          about_user: profile.about_user || "",
          response_style: profile.response_style || "",
          default_niki_mode: profile.default_niki_mode ?? false,
        };
        setData(nextData);
        setPersistedData(nextData);
        setSyncState("saved");
        writeLocalPersonalizationSettings(nextData);
        if (
          profile.theme_accent === "cyan" ||
          profile.theme_accent === "green" ||
          profile.theme_accent === "amber"
        ) {
          setThemeAccent(profile.theme_accent);
        }
      }
      setIsGuestMode(false);
      setLoading(false);
      return profile;
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialHydrateTimer = window.setTimeout(() => {
      if (!mounted) return;
      void hydratePersonalizationState();
    }, 0);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      void hydratePersonalizationState(nextSession);
    });

    const handleFocus = () => {
      if (!mounted) return;
      void hydratePersonalizationState();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      mounted = false;
      window.clearTimeout(initialHydrateTimer);
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, [hydratePersonalizationState, router]);

  const handleSave = async () => {
    setSaving(true);
    setSyncState("saving");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      writeLocalPersonalizationSettings(data);
      setPersistedData(data);
      setStatus("Saved On This Device");
      setTimeout(() => setStatus(null), 3000);
      setSaving(false);
      setIsGuestMode(true);
      setSyncState("saved");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        about_user: data.about_user,
        response_style: data.response_style,
        default_niki_mode: data.default_niki_mode,
      })
      .eq("id", session.user.id);

    if (!error) {
      writeLocalPersonalizationSettings(data);
      setPersistedData(data);
      setSyncState("saved");
      setStatus("Instructions Updated");
      setTimeout(() => setStatus(null), 3000);
    } else {
      setStatus("Sync Failed");
      setTimeout(() => setStatus(null), 3000);
      setSyncState("error");
      console.log("Personalization save error:", error);
    }
    setSaving(false);
  };

  const isGreen = themeAccent === "green";
  const isAmber = themeAccent === "amber";
  const accentText = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const accentBg = isGreen ? "bg-green-500" : isAmber ? "bg-amber-500" : "bg-cyan-500";
  const accentHoverBg = isGreen
    ? "hover:bg-green-400"
    : isAmber
    ? "hover:bg-amber-400"
    : "hover:bg-cyan-400";
  const accentFocusBorder = isGreen
    ? "focus:border-green-500/50"
    : isAmber
    ? "focus:border-amber-500/50"
    : "focus:border-cyan-500/50";
  const selectionClass = isGreen
    ? "selection:bg-green-500/30"
    : isAmber
    ? "selection:bg-amber-500/30"
    : "selection:bg-cyan-500/30";
  const hasUnsavedChanges = JSON.stringify(data) !== JSON.stringify(persistedData);
  const syncBadgeText =
    syncState === "saving"
      ? "Saving..."
      : syncState === "error"
        ? "Save issue"
        : hasUnsavedChanges || syncState === "draft"
          ? isGuestMode
            ? "Unsaved locally"
            : "Unsynced changes"
          : isGuestMode
            ? "Saved on device"
            : "Cloud synced";
  const syncBadgeClass =
    syncState === "saving"
      ? `${accentBg} text-black`
      : syncState === "error"
        ? "border border-rose-500/20 bg-rose-500/10 text-rose-300"
        : hasUnsavedChanges || syncState === "draft"
          ? "border border-amber-500/20 bg-amber-500/10 text-amber-300"
          : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300";

  if (loading) {
    return (
      <div
        className={`min-h-screen bg-black flex items-center justify-center ${accentText} font-mono text-[10px] uppercase tracking-widest animate-pulse`}
      >
        Accessing AI Core...
      </div>
    );
  }

  return (
    <main
      className={`min-h-screen bg-black text-white p-6 font-sans ${selectionClass} relative`}
    >
      {status && (
        <div
          className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-2 ${accentBg} text-black text-[9px] font-black uppercase rounded-full shadow-lg animate-in fade-in zoom-in duration-300`}
        >
          {status}
        </div>
      )}

      <div className="max-w-2xl mx-auto pt-16">
        <header className="mb-12">
          <h1 className="text-3xl font-black uppercase tracking-tighter italic">
            AI<span className={accentText}>Personalization</span>
          </h1>
          <p className="text-slate-600 text-[10px] font-mono uppercase tracking-[0.2em] mt-2">
            Fine-tune how NikiAI explains and supports you
          </p>
          {isGuestMode && (
            <p className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.16em] mt-3">
              Guest mode: saved locally on this device until you log in
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${syncBadgeClass}`}>
              {syncBadgeText}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
              {isGuestMode ? "Local" : "Cloud"}
            </span>
          </div>
        </header>

        <div className="bg-[#080808] border border-white/5 rounded-[3rem] p-10 space-y-10 shadow-2xl">
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">
              What should NikiAI know about you?
            </h3>
            <textarea
              value={data.about_user || ""}
              onChange={(e) => {
                setData({ ...data, about_user: e.target.value });
                setSyncState("draft");
              }}
              placeholder="e.g. I am a student at RVCC transferring to Rowan for Data Science. Focus on Calculus III and Python logic."
              className={`w-full h-32 bg-white/[0.02] border border-white/10 rounded-3xl p-6 text-sm text-slate-300 ${accentFocusBorder} outline-none transition-all resize-none ring-0`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">
              How should NikiAI respond?
            </h3>
            <textarea
              value={data.response_style || ""}
              onChange={(e) => {
                setData({ ...data, response_style: e.target.value });
                setSyncState("draft");
              }}
              placeholder="e.g. Be direct, use mathematical notation, and always provide a 'Nemanja-style' logic summary at the end."
              className={`w-full h-32 bg-white/[0.02] border border-white/10 rounded-3xl p-6 text-sm text-slate-300 ${accentFocusBorder} outline-none transition-all resize-none ring-0`}
            />
          </div>

          <div className="flex items-center justify-between p-6 bg-white/[0.01] border border-white/5 rounded-3xl">
            <div>
              <span className="text-xs font-bold text-slate-300">Default to Nemanja Mode</span>
              <p className="text-[8px] text-slate-600 uppercase mt-1">
                Start sessions with the instructor teaching style active
              </p>
            </div>
            <button
              onClick={() => {
                setData({ ...data, default_niki_mode: !data.default_niki_mode });
                setSyncState("draft");
              }}
              className={`w-12 h-6 rounded-full relative transition-all ${
                data.default_niki_mode ? accentBg : "bg-zinc-800"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  data.default_niki_mode ? "right-1" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="flex gap-4 pt-6 border-t border-white/5">
            <button
              onClick={() => router.push("/settings")}
              className="flex-1 py-4 text-[9px] font-black uppercase text-slate-600 hover:text-white transition-all"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!hasUnsavedChanges && syncState !== "error")}
              className={`flex-[2] bg-white ${accentHoverBg} text-black py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all disabled:opacity-50`}
            >
              {saving ? "Syncing..." : hasUnsavedChanges ? "Save Instructions" : "Already Saved"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
