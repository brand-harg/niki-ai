"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// --- ICONS ---
const LockIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

type ActiveTab = "profile" | "security" | "data";

type ProfileData = {
  first_name: string;
  username: string;
  avatar_url: string;
  two_factor_enabled: boolean;
  is_searchable: boolean;
  share_usage_data: boolean;
  train_on_data: boolean;
  current_unit: string;
  logic_feedback_opt_in: boolean;
  theme_accent?: string;
};

export default function ProfilePage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileData>({
    first_name: "",
    username: "",
    avatar_url: "",
    two_factor_enabled: false,
    is_searchable: true,
    share_usage_data: true,
    train_on_data: false,
    current_unit: "",
    logic_feedback_opt_in: true,
    theme_accent: "cyan",
  });

  useEffect(() => {
    fetchVaultData();
  }, []);

  const isGreen = profile.theme_accent === "green";
  const isAmber = profile.theme_accent === "amber";

  const accentText = isGreen
    ? "text-green-400"
    : isAmber
      ? "text-amber-400"
      : "text-cyan-400";

  const accentTextSoft = isGreen
    ? "text-green-500"
    : isAmber
      ? "text-amber-500"
      : "text-cyan-500";

  const accentBg = isGreen
    ? "bg-green-500"
    : isAmber
      ? "bg-amber-500"
      : "bg-cyan-500";

  const accentHoverBg = isGreen
    ? "hover:bg-green-400"
    : isAmber
      ? "hover:bg-amber-400"
      : "hover:bg-cyan-400";

  const accentBorderSoft = isGreen
    ? "border-green-500/10"
    : isAmber
      ? "border-amber-500/10"
      : "border-cyan-500/10";

  const accentBgSoft = isGreen
    ? "bg-green-500/[0.03]"
    : isAmber
      ? "bg-amber-500/[0.03]"
      : "bg-cyan-500/[0.03]";

  const accentFocusBorder = isGreen
    ? "focus:border-green-500/40"
    : isAmber
      ? "focus:border-amber-500/40"
      : "focus:border-cyan-500/40";

  const accentFocusBorderStrong = isGreen
    ? "focus:border-green-500/50"
    : isAmber
      ? "focus:border-amber-500/50"
      : "focus:border-cyan-500/50";

  const accentShadow = isGreen
    ? "shadow-[0_0_30px_rgba(34,197,94,0.4)]"
    : isAmber
      ? "shadow-[0_0_30px_rgba(245,158,11,0.4)]"
      : "shadow-[0_0_30px_rgba(6,182,212,0.4)]";

  const toggleShadow = isGreen
    ? "shadow-[0_0_15px_rgba(34,197,94,0.3)]"
    : isAmber
      ? "shadow-[0_0_15px_rgba(245,158,11,0.3)]"
      : "shadow-[0_0_15px_rgba(6,182,212,0.3)]";

  const selectionClass = isGreen
    ? "selection:bg-green-500/30"
    : isAmber
      ? "selection:bg-amber-500/30"
      : "selection:bg-cyan-500/30";

  const loadingText = isGreen
    ? "text-green-500"
    : isAmber
      ? "text-amber-500"
      : "text-cyan-500";

  const showStatus = (msg: string) => {
    setVaultStatus(msg);
    setTimeout(() => setVaultStatus(null), 3000);
  };

  const fetchVaultData = async () => {
    try {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);

      if (!session) {
        router.push("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profileError) {
        console.log("Profile fetch error:", profileError);
        showStatus("Profile Load Failed");
      }

      if (profileData) {
        setProfile({
          first_name: profileData.first_name || "",
          username: profileData.username || "",
          avatar_url: profileData.avatar_url || "",
          two_factor_enabled: profileData.two_factor_enabled ?? false,
          is_searchable: profileData.is_searchable ?? true,
          share_usage_data: profileData.share_usage_data ?? true,
          train_on_data: profileData.train_on_data ?? false,
          current_unit: profileData.current_unit || "",
          logic_feedback_opt_in: profileData.logic_feedback_opt_in ?? true,
          theme_accent: profileData.theme_accent || "cyan",
        });
      }
    } catch (error) {
      console.error("Fetch vault data error:", error);
      showStatus("Load Failed");
    } finally {
      setLoading(false);
    }
  };

  const uploadAvatar = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    try {
      setUploading(true);

      if (!session?.user?.id) {
        showStatus("No Session Found");
        return;
      }

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `${session.user.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("Avatars")
        .upload(filePath, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        showStatus("Upload Failed");
        return;
      }

      const { data } = supabase.storage.from("Avatars").getPublicUrl(filePath);

      if (data?.publicUrl) {
        setProfile((prev) => ({
          ...prev,
          avatar_url: data.publicUrl,
        }));
        showStatus("Avatar Synced");
      } else {
        showStatus("Upload Failed");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      showStatus("Upload Failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSync = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        showStatus("No Session Found");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          two_factor_enabled: profile.two_factor_enabled,
          is_searchable: profile.is_searchable,
          share_usage_data: profile.share_usage_data,
          train_on_data: profile.train_on_data,
          current_unit: profile.current_unit,
          logic_feedback_opt_in: profile.logic_feedback_opt_in,
        })
        .eq("id", session.user.id);

      if (error) {
        console.error("Sync error:", error);
        showStatus("Sync Error");
      } else {
        showStatus("Vault Synced Successfully");
        fetchVaultData();
      }
    } catch (error) {
      console.error("Handle sync error:", error);
      showStatus("Sync Error");
    }
  };

  const handlePasswordReset = async () => {
    try {
      const email = session?.user?.email;

      if (!email) {
        showStatus("No Email Found");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        console.error("Password reset error:", error);
        showStatus("Reset Failed");
      } else {
        showStatus("Reset Link Sent");
      }
    } catch (error) {
      console.error("Password reset catch error:", error);
      showStatus("Reset Failed");
    }
  };

  const handleDeleteAccount = async () => {
    if (
      confirm("CRITICAL: This will wipe your history and transcripts. Continue?")
    ) {
      showStatus("Wipe Request Sent");
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-black flex items-center justify-center ${loadingText} font-mono text-[10px] uppercase tracking-[0.3em] animate-pulse`}>
        Decrypting Vault...
      </div>
    );
  }

  return (
    <main className={`min-h-screen bg-black text-white p-6 font-sans antialiased ${selectionClass} relative`}>
      {vaultStatus && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-2 ${accentBg} text-black text-[9px] font-black uppercase tracking-widest rounded-full ${accentShadow} animate-in fade-in zoom-in duration-300`}>
          {vaultStatus}
        </div>
      )}

      <div className="max-w-2xl mx-auto pt-12">
        <div className="flex justify-center gap-8 mb-12 border-b border-white/5 pb-4">
          {["profile", "security", "data"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as ActiveTab)}
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                activeTab === tab
                  ? accentText
                  : "text-slate-600 hover:text-slate-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="bg-[#080808] border border-white/5 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
          {activeTab === "profile" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col items-center gap-6">
                <div className="relative group w-28 h-28">
                  <div className="w-full h-full rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt="Profile avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl font-black text-slate-800">
                        {(profile.first_name?.[0] ||
                          profile.username?.[0] ||
                          "U").toUpperCase()}
                      </span>
                    )}
                  </div>

                  <label className="absolute inset-0 flex items-center justify-center bg-black/80 opacity-0 group-hover:opacity-100 transition-all rounded-full cursor-pointer text-[9px] font-black uppercase tracking-widest backdrop-blur-sm">
                    {uploading ? "Syncing..." : "Update"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={uploadAvatar}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="text-center">
                  <h2 className="text-xl font-black uppercase tracking-tight">
                    {profile.first_name || "New User"}
                  </h2>
                  <p className={`text-[10px] ${accentTextSoft} font-black uppercase tracking-[0.2em]`}>
                    @{profile.username || "vault"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-4">
                    Display Name
                  </label>
                  <input
                    value={profile.first_name}
                    onChange={(e) =>
                      setProfile({ ...profile, first_name: e.target.value })
                    }
                    placeholder="Enter your name"
                    className={`w-full bg-white/[0.03] border border-white/5 rounded-2xl py-4 px-6 text-sm ${accentFocusBorder} transition-all outline-none text-white`}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-4">
                    Username
                  </label>
                  <div className="relative">
                    <span className={`absolute left-6 top-1/2 -translate-y-1/2 ${accentTextSoft}/30 font-bold text-sm`}>
                      @
                    </span>
                    <input
                      value={profile.username}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          username: e.target.value
                            .toLowerCase()
                            .replace(/\s/g, ""),
                        })
                      }
                      placeholder="username"
                      className={`w-full bg-white/[0.03] border border-white/5 rounded-2xl py-4 pl-10 pr-6 text-sm ${accentFocusBorder} transition-all outline-none text-white`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                <div>
                  <h3 className="text-sm font-bold">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                    Extra layer for transcript protection
                  </p>
                </div>

                <button
                  onClick={() =>
                    setProfile({
                      ...profile,
                      two_factor_enabled: !profile.two_factor_enabled,
                    })
                  }
                  className={`w-12 h-6 rounded-full relative transition-all ${
                    profile.two_factor_enabled
                      ? `${accentBg} ${toggleShadow}`
                      : "bg-zinc-800"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                      profile.two_factor_enabled ? "right-1" : "left-1"
                    }`}
                  ></div>
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-4">
                  Credentials
                </h3>

                <button
                  onClick={handlePasswordReset}
                  className="w-full flex items-center justify-between p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] group transition-all"
                >
                  <span className="text-xs font-bold text-slate-400 group-hover:text-white">
                    Request Password Reset
                  </span>
                  <LockIcon />
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-4">
                  Access History
                </h3>

                <div className="space-y-2">
                  <p className="text-center text-[9px] text-slate-700 uppercase py-4">
                    Logs temporarily disabled
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "data" && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={`p-6 ${accentBgSoft} border ${accentBorderSoft} rounded-[2rem] space-y-4`}>
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-tight text-white">
                      Improve the model for everyone
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed italic">
                      Allow content to be used to train models, making NikiAi
                      faster for your math queries.
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      setProfile({
                        ...profile,
                        train_on_data: !profile.train_on_data,
                      })
                    }
                    className={`w-12 h-6 rounded-full flex-shrink-0 relative transition-all ${
                      profile.train_on_data
                        ? `${accentBg} ${toggleShadow}`
                        : "bg-zinc-800"
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                        profile.train_on_data ? "right-1" : "left-1"
                      }`}
                    ></div>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-4">
                  Academic Sync
                </h4>

                <div className="space-y-4 p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-slate-700 tracking-widest ml-2 italic">
                      Current Math Unit (e.g. 4.2)
                    </label>
                    <input
                      value={profile.current_unit}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          current_unit: e.target.value,
                        })
                      }
                      className={`w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-xs ${accentFocusBorderStrong} outline-none transition-all text-white`}
                      placeholder="Priority: Saturday Uploads"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-4">
                  Privacy & Discovery
                </h4>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-all rounded-2xl group border border-transparent hover:border-white/5">
                    <div>
                      <span className="text-xs font-bold text-slate-300 group-hover:text-white">
                        Public Discovery
                      </span>
                      <p className="text-[8px] text-slate-600 uppercase mt-1">
                        Classmates can find your vault
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={profile.is_searchable}
                      onChange={() =>
                        setProfile({
                          ...profile,
                          is_searchable: !profile.is_searchable,
                        })
                      }
                      className={`w-4 h-4 ${isGreen ? "accent-green-500" : isAmber ? "accent-amber-500" : "accent-cyan-500"} bg-zinc-900 border-white/10`}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-all rounded-2xl group border border-transparent hover:border-white/5">
                    <div>
                      <span className="text-xs font-bold text-slate-300 group-hover:text-white">
                        Usage Logs
                      </span>
                      <p className="text-[8px] text-slate-600 uppercase mt-1 italic">
                        Anonymous logic gaps improve Nemanja Mode
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={profile.share_usage_data}
                      onChange={() =>
                        setProfile({
                          ...profile,
                          share_usage_data: !profile.share_usage_data,
                        })
                      }
                      className={`w-4 h-4 ${isGreen ? "accent-green-500" : isAmber ? "accent-amber-500" : "accent-cyan-500"} bg-zinc-900 border-white/10`}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h4 className="text-[9px] font-black uppercase text-red-500/50 tracking-[0.2em] mb-4 ml-4">
                  Danger Zone
                </h4>

                <div className="p-6 bg-red-500/[0.02] border border-red-500/10 rounded-3xl space-y-4">
                  <p className="text-[10px] text-slate-500 leading-relaxed italic uppercase">
                    Account termination is permanent. Wipes all math data.
                  </p>

                  <button
                    onClick={handleDeleteAccount}
                    className="w-full p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all"
                  >
                    Terminate Account
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4 mt-12 pt-8 border-t border-white/5">
            <button
              onClick={() => router.push("/")}
              className="flex-1 py-4 text-[9px] font-black uppercase text-slate-600 hover:text-white transition-all outline-none"
            >
              Vault Exit
            </button>

            <button
              onClick={handleSync}
              className={`flex-[2] bg-white ${accentHoverBg} text-black py-4 rounded-2xl font-black uppercase text-[9px] tracking-[0.2em] transition-all shadow-xl outline-none`}
            >
              Sync Vault Changes
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}