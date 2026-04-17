"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function GeneralSettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState({
    theme_accent: 'cyan',
    compact_mode: false,
    cmd_enter_to_send: false,
    performance_mode: true
  });

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');

      const { data, error } = await supabase
        .from('profiles')
        .select('theme_accent, compact_mode, cmd_enter_to_send, performance_mode')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.log("General settings fetch error:", error);
      }

      if (data) {
        setSettings(data);
      }

      setLoading(false);
    };

    fetchSettings();
  }, [router]);

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  const handleApply = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return showStatus("Auth Session Lost");

    const { error } = await supabase
      .from('profiles')
      .update(settings)
      .eq('id', session.user.id);

    if (error) {
      console.error("Supabase Error:", error);
      showStatus(`Sync Failed: ${error.message}`);
    } else {
      localStorage.setItem('theme_accent', settings.theme_accent);
      showStatus("System Optimized");
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

  const accentHoverBg = isGreen
    ? 'hover:bg-green-400'
    : isAmber
      ? 'hover:bg-amber-400'
      : 'hover:bg-cyan-400';

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
                      onClick={() => setSettings({ ...settings, theme_accent: color })}
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
                  onClick={() => setSettings({ ...settings, compact_mode: !settings.compact_mode })}
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
                <span className="text-xs font-bold text-slate-200">Cmd + Enter to Send</span>
                <p className="text-[8px] text-slate-600 uppercase mt-1">Recommended for code blocks</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, cmd_enter_to_send: !settings.cmd_enter_to_send })}
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
            <button
              onClick={handleApply}
              className={`flex-[2] bg-white ${accentHoverBg} text-black py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all shadow-xl`}
            >
              Apply Settings
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}