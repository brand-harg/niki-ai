"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeAccent, setThemeAccent] = useState('cyan');
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotSent, setForgotSent] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedAccent = localStorage.getItem('theme_accent');
    if (savedAccent === 'green' || savedAccent === 'amber' || savedAccent === 'cyan') {
      setThemeAccent(savedAccent);
    }
  }, []);

  const isGreen = themeAccent === 'green';
  const isAmber = themeAccent === 'amber';

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

  const accentHoverBg = isGreen
    ? 'hover:bg-green-500'
    : isAmber
      ? 'hover:bg-amber-400'
      : 'hover:bg-cyan-500';

  const accentFocusBorder = isGreen
    ? 'focus:border-green-500/50'
    : isAmber
      ? 'focus:border-amber-500/50'
      : 'focus:border-cyan-500/50';

  const topGlow = isGreen
    ? 'bg-green-500/10'
    : isAmber
      ? 'bg-amber-500/10'
      : 'bg-cyan-500/10';

  const bottomGlow = isGreen
    ? 'bg-emerald-600/10'
    : isAmber
      ? 'bg-orange-500/10'
      : 'bg-blue-600/10';

  const selectionClass = isGreen
    ? 'selection:bg-green-500/30'
    : isAmber
      ? 'selection:bg-amber-500/30'
      : 'selection:bg-cyan-500/30';

  // --- GOOGLE LOGIN ---
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` }
    });
  };

  // --- EMAIL LOGIN / SIGNUP ---
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

    if (loginError) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        alert("Check your email for a confirmation link!");
      }
    } else {
      router.push('/');
    }

    setLoading(false);
  };

  // --- FORGOT PASSWORD ---
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setForgotSent(true);
    }

    setLoading(false);
  };

  return (
    <main className={`min-h-screen bg-black flex items-center justify-center p-6 font-sans ${selectionClass}`}>
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${topGlow} rounded-full blur-[120px]`}></div>
        <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${bottomGlow} rounded-full blur-[120px]`}></div>
      </div>

      <div className="w-full max-w-md z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black tracking-tighter uppercase text-white mb-2">
            Niki<span className={accentText}>Ai</span>
          </h1>
          <p className="text-slate-500 text-sm font-mono uppercase tracking-widest">
            {mode === 'forgot' ? 'Password Recovery' : 'Vault Access Authorized'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl backdrop-blur-xl">

          {/* ── FORGOT PASSWORD MODE ── */}
          {mode === 'forgot' ? (
            forgotSent ? (
              <div className="text-center space-y-6">
                <div className={`text-4xl`}>📬</div>
                <p className="text-white font-bold text-sm">Reset link sent!</p>
                <p className="text-slate-500 text-xs">
                  Check <span className={accentText}>{email}</span> for a password reset link.
                  It may take a minute to arrive.
                </p>
                <button
                  onClick={() => { setMode('login'); setForgotSent(false); setError(null); }}
                  className={`w-full ${accentBg} ${accentHoverBg} text-white py-4 rounded-2xl font-black uppercase text-xs tracking-tighter transition-all`}
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-slate-400 text-xs text-center mb-2">
                  Enter your email and we'll send you a reset link.
                </p>
                <input
                  type="email"
                  placeholder="EMAIL ADDRESS"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white placeholder-slate-700 focus:outline-none ${accentFocusBorder} transition-all text-sm font-medium`}
                  required
                />

                {error && (
                  <p className="text-red-500 text-[10px] font-black uppercase text-center">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full ${accentBg} ${accentHoverBg} disabled:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-tighter transition-all`}
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>

                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="w-full text-slate-600 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-all pt-2"
                >
                  ← Back to Login
                </button>
              </form>
            )
          ) : (
            /* ── LOGIN / SIGNUP MODE ── */
            <>
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-200 text-black py-4 rounded-2xl font-black uppercase text-xs tracking-tighter transition-all mb-6"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest text-slate-700 bg-[#0a0a0a] px-4">
                  OR
                </div>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <input
                  type="email"
                  placeholder="EMAIL ADDRESS"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white placeholder-slate-700 focus:outline-none ${accentFocusBorder} transition-all text-sm font-medium`}
                  required
                />

                <input
                  type="password"
                  placeholder="PASSWORD"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white placeholder-slate-700 focus:outline-none ${accentFocusBorder} transition-all text-sm font-medium`}
                  required
                />

                {/* Forgot password link */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); }}
                    className={`text-[10px] font-black uppercase tracking-widest ${accentText} opacity-70 hover:opacity-100 transition-opacity`}
                  >
                    Forgot Password?
                  </button>
                </div>

                {error && (
                  <p className="text-red-500 text-[10px] font-black uppercase text-center">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full ${accentBg} ${accentHoverBg} disabled:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-tighter transition-all`}
                >
                  {loading ? "Authenticating..." : "Access System"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-slate-600 text-[10px] font-mono mt-8 uppercase tracking-widest">
          Secure Academic Environment • RVCC PRECALC V.1
        </p>
      </div>
    </main>
  );
}