"use client";

type LoginGatePromptProps = {
  title: string;
  detail: string;
  accentColor: string;
  accentBorder: string;
  onClose: () => void;
  onLogin: () => void;
};

export default function LoginGatePrompt({
  title,
  detail,
  accentColor,
  accentBorder,
  onClose,
  onLogin,
}: LoginGatePromptProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Close login prompt"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Login required"
        className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-3xl border border-white/10 bg-[#090909]/98 px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:bottom-8"
      >
        <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
          Keep your progress
        </p>
        <h2 className="mt-2 text-lg font-extrabold tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {detail}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onLogin}
            className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.04] ${accentColor} hover:bg-white/[0.08]`}
          >
            Log In
          </button>
        </div>
      </div>
    </>
  );
}
