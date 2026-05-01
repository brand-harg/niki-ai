"use client";

import { useState } from "react";
import {
  codeLanguageLabel,
  highlightCode,
  inferCodeLanguage,
  normalizeCodeLanguage,
} from "@/lib/chatDisplay";

type CodeBlockProps = {
  children?: React.ReactNode;
  className?: string;
};

export default function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const raw = String(children ?? "").replace(/\n$/, "");
  const explicitLanguage = /language-([\w-]+)/.exec(className ?? "")?.[1];
  const language = normalizeCodeLanguage(explicitLanguage ?? inferCodeLanguage(raw));
  const label = codeLanguageLabel(language);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code-terminal my-5 overflow-hidden rounded-xl border border-white/10 bg-[#05070a] shadow-[0_18px_60px_rgba(0,0,0,0.38)]">
      <div className="flex h-10 items-center justify-between border-b border-white/10 bg-white/[0.045] px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {label}
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-200"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="m-0 max-h-[560px] overflow-auto p-4 text-left font-mono text-[13px] leading-6 text-slate-100 sm:p-5">
        <code
          className={`language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightCode(raw, language) }}
        />
      </pre>
    </div>
  );
}
