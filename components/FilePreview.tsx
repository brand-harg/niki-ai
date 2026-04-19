"use client";
import NextImage from "next/image";

type AttachedFile = {
  file: File;
  preview?: string; // object URL for images
  type: "image" | "text";
};

type Props = {
  attached: AttachedFile | null;
  onRemove: () => void;
  accentColor?: string;
};

const ACCENT = {
  cyan:  { text: "text-cyan-400",  border: "border-cyan-500/20",  bg: "bg-cyan-500/8"  },
  green: { text: "text-green-400", border: "border-green-500/20", bg: "bg-green-500/8" },
  amber: { text: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/8" },
};

export default function FilePreview({ attached, onRemove, accentColor = "cyan" }: Props) {
  if (!attached) return null;
  const a = ACCENT[accentColor as keyof typeof ACCENT] ?? ACCENT.cyan;

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border ${a.border} ${a.bg} mb-2`}>
      {/* Thumbnail or icon */}
      {attached.type === "image" && attached.preview ? (
       <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
          <NextImage src={attached.preview} alt="preview" fill className="object-cover" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/8 flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-slate-400">
            <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
      )}

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-slate-200 truncate">{attached.file.name}</p>
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-mono">
          {attached.type === "image" ? "Image" : "Text file"} · {(attached.file.size / 1024).toFixed(0)} KB
        </p>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="w-6 h-6 rounded-full bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-slate-600 hover:text-red-400 transition-all flex-shrink-0 outline-none"
        aria-label="Remove attachment"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

export type { AttachedFile };