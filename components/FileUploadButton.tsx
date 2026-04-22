"use client";
import { useRef, useState } from "react";

type Props = {
  onFileSelect: (file: File) => void;
  onScreenshot: () => void;
  lectureMode?: boolean;
  onToggleLectureMode?: () => void;
  accentColor?: string;
  disabled?: boolean;
};

const ACCEPT = "image/png,image/jpeg,image/webp,text/plain,text/csv,text/calendar,text/javascript,.ts,.tsx,.py,.md,.json,.csv,.ics";

const ACCENT = {
  cyan:  { text: "text-cyan-400",  border: "border-cyan-500/30",  bg: "bg-cyan-500/10"  },
  green: { text: "text-green-400", border: "border-green-500/30", bg: "bg-green-500/10" },
  amber: { text: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10" },
};

export default function FileUploadButton({
  onFileSelect,
  onScreenshot,
  lectureMode = false,
  onToggleLectureMode,
  accentColor = "cyan",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const a = ACCENT[accentColor as keyof typeof ACCENT] ?? ACCENT.cyan;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onFileSelect(file);
    e.target.value = "";
    setOpen(false);
  };

  const handleScreenshot = () => {
    setOpen(false);
    onScreenshot();
  };

  const handleLectureToggle = () => {
    onToggleLectureMode?.();
    setOpen(false);
  };

  return (
    <div className="relative flex-shrink-0">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all outline-none border shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]
          ${open
            ? `${a.bg} ${a.border} ${a.text}`
            : "bg-white/[0.04] border-white/10 text-slate-500 hover:text-slate-300 hover:bg-white/[0.07] hover:border-white/15"
          }
          disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label="Open tools menu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            className="absolute bottom-14 left-0 z-50 w-60 bg-[#0d0d0d] border border-white/10 rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 24px 70px rgba(0,0,0,0.76), inset 0 1px 0 rgba(255,255,255,0.04)" }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                Tools
              </span>
            </div>

            {/* Options */}
            <div className="p-1.5 space-y-0.5">
              {/* Upload file */}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.055] transition-all group outline-none"
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.045] border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-white/20 transition-all">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-400">
                    <path d="M2 10v1.5A.5.5 0 002.5 12h9a.5.5 0 00.5-.5V10M7 2v7M4.5 4.5L7 2l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-[13px] font-bold text-slate-300 group-hover:text-white transition-colors">
                    Upload File
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Image, text, code, syllabus
                  </div>
                </div>
              </button>

              {/* Screenshot */}
              <button
                onClick={handleScreenshot}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.055] transition-all group outline-none"
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.045] border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-white/20 transition-all">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-400">
                    <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M5 2.5V2a1 1 0 011-1h2a1 1 0 011 1v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-[13px] font-bold text-slate-300 group-hover:text-white transition-colors">
                    Screenshot Chat
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Save as PNG
                  </div>
                </div>
              </button>

              {/* Lecture mode */}
              <button
                onClick={handleLectureToggle}
                disabled={!onToggleLectureMode}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                  lectureMode ? `${a.bg}` : "hover:bg-white/[0.055]"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all ${
                  lectureMode ? `${a.border} ${a.bg}` : "bg-white/[0.045] border-white/10 group-hover:border-white/20"
                }`}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={lectureMode ? a.text : "text-slate-400"}>
                    <path d="M2.25 2.5h3.5A1.25 1.25 0 017 3.75v7.75a1.25 1.25 0 00-1.25-1.25h-3.5V2.5zM11.75 2.5h-3.5A1.25 1.25 0 007 3.75v7.75a1.25 1.25 0 011.25-1.25h3.5V2.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-left">
                  <div className={`text-[13px] font-bold transition-colors ${lectureMode ? a.text : "text-slate-300 group-hover:text-white"}`}>
                    {lectureMode ? "Lecture Mode On" : "Lecture Mode Off"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Toggle retrieval context
                  </div>
                </div>
              </button>
            </div>

            {/* File size note */}
            <div className="px-4 py-2.5 border-t border-white/10 bg-white/[0.015]">
              <span className="text-[9px] text-slate-600 font-mono uppercase tracking-wider">
                Max 25 MB · PNG JPG WEBP TXT MD CSV ICS
              </span>
            </div>
          </div>
        </>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
