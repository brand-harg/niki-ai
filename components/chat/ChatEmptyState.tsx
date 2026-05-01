"use client";

type ChatEmptyStateProps = {
  prompts: string[];
  isLoading: boolean;
  accentColor: string;
  accentBorder: string;
  onPromptClick: (prompt: string) => void;
};

export default function ChatEmptyState({
  prompts,
  isLoading,
  accentColor,
  accentBorder,
  onPromptClick,
}: ChatEmptyStateProps) {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-white/8 bg-white/[0.018] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:px-5 sm:py-4">
      <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
        Quick Start
      </p>
      <p className="text-sm font-bold text-slate-100">
        Start by asking a question or selecting a course below.
      </p>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        NikiAI helps you learn with structured notes, lecture-aware answers, and reusable study artifacts.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPromptClick(prompt)}
            disabled={isLoading}
            className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all duration-200 outline-none ${accentBorder} bg-white/[0.02] ${accentColor} hover:scale-[1.01] hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
