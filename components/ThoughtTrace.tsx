"use client";
import { useState, useRef, useEffect } from "react";

type Step = {
  label: string;
  detail: string;
};

type Props = {
  steps: Step[];
  accentColor?: string;
};

const ACCENT = {
  cyan: {
    text: "text-cyan-400",
    textDim: "text-cyan-500/60",
    bg: "bg-cyan-500",
    bgSoft: "bg-cyan-500/8",
    bgSofter: "bg-cyan-400/5",
    border: "border-cyan-500/15",
    borderStrong: "border-cyan-500/40",
    dot: "bg-cyan-400",
    dotGlow: "shadow-[0_0_8px_rgba(34,211,238,0.7)]",
    lineGlow: "from-cyan-500/40 to-transparent",
    numText: "text-cyan-400",
    numBg: "bg-cyan-500/10 border-cyan-500/25",
    labelText: "text-cyan-300",
    pulse: "bg-cyan-400/30",
    ring: "ring-cyan-500/20",
  },
  green: {
    text: "text-green-400",
    textDim: "text-green-500/60",
    bg: "bg-green-500",
    bgSoft: "bg-green-500/8",
    bgSofter: "bg-green-400/5",
    border: "border-green-500/15",
    borderStrong: "border-green-500/40",
    dot: "bg-green-400",
    dotGlow: "shadow-[0_0_8px_rgba(74,222,128,0.7)]",
    lineGlow: "from-green-500/40 to-transparent",
    numText: "text-green-400",
    numBg: "bg-green-500/10 border-green-500/25",
    labelText: "text-green-300",
    pulse: "bg-green-400/30",
    ring: "ring-green-500/20",
  },
  amber: {
    text: "text-amber-400",
    textDim: "text-amber-500/60",
    bg: "bg-amber-500",
    bgSoft: "bg-amber-500/8",
    bgSofter: "bg-amber-400/5",
    border: "border-amber-500/15",
    borderStrong: "border-amber-500/40",
    dot: "bg-amber-400",
    dotGlow: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    lineGlow: "from-amber-500/40 to-transparent",
    numText: "text-amber-400",
    numBg: "bg-amber-500/10 border-amber-500/25",
    labelText: "text-amber-300",
    pulse: "bg-amber-400/30",
    ring: "ring-amber-500/20",
  },
};

export default function ThoughtTrace({ steps, accentColor = "cyan" }: Props) {
  const [open, setOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  const a = ACCENT[accentColor as keyof typeof ACCENT] ?? ACCENT.cyan;

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [open, steps]);

  const completionPct = Math.round((steps.length / Math.max(steps.length, 1)) * 100);

  return (
    <div className={`mt-4 rounded-xl border ${a.border} overflow-hidden bg-black/35 backdrop-blur-sm`}
      style={{ boxShadow: open ? `0 18px 55px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)` : "inset 0 1px 0 rgba(255,255,255,0.025)" }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 py-3.5 transition-all outline-none group ${open ? a.bgSofter : "hover:bg-white/[0.035]"}`}
      >
        <div className="flex items-center gap-3">
          {/* Animated beacon */}
          <div className="relative flex items-center justify-center w-5 h-5 flex-shrink-0">
            <div className={`w-2 h-2 rounded-full ${a.dot} ${a.dotGlow} z-10`} />
            {open && (
              <div className={`absolute inset-0 rounded-full ${a.pulse} animate-ping opacity-60`} />
            )}
          </div>

          <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${a.text}`}>
            Thought Trace
          </span>

          {/* Step count pill */}
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${a.numBg} ${a.border}`}>
            <span className={`text-[9px] font-black tabular-nums ${a.numText}`}>{steps.length}</span>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              {steps.length === 1 ? "step" : "steps"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-16 h-0.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full ${a.bg} transition-all duration-700 ease-out`}
                style={{ width: open ? `${completionPct}%` : "0%" }}
              />
            </div>
          </div>
        </div>

        {/* Chevron */}
        <div className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="text-slate-500 group-hover:text-slate-300 transition-colors"
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Collapsible body */}
      <div
        style={{ height, transition: "height 0.35s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden" }}
      >
        <div ref={contentRef}>
          {/* Thin separator line */}
          <div className={`mx-5 h-px bg-gradient-to-r ${a.lineGlow} via-white/5`} />

          <div className="px-5 py-5 space-y-1">
            {steps.slice(0, 6).map((step, i) => {
              const isActive = activeStep === i;
              const isLast = i === steps.length - 1;

              return (
                <div
                  key={i}
                  className="relative"
                  onMouseEnter={() => setActiveStep(i)}
                  onMouseLeave={() => setActiveStep(null)}
                >
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div
                      className="absolute left-[19px] top-[28px] w-px bottom-[-4px] z-0"
                      style={{
                        background: isActive
                          ? `linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)`
                          : `linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)`,
                        transition: "background 0.2s",
                      }}
                    />
                  )}

                  <div
                    className={`relative z-10 flex gap-3.5 items-start px-3 py-2.5 rounded-xl transition-all duration-200 cursor-default ${isActive ? `${a.bgSoft} ring-1 ${a.ring}` : ""
                      }`}
                  >
                    {/* Step number node */}
                    <div
                      className={`flex-shrink-0 w-[26px] h-[26px] rounded-full border flex items-center justify-center text-[10px] font-black transition-all duration-200 ${isActive
                          ? `${a.numBg} ${a.borderStrong} ${a.numText} ${a.dotGlow}`
                          : `${a.numBg} border-white/10 text-slate-500`
                        }`}
                    >
                      {i + 1}
                    </div>

                    {/* Content */}
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className={`text-[11px] font-black uppercase tracking-wider transition-colors duration-150 ${isActive ? a.labelText : "text-slate-300"
                          }`}
                      >
                        {step.label}
                      </span>
                      <span
                        className={`text-[13px] leading-relaxed transition-colors duration-150 ${isActive ? "text-slate-200" : "text-slate-400"
                          }`}
                      >
                        {step.detail}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: completion badge */}
          <div className={`mx-5 mb-4 mt-1 flex items-center gap-2 px-3 py-2 rounded-xl ${a.bgSofter} border ${a.border}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={a.text}>
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${a.textDim}`}>
              Reasoning complete · {steps.length} logical {steps.length === 1 ? "step" : "steps"} traced
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
