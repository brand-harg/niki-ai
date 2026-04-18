"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Command = {
  icon: string;
  label: string;
  key?: string;
  action: () => void;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  isNikiMode: boolean;
  onToggleNikiMode: () => void;
  accentColor?: string;
};

export default function CommandPalette({
  isOpen,
  onClose,
  isNikiMode,
  onToggleNikiMode,
  accentColor = "cyan",
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isGreen = accentColor === "green";
  const isAmber = accentColor === "amber";

  const accent = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const accentBorder = isGreen ? "border-green-500/40" : isAmber ? "border-amber-500/40" : "border-cyan-500/40";

  const commands: Command[] = [
    { icon: "💬", label: "New session",          key: "N", action: () => { onClose(); router.push("/"); } },
    { icon: "⚙️", label: "Open settings",        key: "S", action: () => { onClose(); router.push("/settings"); } },
    { icon: "👤", label: "Profile & security",   key: "P", action: () => { onClose(); router.push("/profile"); } },
    { icon: "✨", label: "Personalization",       key: "C", action: () => { onClose(); router.push("/personalization"); } },
    {
      icon: "🔄",
      label: isNikiMode ? "Switch to Pure Logic" : "Switch to Nemanja Mode",
      key: "M",
      action: () => { onToggleNikiMode(); onClose(); },
    },
    { icon: "📊", label: "Strength analytics",   action: () => { onClose(); router.push("/analytics"); } },
    { icon: "📚", label: "Academic vault",        action: () => { onClose(); router.push("/vault"); } },
  ];

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Parent controls isOpen — this just needs closing
      }
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        filtered[selectedIdx].action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, filtered, selectedIdx, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <span className="text-slate-500 text-sm">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or navigate..."
            className="flex-1 bg-transparent border-none outline-none text-slate-100 text-sm placeholder:text-slate-700"
          />
          <kbd
            onClick={onClose}
            className="text-[10px] font-black uppercase text-slate-600 bg-white/5 px-2 py-1 rounded-md cursor-pointer hover:text-white transition-all"
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="py-2 max-h-72 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-center text-slate-600 text-xs uppercase py-6 tracking-widest">
              No results
            </p>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.label}
              onClick={cmd.action}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-all outline-none border-l-2 ${
                i === selectedIdx
                  ? `bg-white/5 text-white ${accentBorder}`
                  : "text-slate-400 hover:text-white hover:bg-white/5 border-transparent"
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-sm flex-shrink-0">
                {cmd.icon}
              </div>
              <span className="flex-1 text-left">{cmd.label}</span>
              {cmd.key && (
                <kbd className="text-[10px] text-slate-600 bg-white/5 px-2 py-1 rounded font-mono">
                  {cmd.key}
                </kbd>
              )}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-white/5 flex items-center gap-4">
          <span className={`text-[10px] font-black uppercase tracking-widest ${accent}`}>
            NikiAi Command Palette
          </span>
          <span className="text-slate-700 text-[10px] ml-auto">↑↓ navigate · Enter select</span>
        </div>
      </div>
    </div>
  );
}