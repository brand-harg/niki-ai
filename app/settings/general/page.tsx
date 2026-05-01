"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_GENERAL_SETTINGS,
  readLocalGeneralSettings,
  writeLocalGeneralSettings,
  type GeneralSettings,
} from '@/lib/generalSettings';
import {
  readLocalPersonalizationSettings,
  writeLocalPersonalizationSettings,
} from '@/lib/personalization';

type PersistedSettings = GeneralSettings & {
  performance_mode: boolean;
  default_niki_mode: boolean;
};

export default function GeneralSettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [syncState, setSyncState] = useState<"saved" | "saving" | "local">("saved");

  const [settings, setSettings] = useState<PersistedSettings>({
    ...DEFAULT_GENERAL_SETTINGS,
    performance_mode: true,
    default_niki_mode: false,
  });

  useEffect(() => {
    let mounted = true;

    const fetchSettings = async (
      sessionOverride?: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null
    ) => {
      const localGeneralSettings = readLocalGeneralSettings();
      const localPersonalization = readLocalPersonalizationSettings();
      if (!mounted) return;

      setSettings((prev) => ({
        ...prev,
        ...localGeneralSettings,
        default_niki_mode: localPersonalization.default_niki_mode,
      }));

      const session =
        sessionOverride ??
        (
          await supabase.auth.getSession()
        ).data.session;
      if (!mounted) return;

      if (!session) {
        setHasSession(false);
        setSyncState("local");
        setLoading(false);
        return;
      }

      setHasSession(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('theme_accent, compact_mode, cmd_enter_to_send, performance_mode, default_niki_mode')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.log("General settings fetch error:", error);
      }

      if (data) {
        setSettings({
          theme_accent:
            data.theme_accent === 'green' || data.theme_accent === 'amber'
              ? data.theme_accent
              : 'cyan',
          compact_mode: data.compact_mode ?? false,
          cmd_enter_to_send: data.cmd_enter_to_send ?? false,
          performance_mode: data.performance_mode ?? true,
          default_niki_mode: data.default_niki_mode ?? false,
        });
      }

      setSyncState("saved");
      setLoading(false);
    };

    void fetchSettings();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      void fetchSettings(nextSession);
    });

    const handleFocus = () => {
      if (mounted) void fetchSettings();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, [router]);

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  const persistSettings = async (
    patch: Partial<PersistedSettings>,
    successMessage = hasSession ? "Saved" : "Saved On This Device"
  ) => {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    writeLocalGeneralSettings({
      theme_accent: nextSettings.theme_accent,
      compact_mode: nextSettings.compact_mode,
      cmd_enter_to_send: nextSettings.cmd_enter_to_send,
    });
    writeLocalPersonalizationSettings({
      ...readLocalPersonalizationSettings(),
      default_niki_mode: nextSettings.default_niki_mode,
    });

    if (!hasSession) {
      setSyncState("local");
      showStatus(successMessage);
      return;
    }

    setSyncState("saving");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setHasSession(false);
        setSyncState("local");
        showStatus("Saved On This Device");
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          theme_accent: nextSettings.theme_accent,
          compact_mode: nextSettings.compact_mode,
          cmd_enter_to_send: nextSettings.cmd_enter_to_send,
          performance_mode: nextSettings.performance_mode,
          default_niki_mode: nextSettings.default_niki_mode,
        })
        .eq('id', session.user.id);

      if (error) {
        console.error("Supabase Error:", error);
        setSyncState("local");
        showStatus(`Sync Failed: ${error.message}`);
        return;
      }

      setSyncState("saved");
      showStatus(successMessage);
    } finally {
      // syncState carries the visible save status.
    }
  };

  const isGreen = settings.theme_accent === 'green';
  const isAmber = settings.theme_accent === 'amber';

  const accentText = isGreen
    ? 'text-green-400'
    : isAmber
      ? 'text-amber-400'
      : 'text-cyan-400';

  const accentBg = isGreen
    ? 'bg-green-500'
    : isAmber
      ? 'bg-amber-500'
      : 'bg-cyan-500';

  const selectionClass = isGreen
    ? 'selection:bg-green-500/30'
    : isAmber
      ? 'selection:bg-amber-500/30'
      : 'selection:bg-cyan-500/30';

  const loadingText = isGreen
    ? 'text-green-400'
    : isAmber
      ? 'text-amber-400'
      : 'text-cyan-500';

  const shadowClass = isGreen
    ? 'shadow-[0_0_10px_rgba(34,197,94,0.3)]'
    : isAmber
      ? 'shadow-[0_0_10px_rgba(245,158,11,0.3)]'
      : 'shadow-[0_0_10px_rgba(34,211,238,0.3)]';
  const syncBadgeText =
    syncState === "saving"
      ? "Saving..."
      : syncState === "local"
        ? "Saved locally"
        : "Cloud synced";
  const syncBadgeClass =
    syncState === "saving"
      ? `${accentBg} text-black`
      : syncState === "local"
        ? "border border-amber-500/20 bg-amber-500/10 text-amber-300"
        : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300";

  if (loading) {
    return (
      <div className={`min-h-screen bg-black flex items-center justify-center ${loadingText} font-mono text-[10px] uppercase tracking-widest animate-pulse`}>
        Accessing Core Config...
      </div>
    );
  }

  return (
    <main className={`min-h-screen bg-black text-white p-6 font-sans ${selectionClass} relative`}>
      {status && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-2 ${accentBg} text-black text-[9px] font-black uppercase rounded-full shadow-lg animate-in fade-in zoom-in duration-300`}>
          {status}
        </div>
      )}

      <div className="max-w-2xl mx-auto pt-16">
        <header className="mb-12">
          <h1 className="text-3xl font-black uppercase tracking-tighter italic">
            General<span className={accentText}>Settings</span>
          </h1>
          <p className="text-slate-600 text-[10px] font-mono uppercase tracking-[0.2em] mt-2">
            Optimize the Command Center
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${syncBadgeClass}`}>
              {syncBadgeText}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
              {hasSession ? "Cloud" : "Local"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
              Auto-save active
            </span>
          </div>
        </header>

        <div className="bg-[#080808] border border-white/5 rounded-[3rem] p-10 space-y-12 shadow-2xl">
          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">
              Interface
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-3xl group transition-all hover:border-white/10">
                <div>
                  <span className="text-xs font-bold text-slate-200">Accent Color</span>
                  <p className="text-[8px] text-slate-600 uppercase mt-1 italic">
                    Current: {settings.theme_accent}
                  </p>
                </div>
                <div className="flex gap-3">
                  {['cyan', 'green', 'amber'].map((color) => (
                    <button
                      key={color}
                      onClick={() =>
                        void persistSettings({ theme_accent: color as PersistedSettings["theme_accent"] }, "Accent updated")
                      }
                      className={`w-5 h-5 rounded-full border-2 transition-all ${
                        settings.theme_accent === color
                          ? 'border-white scale-110'
                          : 'border-transparent opacity-50 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor:
                          color === 'cyan' ? '#22d3ee' :
                          color === 'green' ? '#4ade80' :
                          '#fbbf24'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                <span className="text-xs font-bold text-slate-200">Compact View</span>
                <button
                  onClick={() =>
                    void persistSettings(
                      { compact_mode: !settings.compact_mode },
                      settings.compact_mode ? "Compact view off" : "Compact view on"
                    )
                  }
                  className={`w-12 h-6 rounded-full relative transition-all ${
                    settings.compact_mode ? `${accentBg} ${shadowClass}` : 'bg-zinc-800'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    settings.compact_mode ? 'right-1' : 'left-1'
                  }`}></div>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">
              Interaction
            </h3>
            <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
              <div>
                <span className="text-xs font-bold text-slate-200">Default Chat Mode</span>
                <p className="text-[8px] text-slate-600 uppercase mt-1">
                  Applies only when a fresh chat starts
                </p>
              </div>
              <div className="flex items-center rounded-full border border-white/10 bg-[#0b0b0b]/95 p-1 shadow-2xl backdrop-blur">
                <button
                  type="button"
                  onClick={() =>
                    void persistSettings({ default_niki_mode: false }, "Mode updated")
                  }
                  className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all ${
                    !settings.default_niki_mode ? "bg-white/10 text-white" : "text-slate-600 hover:text-white"
                  }`}
                >
                  Pure Logic
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void persistSettings({ default_niki_mode: true }, "Mode updated")
                  }
                  className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all ${
                    settings.default_niki_mode ? `${accentText} bg-white/[0.06]` : "text-slate-600 hover:text-white"
                  }`}
                >
                  Nemanja Mode
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
              <div>
                <span className="text-xs font-bold text-slate-200">Ctrl / Cmd + Enter to Send</span>
                <p className="text-[8px] text-slate-600 uppercase mt-1">
                  Enter makes a new line unless you use the shortcut
                </p>
              </div>
              <button
                onClick={() =>
                  void persistSettings(
                    { cmd_enter_to_send: !settings.cmd_enter_to_send },
                    settings.cmd_enter_to_send ? "Send shortcut off" : "Send shortcut on"
                  )
                }
                className={`w-12 h-6 rounded-full relative transition-all ${
                  settings.cmd_enter_to_send ? accentBg : 'bg-zinc-800'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  settings.cmd_enter_to_send ? 'right-1' : 'left-1'
                }`}></div>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">
              System Info
            </h3>
            <div className="p-6 bg-[#050505] border border-white/5 rounded-3xl flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-400">CORE_VERSION</span>
                <span className={`text-xs font-black ${accentText}`}>Niki-v2.5.4-STABLE</span>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-mono text-slate-600 block uppercase italic">Hardware Sync</span>
                <span className="text-[10px] font-black text-green-500 uppercase tracking-tighter">RTX ACTIVE</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t border-white/5">
            <button
              onClick={() => router.push('/settings')}
              className="flex-1 py-4 text-[9px] font-black uppercase text-slate-600 hover:text-white transition-all"
            >
              Back
            </button>
            <div className={`flex-[2] rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 text-right text-[9px] font-black uppercase tracking-widest ${accentText}`}>
              Auto-Save Active
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
