"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  DEFAULT_GENERAL_SETTINGS,
  readLocalGeneralSettings,
  writeLocalGeneralSettings,
} from "@/lib/generalSettings";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  readLocalPersonalizationSettings,
  writeLocalPersonalizationSettings,
} from "@/lib/personalization";

const LOCAL_TRAINING_CONSENT_KEY = "niki_local_train_on_data";
const CURRENT_CHAT_MODE_STORAGE_KEY = "niki_current_chat_mode";
const CURRENT_SESSION_SNAPSHOT_STORAGE_KEY = "niki_current_session_snapshot";
const LAST_ARTIFACT_PANEL_STORAGE_KEY = "niki_last_artifact_panel";
const PENDING_HOME_ACTION_STORAGE_KEY = "niki_pending_home_action";

type ProfileState = {
  first_name?: string;
  username?: string;
  avatar_url?: string;
  theme_accent?: "cyan" | "green" | "amber";
  train_on_data?: boolean;
  about_user?: string;
  response_style?: string;
  default_niki_mode?: boolean;
};

type SessionSnapshot = {
  course?: string;
  topic?: string;
  mode?: string;
};

// --- ICONS ---
const SparkleIcon = ({ accentGroupHoverText }: { accentGroupHoverText: string }) => (
  <svg className={`h-5 w-5 text-slate-400 ${accentGroupHoverText} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M5 3V1m14 2V1M5 21v-2m14 2v-2M2 12h2m16 0h2M7 7l1.5 1.5M15.5 8.5L17 7M7 17l1.5-1.5m7 5.5l1.5-1.5" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

const UserIcon = ({ accentGroupHoverText }: { accentGroupHoverText: string }) => (
  <svg className={`h-5 w-5 text-slate-400 ${accentGroupHoverText} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={2} />
    <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" strokeWidth={2} />
  </svg>
);

const GearIcon = ({ accentGroupHoverText }: { accentGroupHoverText: string }) => (
  <svg className={`h-5 w-5 text-slate-400 ${accentGroupHoverText} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth={2} />
    <circle cx="12" cy="12" r="3" strokeWidth={2} />
  </svg>
);

const LogoutIcon = () => (
  <svg className="h-5 w-5 text-slate-400 transition-colors group-hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth={2} />
  </svg>
);

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [localGeneralSettings, setLocalGeneralSettings] = useState(DEFAULT_GENERAL_SETTINGS);
  const [localPersonalization, setLocalPersonalization] = useState(
    DEFAULT_PERSONALIZATION_SETTINGS
  );
  const [localTrainConsent, setLocalTrainConsent] = useState(false);
  const [localDefaultMode, setLocalDefaultMode] = useState(
    DEFAULT_PERSONALIZATION_SETTINGS.default_niki_mode
  );
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot | null>(null);
  const [currentModeLabel, setCurrentModeLabel] = useState("Pure Logic");
  const [hasSavedArtifact, setHasSavedArtifact] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"saved" | "saving" | "local" | "error">("saved");
  const avatarUrl = resolveAvatarUrl(profile?.avatar_url);

  const showStatus = useCallback((message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 2200);
  }, []);

  const loadLocalState = useCallback(() => {
    const nextLocalGeneralSettings = readLocalGeneralSettings();
    const nextLocalPersonalization = readLocalPersonalizationSettings();
    setLocalGeneralSettings(nextLocalGeneralSettings);
    setLocalPersonalization(nextLocalPersonalization);
    setLocalDefaultMode(nextLocalPersonalization.default_niki_mode);
    setLocalTrainConsent(window.localStorage.getItem(LOCAL_TRAINING_CONSENT_KEY) === "true");
    setCurrentModeLabel(
      window.localStorage.getItem(CURRENT_CHAT_MODE_STORAGE_KEY) || "Pure Logic"
    );
    try {
      const rawSnapshot = window.localStorage.getItem(CURRENT_SESSION_SNAPSHOT_STORAGE_KEY);
      setSessionSnapshot(rawSnapshot ? (JSON.parse(rawSnapshot) as SessionSnapshot) : null);
    } catch {
      setSessionSnapshot(null);
    }
    setHasSavedArtifact(!!window.localStorage.getItem(LAST_ARTIFACT_PANEL_STORAGE_KEY));
  }, []);

  const fetchProfile = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "first_name, username, avatar_url, theme_accent, train_on_data, about_user, response_style, default_niki_mode"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.log("Settings menu profile fetch error:", error);
      return;
    }

    if (data) setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      loadLocalState();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        setHasSession(false);
        setSyncState("local");
        setLoading(false);
        return;
      }

      setHasSession(true);
      await fetchProfile(session.user.id);
      if (mounted) setSyncState("saved");
      if (mounted) setLoading(false);
    };

    run();

    const handleFocus = () => loadLocalState();
    window.addEventListener("focus", handleFocus);
    return () => {
      mounted = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchProfile, loadLocalState]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const effectiveTheme = profile?.theme_accent ?? localGeneralSettings.theme_accent;
  const isGreen = effectiveTheme === "green";
  const isAmber = effectiveTheme === "amber";

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

  const accentHoverText = isGreen
    ? "hover:text-green-400"
    : isAmber
      ? "hover:text-amber-400"
      : "hover:text-cyan-400";

  const accentGroupHoverText = isGreen
    ? "group-hover:text-green-400"
    : isAmber
      ? "group-hover:text-amber-400"
      : "group-hover:text-cyan-400";

  const selectionClass = isGreen
    ? "selection:bg-green-500/30"
    : isAmber
      ? "selection:bg-amber-500/30"
      : "selection:bg-cyan-500/30";

  const personalizationActive = useMemo(() => {
    const aboutUser = profile?.about_user ?? localPersonalization.about_user;
    const responseStyle = profile?.response_style ?? localPersonalization.response_style;
    return Boolean(aboutUser.trim() || responseStyle.trim());
  }, [
    localPersonalization.about_user,
    localPersonalization.response_style,
    profile?.about_user,
    profile?.response_style,
  ]);

  const trainingEnabled = profile?.train_on_data ?? localTrainConsent;
  const defaultModeEnabled = profile?.default_niki_mode ?? localDefaultMode;
  const syncBadgeText =
    syncState === "saving"
      ? "Saving..."
      : syncState === "error"
        ? "Save issue"
        : syncState === "local"
          ? "Saved locally"
          : "Cloud synced";
  const syncBadgeClass =
    syncState === "saving"
      ? `${accentBg} text-black`
      : syncState === "error"
        ? "border border-rose-500/20 bg-rose-500/10 text-rose-300"
        : syncState === "local"
          ? "border border-amber-500/20 bg-amber-500/10 text-amber-300"
          : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300";

  const persistProfilePatch = useCallback(
    async (
      patch: Partial<ProfileState>,
      localFallback?: () => void,
      successMessage = "Saved"
    ) => {
      if (!hasSession) {
        localFallback?.();
        setSyncState("local");
        showStatus("Saved");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setHasSession(false);
        localFallback?.();
        setSyncState("local");
        showStatus("Saved locally");
        return;
      }

      setSyncState("saving");
      setProfile((prev) => ({ ...(prev ?? {}), ...patch }));
      localFallback?.();

      const { error } = await supabase.from("profiles").update(patch).eq("id", session.user.id);
      if (error) {
        console.error("Settings patch failed:", error);
        setSyncState("error");
        showStatus(`Save failed: ${error.message}`);
        return;
      }

      setSyncState("saved");
      showStatus(successMessage);
    },
    [hasSession, showStatus]
  );

  const handleDefaultModeToggle = async (nextValue: boolean) => {
    await persistProfilePatch(
      { default_niki_mode: nextValue },
      () => {
        const local = readLocalPersonalizationSettings();
        const nextLocal = { ...local, default_niki_mode: nextValue };
        writeLocalPersonalizationSettings(nextLocal);
        setLocalPersonalization(nextLocal);
        setLocalDefaultMode(nextValue);
      },
      "Mode updated"
    );
  };

  const handleTrainingToggle = async (nextValue: boolean) => {
    await persistProfilePatch(
      { train_on_data: nextValue },
      () => {
        window.localStorage.setItem(LOCAL_TRAINING_CONSENT_KEY, String(nextValue));
        setLocalTrainConsent(nextValue);
      },
      "Saved"
    );
  };

  const handleQuickHomeAction = (action: "new-chat" | "open-artifact", notice: string) => {
    window.localStorage.setItem(PENDING_HOME_ACTION_STORAGE_KEY, action);
    showStatus(notice);
    router.push("/");
  };

  const handleResetSettings = async () => {
    if (
      !window.confirm(
        "Reset personalization, general settings, and menu toggles back to their defaults?"
      )
    ) {
      return;
    }

    writeLocalGeneralSettings(DEFAULT_GENERAL_SETTINGS);
    writeLocalPersonalizationSettings(DEFAULT_PERSONALIZATION_SETTINGS);
    window.localStorage.setItem(LOCAL_TRAINING_CONSENT_KEY, "false");
    setLocalGeneralSettings(DEFAULT_GENERAL_SETTINGS);
    setLocalPersonalization(DEFAULT_PERSONALIZATION_SETTINGS);
    setLocalTrainConsent(false);
    setLocalDefaultMode(false);

    if (hasSession) {
      setSyncState("saving");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const { error } = await supabase
          .from("profiles")
          .update({
            theme_accent: DEFAULT_GENERAL_SETTINGS.theme_accent,
            compact_mode: DEFAULT_GENERAL_SETTINGS.compact_mode,
            cmd_enter_to_send: DEFAULT_GENERAL_SETTINGS.cmd_enter_to_send,
            default_niki_mode: false,
            train_on_data: false,
            about_user: "",
            response_style: "",
          })
          .eq("id", session.user.id);

        if (error) {
          console.error("Reset settings failed:", error);
          setSyncState("error");
          showStatus(`Reset failed: ${error.message}`);
          return;
        }
      }
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            theme_accent: DEFAULT_GENERAL_SETTINGS.theme_accent,
            train_on_data: false,
            default_niki_mode: false,
            about_user: "",
            response_style: "",
          }
        : prev
    );
    setSyncState(hasSession ? "saved" : "local");
    showStatus("Settings reset");
  };

  const sessionSummary = sessionSnapshot?.topic?.trim()
    ? `${sessionSnapshot.course ?? "Course"} • ${sessionSnapshot.topic}`
    : "No active topic";

  const navButtonClass = (isActive: boolean) =>
    `group flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-200 outline-none transition-all duration-200 ${
      isActive
        ? "border border-white/10 bg-white/6 text-white shadow-[0_0_18px_rgba(255,255,255,0.04)]"
        : "border border-transparent hover:scale-[1.01] hover:bg-white/5"
    }`;

  if (loading) {
    return (
      <div className={`min-h-screen bg-[#0d0d0d] flex items-center justify-center ${accentText} font-mono text-[10px] uppercase tracking-widest animate-pulse`}>
        Accessing Control Center...
      </div>
    );
  }

  return (
    <main className={`min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4 font-sans text-white ${selectionClass}`}>
      {status && (
        <div className={`fixed top-8 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2 text-[9px] font-black uppercase tracking-widest text-black shadow-lg animate-in fade-in zoom-in duration-200 ${accentBg}`}>
          {status}
        </div>
      )}

      <div className="w-full max-w-[320px] overflow-hidden rounded-3xl border border-white/5 bg-[#171717] p-2 shadow-2xl flex flex-col gap-1">
        <div className="flex items-center gap-3 p-3 mb-1">
          <div className={`relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full ${accentBg} flex items-center justify-center border border-white/10 text-xs font-black text-white shadow-lg`}>
            {avatarUrl ? (
              <Image src={avatarUrl} alt="User" fill className="object-cover" unoptimized />
            ) : (
              (profile?.first_name?.[0] || profile?.username?.[0] || "U").toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-sm font-bold text-white">
              {profile?.first_name || "Local Settings"}
            </span>
            <span className={`truncate text-[9px] font-black uppercase tracking-[0.2em] ${accentText}`}>
              @{profile?.username || "device"}
            </span>
          </div>
        </div>

        <div className="mx-2 flex flex-wrap items-center gap-2 px-1">
          <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${syncBadgeClass}`}>
            {syncBadgeText}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
            {hasSession ? "Cloud" : "Local"}
          </span>
        </div>

        <div className="mx-2 rounded-2xl bg-white/[0.03] px-3 py-3 text-[10px] leading-5 text-slate-500">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-slate-600">Mode</span>
            <span className="text-slate-300">{currentModeLabel}</span>
            <span className="text-slate-600">Personalization</span>
            <span className="text-slate-300">{personalizationActive ? "Active" : "Not Set"}</span>
            <span className="text-slate-600">Training</span>
            <span className="text-slate-300">{trainingEnabled ? "On" : "Off"}</span>
            <span className="text-slate-600">Sync</span>
            <span className="text-slate-300">{hasSession ? "Cloud" : "Local"}</span>
          </div>
        </div>

        <div className="mx-2 mt-2 space-y-2 rounded-2xl bg-white/[0.02] px-3 py-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
              Quick Toggles
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-100">Default Mode</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-600">
                New chats start here
              </p>
            </div>
            <div className="flex items-center rounded-full border border-white/10 bg-[#0b0b0b]/95 p-1">
              <button
                type="button"
                onClick={() => void handleDefaultModeToggle(false)}
                className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all duration-200 ${
                  !defaultModeEnabled ? "bg-white/10 text-white" : "text-slate-600 hover:text-white"
                }`}
              >
                Pure
              </button>
              <button
                type="button"
                onClick={() => void handleDefaultModeToggle(true)}
                className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all duration-200 ${
                  defaultModeEnabled ? `bg-white/[0.06] ${accentText}` : "text-slate-600 hover:text-white"
                }`}
              >
                Nemanja
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-100">Improve Model</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-600">
                Consent-gated training log
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleTrainingToggle(!trainingEnabled)}
              className={`relative h-6 w-12 rounded-full transition-all duration-200 ${
                trainingEnabled ? accentBg : "bg-zinc-800"
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all duration-200 ${
                  trainingEnabled ? "right-1" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mx-2 mt-2 rounded-2xl bg-white/[0.02] px-3 py-3">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
            Current Session
          </p>
          <p className="mt-2 text-[11px] font-bold text-slate-100">{sessionSummary}</p>
          <p className={`mt-1 text-[10px] ${accentText}`}>
            {sessionSnapshot?.mode || currentModeLabel}
          </p>
        </div>

        <div className="h-px bg-white/5 mx-2 my-2" />

        <button
          onClick={() => router.push("/personalization")}
          className={navButtonClass(pathname === "/personalization")}
        >
          <SparkleIcon accentGroupHoverText={accentGroupHoverText} />
          <span className="transition-colors group-hover:text-white">Personalization</span>
        </button>

        <button
          onClick={() => router.push("/profile")}
          className={navButtonClass(pathname === "/profile")}
        >
          <UserIcon accentGroupHoverText={accentGroupHoverText} />
          <span className="transition-colors group-hover:text-white">Profile &amp; Security</span>
        </button>

        <button
          onClick={() => router.push("/settings/general")}
          className={navButtonClass(pathname === "/settings/general")}
        >
          <GearIcon accentGroupHoverText={accentGroupHoverText} />
          <span className="transition-colors group-hover:text-white">General Settings</span>
        </button>

        <div className="mx-2 mt-2 rounded-2xl bg-white/[0.02] px-3 py-3 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
            Quick Actions
          </p>
          <button
            type="button"
            onClick={() => handleQuickHomeAction("new-chat", "New chat started")}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all duration-200 hover:scale-[1.01] hover:border-white/20 hover:bg-white/[0.05]"
          >
            New Chat
          </button>
          <button
            type="button"
            disabled={!hasSavedArtifact}
            onClick={() => handleQuickHomeAction("open-artifact", "Opening artifact")}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all duration-200 hover:scale-[1.01] hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open Artifact Panel
          </button>
          <button
            type="button"
            onClick={() => void handleResetSettings()}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all duration-200 hover:scale-[1.01] hover:border-white/20 hover:bg-white/[0.05]"
          >
            Reset Settings
          </button>
        </div>

        <div className="h-px bg-white/5 mx-2 my-1" />

        {hasSession && (
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-400 outline-none transition-all duration-200 hover:scale-[1.01] hover:bg-red-500/10 hover:text-red-400"
          >
            <LogoutIcon />
            <span>Log out</span>
          </button>
        )}

        <button
          onClick={() => router.push("/")}
          className={`mt-4 py-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-700 transition-colors outline-none ${accentHoverText}`}
        >
          Exit System
        </button>
      </div>
    </main>
  );
}
