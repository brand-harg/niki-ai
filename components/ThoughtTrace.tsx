"use client";
import { useState } from "react";

type Step = {
  label: string;
  detail: string;
};

type Props = {
  steps: Step[];
  accentColor?: string; // tailwind color key: "cyan" | "green" | "amber"
};

export default function ThoughtTrace({ steps, accentColor = "cyan" }: Props) {
  const [open, setOpen] = useState(false);

  const isGreen = accentColor === "green";
  const isAmber = accentColor === "amber";

  const accent = isGreen
    ? "text-green-400"
    : isAmber
      ? "text-amber-400"
      : "text-cyan-400";

  const dot = isGreen
    ? "bg-green-400"
    : isAmber
      ? "bg-amber-400"
      : "bg-cyan-400";

  const border = isGreen
    ? "border-green-500/20"
    : isAmber
      ? "border-amber-500/20"
      : "border-cyan-500/20";

  const headerBg = isGreen
    ? "bg-green-500/5"
    : isAmber
      ? "bg-amber-500/5"
      : "bg-cyan-500/5";

  const numBg = isGreen
    ? "bg-green-500/10 border-green-500/30 text-green-400"
    : isAmber
      ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
      : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400";

  return (
    <div className={`mt-3 border ${border} rounded-2xl overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 ${headerBg} transition-all outline-none`}
      >
        <div className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ${accent}`}>
          <div className={`w-2 h-2 rounded-full ${dot}`} />
          Thought Trace
          <span className="font-normal text-slate-500 normal-case tracking-normal">
            &nbsp;{steps.length} steps
          </span>
        </div>
        <span
          className={`text-slate-500 text-[10px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 py-4">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div
                className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5 ${numBg}`}
              >
                {i + 1}
              </div>
              <div className="text-[13px] text-slate-400 leading-relaxed">
                <span className="text-slate-200 font-semibold">{step.label}</span>
                {" — "}
                {step.detail}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}