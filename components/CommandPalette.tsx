"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// --- TYPES ---
type CommandGroup = {
  label: string;
  commands: Command[];
};

type Command = {
  id: string;
  icon: string;
  label: string;
  description: string;
  shortcut?: string;
  action: () => void;
  contextual?: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  isNikiMode: boolean;
  onToggleNikiMode: () => void;
  accentColor?: string;
  hasActiveChat?: boolean;
  currentChatTitle?: string;
  onNewSession?: () => void;
  onToggleSidebar?: () => void;
  onClearChat?: () => void;
  onRenameChat?: () => void;
  onPinChat?: () => void;
};

// --- ACCENT SYSTEM ---
const ACCENT = {
  cyan: {
    text: "text-cyan-400",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/10",
    glow: "shadow-[0_0_0_1px_rgba(34,211,238,0.15)]",
    dot: "bg-cyan-400",
    kbd: "text-cyan-400/70",
  },
  green: {
    text: "text-green-400",
    border: "border-green-500/40",
    bg: "bg-green-500/10",
    glow: "shadow-[0_0_0_1px_rgba(74,222,128,0.15)]",
    dot: "bg-green-400",
    kbd: "text-green-400/70",
  },
  amber: {
    text: "text-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    glow: "shadow-[0_0_0_1px_rgba(251,191,36,0.15)]",
    dot: "bg-amber-400",
    kbd: "text-amber-400/70",
  },
};

const RECENT_KEY = "niki_recent_commands";
const MAX_RECENT = 3;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(id: string) {
  try {
    const prev = getRecent().filter((r) => r !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, MAX_RECENT)));
  } catch { }
}

export default function CommandPalette({
  isOpen,
  onClose,
  isNikiMode,
  onToggleNikiMode,
  accentColor = "cyan",
  hasActiveChat = false,
  currentChatTitle = "Current Chat",
  onNewSession,
  onToggleSidebar,
  onClearChat,
  onRenameChat,
  onPinChat,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const a = ACCENT[accentColor as keyof typeof ACCENT] ?? ACCENT.cyan;

  const execute = useCallback((cmd: Command) => {
    saveRecent(cmd.id);
    setRecent(getRecent());
    cmd.action();
    onClose();
  }, [onClose]);

  // --- COMMAND DEFINITIONS ---
  const buildGroups = useCallback((): CommandGroup[] => {
    const nav: Command[] = [
      {
        id: "new-session",
        icon: "✦",
        label: "New Session",
        description: "Start a fresh conversation",
        shortcut: "N",
        action: () => onNewSession?.(),
      },
      {
        id: "toggle-sidebar",
        icon: "▤",
        label: "Toggle Sidebar",
        description: "Show or hide chat history",
        shortcut: "B",
        action: () => onToggleSidebar?.(),
      },
      {
        id: "settings",
        icon: "⚙",
        label: "Settings",
        description: "General preferences and accent color",
        action: () => router.push("/settings"),
      },
      {
        id: "profile",
        icon: "◉",
        label: "Profile & Security",
        description: "Manage your account and credentials",
        action: () => router.push("/profile"),
      },
      {
        id: "personalization",
        icon: "✦",
        label: "Personalization",
        description: "Set your context and response style",
        action: () => router.push("/personalization"),
      },
    ];

    const modes: Command[] = [
      {
        id: "nemanja-mode",
        icon: "⬡",
        label: "Switch to Nemanja Mode",
        description: "Professor persona — rigorous and direct",
        shortcut: "M",
        action: () => onToggleNikiMode(),
      },
      {
        id: "pure-logic",
        icon: "◈",
        label: "Switch to Pure Logic",
        description: "Clean math assistant — no persona",
        shortcut: "M",
        action: () => onToggleNikiMode(),
      },
    ];

    // Only show the mode that isn't active
    const filteredModes = isNikiMode
      ? modes.filter((m) => m.id === "pure-logic")
      : modes.filter((m) => m.id === "nemanja-mode");

    const actions: Command[] = [
      {
        id: "clear-chat",
        icon: "⊘",
        label: "Clear Chat",
        description: "Wipe the current session messages",
        action: () => onClearChat?.(),
      },
    ];

    const contextual: Command[] = hasActiveChat
      ? [
        {
          id: "rename-chat",
          icon: "✎",
          label: "Rename Chat",
          description: `Rename "${currentChatTitle.slice(0, 30)}${currentChatTitle.length > 30 ? "…" : ""}"`,
          action: () => onRenameChat?.(),
          contextual: true,
        },
        {
          id: "pin-chat",
          icon: "★",
          label: "Pin Chat",
          description: "Keep this session at the top of history",
          action: () => onPinChat?.(),
          contextual: true,
        },
      ]
      : [];

    return [
      { label: "Navigation", commands: nav },
      { label: "Mode", commands: filteredModes },
      { label: "Actions", commands: actions },
      ...(contextual.length > 0 ? [{ label: "This Chat", commands: contextual }] : []),
    ];
  }, [isNikiMode, hasActiveChat, currentChatTitle, onNewSession, onToggleSidebar, onClearChat, onRenameChat, onPinChat, onToggleNikiMode, router]);

  // --- FLAT LIST FOR KEYBOARD NAV ---
  const groups = buildGroups();
  const allCommands = groups.flatMap((g) => g.commands);

  // Filter by query
  const filtered = query.trim()
    ? allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
    )
    : null; // null = show grouped view

  // Recent commands (only when no query)
  const recentCommands = recent
    .map((id) => allCommands.find((c) => c.id === id))
    .filter(Boolean) as Command[];

  // Flat list for index tracking
  const flatList = filtered ?? allCommands;

  // --- EFFECTS ---
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setSelectedIdx(0);
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIdx(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`) as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatList[selectedIdx]) execute(flatList[selectedIdx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, flatList, selectedIdx, execute, onClose]);

  if (!isOpen) return null;

  // --- RENDER HELPERS ---
  const CommandRow = ({ cmd, idx, dim }: { cmd: Command; idx: number; dim?: boolean }) => {
    const isSelected = flatList.indexOf(cmd) === selectedIdx;
    return (
      <button
        data-idx={idx}
        onClick={() => execute(cmd)}
        onMouseEnter={() => setSelectedIdx(flatList.indexOf(cmd))}
        className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-left transition-all outline-none border
          ${isSelected
            ? `${a.bg} ${a.border} ${a.glow}`
            : "border-transparent hover:bg-white/[0.03]"
          }
          ${dim ? "opacity-50" : ""}
        `}
      >
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base
          ${isSelected ? `${a.bg} border ${a.border}` : "bg-white/[0.04] border border-white/5"}
        `}>
          <span className={isSelected ? a.text : "text-slate-500"}>{cmd.icon}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-bold leading-none mb-0.5 truncate ${isSelected ? "text-white" : "text-slate-300"}`}>
            {cmd.label}
          </div>
          <div className="text-[11px] text-slate-600 truncate">{cmd.description}</div>
        </div>

        {/* Shortcut or contextual badge */}
        {cmd.contextual ? (
          <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${a.bg} ${a.border} ${a.text}`}>
            Active
          </div>
        ) : cmd.shortcut ? (
          <kbd className={`text-[10px] font-black bg-white/5 border border-white/8 px-2 py-0.5 rounded-md ${isSelected ? a.kbd : "text-slate-700"} font-mono`}>
            {cmd.shortcut}
          </kbd>
        ) : null}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[560px] mx-4 bg-[#0e0e0e] border border-white/8 rounded-2xl overflow-hidden"
        style={{
          boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
          animation: "palette-in 0.18s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-slate-600 flex-shrink-0">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands or type an action…"
            className="flex-1 bg-transparent border-none outline-none text-slate-100 text-sm placeholder:text-slate-700 font-medium"
          />
          <div className="flex items-center gap-2">
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-slate-600 hover:text-slate-400 transition-colors text-xs"
              >
                Clear
              </button>
            )}
            <kbd
              onClick={onClose}
              className="text-[10px] font-black text-slate-700 bg-white/5 border border-white/8 px-2 py-1 rounded-md cursor-pointer hover:text-slate-400 transition-colors font-mono"
            >
              ESC
            </kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="py-2 max-h-[400px] overflow-y-auto overscroll-contain">
          {/* Query mode — flat filtered list */}
          {filtered !== null ? (
            filtered.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-slate-600 text-xs uppercase tracking-widest font-black">No commands found</p>
                <p className="text-slate-700 text-[11px] mt-1">Try a different search term</p>
              </div>
            ) : (
              <div className="px-2 space-y-0.5">
                {filtered.map((cmd, i) => (
                  <CommandRow key={cmd.id} cmd={cmd} idx={i} />
                ))}
              </div>
            )
          ) : (
            /* Browse mode — grouped */
            <div className="space-y-1">
              {/* Recent commands */}
              {recentCommands.length > 0 && (
                <div className="px-2">
                  <div className="px-3 py-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-700">Recent</span>
                  </div>
                  <div className="space-y-0.5">
                    {recentCommands.map((cmd) => (
                      <CommandRow key={`recent-${cmd.id}`} cmd={cmd} idx={flatList.indexOf(cmd)} />
                    ))}
                  </div>
                  <div className="mx-3 my-2 h-px bg-white/[0.04]" />
                </div>
              )}

              {/* Groups */}
              {groups.map((group) => (
                <div key={group.label} className="px-2">
                  <div className="px-3 py-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-700">{group.label}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.commands.map((cmd) => (
                      <CommandRow key={cmd.id} cmd={cmd} idx={flatList.indexOf(cmd)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
            <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${a.text}`}>
              NikiAi Command Palette
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-700 font-mono">
            <span>↑↓ navigate</span>
            <span className="text-slate-800">·</span>
            <span>↵ select</span>
            <span className="text-slate-800">·</span>
            <span>esc close</span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes palette-in {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(-8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}