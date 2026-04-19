"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Image from "next/image";

// --- ICONS ---
const SparkleIcon = ({ accentGroupHoverText }: { accentGroupHoverText: string }) => (
  <svg className={`w-5 h-5 text-slate-400 ${accentGroupHoverText} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M5 3V1m14 2V1M5 21v-2m14 2v-2M2 12h2m16 0h2M7 7l1.5 1.5M15.5 8.5L17 7M7 17l1.5-1.5m7 5.5l1.5-1.5" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

const UserIcon = ({ accentGroupHoverText }: { accentGroupHoverText: string }) => (
  <svg className={`w-5 h-5 text-slate-400 ${accentGroupHoverText} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={2} />
    <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" strokeWidth={2} />
  </svg>
);

const GearIcon = ({ accentGroupHoverText }: { accentGroupHoverText: string }) => (
  <svg className={`w-5 h-5 text-slate-400 ${accentGroupHoverText} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth={2} />
    <circle cx="12" cy="12" r="3" strokeWidth={2} />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-5 h-5 text-slate-400 group-hover:text-red-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth={2} />
  </svg>
);

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{
    first_name?: string;
    username?: string;
    avatar_url?: string;
    theme_accent?: "cyan" | "green" | "amber";
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return router.push('/login');
      fetchProfile(session.user.id);
    });
  }, [router]);

  const fetchProfile = async (id: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, username, subscription_tier, avatar_url, theme_accent')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.log("Settings menu profile fetch error:", error);
      return;
    }

    if (data) setProfile(data);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isGreen = profile?.theme_accent === 'green';
  const isAmber = profile?.theme_accent === 'amber';

  const accentText = isGreen
    ? 'text-green-400'
    : isAmber
      ? 'text-amber-400'
      : 'text-cyan-400';

  const accentBg = isGreen
    ? 'bg-green-600'
    : isAmber
      ? 'bg-amber-500'
      : 'bg-cyan-600';

  const accentHoverText = isGreen
    ? 'hover:text-green-400'
    : isAmber
      ? 'hover:text-amber-400'
      : 'hover:text-cyan-400';

  const accentGroupHoverText = isGreen
    ? 'group-hover:text-green-400'
    : isAmber
      ? 'group-hover:text-amber-400'
      : 'group-hover:text-cyan-400';

  const selectionClass = isGreen
    ? 'selection:bg-green-500/30'
    : isAmber
      ? 'selection:bg-amber-500/30'
      : 'selection:bg-cyan-500/30';

  return (
    <main className={`min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4 font-sans text-white ${selectionClass}`}>
      <div className="w-full max-w-[320px] bg-[#171717] rounded-3xl border border-white/5 shadow-2xl overflow-hidden p-2 flex flex-col gap-1">

        {/* User Card */}
        <div className="flex items-center gap-3 p-3 mb-2">
          <div className={`relative w-10 h-10 rounded-full ${accentBg} flex-shrink-0 flex items-center justify-center font-black text-xs text-white overflow-hidden border border-white/10 shadow-lg`}>
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt="User" fill className="object-cover" />) : (
              (profile?.first_name?.[0] || profile?.username?.[0] || 'U').toUpperCase()
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-white truncate">
              {profile?.first_name || "New User"}
            </span>
            <span className={`text-[9px] ${accentText} font-black uppercase tracking-[0.2em] truncate`}>
              @{profile?.username || "vault"}
            </span>
          </div>
        </div>

        <div className="h-px bg-white/5 mx-2 mb-2" />

        <button
          onClick={() => router.push('/personalization')}
          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-slate-200 text-sm transition-all group outline-none"
        >
          <SparkleIcon accentGroupHoverText={accentGroupHoverText} />
          <span className="group-hover:text-white transition-colors">Personalization</span>
        </button>

        <button
          onClick={() => router.push('/profile')}
          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-slate-200 text-sm transition-all group outline-none"
        >
          <UserIcon accentGroupHoverText={accentGroupHoverText} />
          <span className="group-hover:text-white transition-colors">Profile & Security</span>
        </button>

        <button
          onClick={() => router.push('/settings/general')}
          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-slate-200 text-sm transition-all group outline-none"
        >
          <GearIcon accentGroupHoverText={accentGroupHoverText} />
          <span className="group-hover:text-white transition-colors">General Settings</span>
        </button>

        <div className="h-px bg-white/5 mx-2 my-1" />

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 text-sm transition-all group outline-none"
        >
          <LogoutIcon />
          <span>Log out</span>
        </button>

        <button
          onClick={() => router.push('/')}
          className={`mt-4 text-[9px] font-black uppercase text-slate-700 ${accentHoverText} text-center py-2 transition-colors tracking-widest outline-none`}
        >
          Exit System
        </button>
      </div>
    </main>
  );
}