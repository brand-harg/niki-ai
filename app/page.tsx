"use client";
import React, { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import ThoughtTrace from "@/components/ThoughtTrace";
import CommandPalette from "@/components/CommandPalette";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Image from "next/image";
import "katex/dist/katex.min.css";
import FileUploadButton from "@/components/FileUploadButton";
import FilePreview, { type AttachedFile } from "@/components/FilePreview";
import html2canvas from "html2canvas";

// --- ICONS ---
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const PinIcon = () => (
  <svg className="w-3.5 h-3.5 opacity-50" fill="currentColor" viewBox="0 0 24 24">
    <path d="M16 9l-4-4-4 4v2l4 4 4-4v-2zm-4 7V5m0 11l4-4m-4 4l-4-4" />
  </svg>
);

const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h12m-12 6h16" />
  </svg>
);

type Message = {
  role: "ai" | "user";
  content: string;
};

type AppSession = { user: { id: string } } | null;
type AppProfile = {
  id?: string;
  first_name?: string;
  username?: string;
  theme_accent?: "cyan" | "green" | "amber";
  default_niki_mode?: boolean;
  train_on_data?: boolean;
  avatar_url?: string;
  current_unit?: string;
  compact_mode?: boolean;
};
type ChatItem = {
  id: string;
  title: string;
  is_pinned?: boolean;
};
type RagCitation = {
  lectureTitle?: string;
  professor?: string;
  timestampStartSeconds?: number;
  timestampUrl?: string | null;
};
type RagResponse = {
  context?: string[];
  styleSnippets?: { text: string; personaTag?: string }[];
  citations?: RagCitation[];
  error?: string;
};
const DEFAULT_GREETING: Message[] = [{ role: "ai", content: "What do you need help with?" }];


// Safe sanitizer — cleans up malformed LaTeX delimiters
function sanitizeMathContent(content: string): string {
  if (!content || typeof content !== "string") return "";

  let cleaned = content;

  cleaned = cleaned
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  cleaned = cleaned.replace(/\${3,}/g, "$$");

  cleaned = cleaned.replace(/^\$(?!\$)\s*$/gm, "");

  return cleaned;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Vault connection lost.";
}

function stripPartialThink(content: string): string {
  if (!content) return "";

  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "");
  const openIndex = cleaned.indexOf("<think>");
  if (openIndex !== -1) {
    cleaned = cleaned.slice(0, openIndex);
  }

  return cleaned;
}

// Utility to parse <think>...</think> blocks from Qwen output
function parseThoughtTrace(content: string): {
  steps: { label: string; detail: string }[];
  clean: string;
} {
  const match = content.match(/<think>([\s\S]*?)<\/think>/);
  if (!match) return { steps: [], clean: content };

  const rawLines = match[1].trim().split(/\n+/).filter(Boolean);
  const steps = rawLines
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return null;
      return {
        label: line.slice(0, colonIdx).trim(),
        detail: line.slice(colonIdx + 1).trim(),
      };
    })
    .filter(Boolean) as { label: string; detail: string }[];

  return {
    steps,
    clean: content.replace(/<think>[\s\S]*?<\/think>/, "").trim(),
  };
}

export default function Home() {
  const router = useRouter();

  // --- STATE ---
  const [session, setSession] = useState<AppSession>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isNikiMode, setIsNikiMode] = useState(true);
  const [lectureMode, setLectureMode] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "projects">("history");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);

  // --- RENAME STATE ---
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatViewportRef = useRef<HTMLDivElement>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isUnmountingRef = useRef(false);
  const isStreamingRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null);

  // --- DYNAMIC THEME ENGINE ---
  const isGreen = profile?.theme_accent === "green";
  const isAmber = profile?.theme_accent === "amber";

  const accentColor = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const accentBg = isGreen ? "bg-green-500" : isAmber ? "bg-amber-500" : "bg-cyan-500";
  const accentBorder = isGreen ? "border-green-500/20" : isAmber ? "border-amber-500/20" : "border-cyan-500/20";
  const accentHoverBg = isGreen ? "hover:bg-green-500" : isAmber ? "hover:bg-amber-500" : "hover:bg-cyan-500";
  const accentGroupHoverBg = isGreen ? "group-hover:bg-green-500" : isAmber ? "group-hover:bg-amber-500" : "group-hover:bg-cyan-500";
  const accentHoverText = isGreen ? "hover:text-green-400" : isAmber ? "hover:text-amber-400" : "hover:text-cyan-400";
  const accentGroupHoverText = isGreen ? "group-hover:text-green-400" : isAmber ? "group-hover:text-amber-400" : "group-hover:text-cyan-400";
  const aiBubbleBg = isGreen
    ? "bg-gradient-to-br from-green-400 to-green-600 text-white"
    : isAmber
      ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white"
      : "bg-gradient-to-br from-cyan-400 to-blue-600 text-white";


  // --- BOOT & SYNC SEQUENCE ---
  useEffect(() => {
    let mounted = true;
    isUnmountingRef.current = false;

    const initialize = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (error || !user) {
        setSession(null);
        setProfile(null);
        setProfileLoaded(true);
        setChatHistory([]);
        setCurrentChatId(null);
        currentChatIdRef.current = null;
        setMessages(DEFAULT_GREETING);
        lastSessionIdRef.current = null;
        setAuthChecked(true);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setAuthChecked(true);
      lastSessionIdRef.current = user.id;

      await fetchHistory(user.id);
      await fetchProfile(user.id);
    };

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (isStreamingRef.current) return;

      const newUserId = session?.user?.id ?? null;

      if (newUserId && newUserId === lastSessionIdRef.current) {
        setSession(session);
        return;
      }

      if (newUserId) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          setSession(null);
          setProfile(null);
          setProfileLoaded(true);
          setChatHistory([]);
          setCurrentChatId(null);
          currentChatIdRef.current = null;
          setMessages(DEFAULT_GREETING);
          lastSessionIdRef.current = null;
          return;
        }

        lastSessionIdRef.current = newUserId;
        setSession(session);
        setProfileLoaded(false);
        await fetchHistory(newUserId);
        await fetchProfile(newUserId);
      } else {
        lastSessionIdRef.current = null;
        setSession(null);
        setProfile(null);
        setProfileLoaded(true);
        setChatHistory([]);
        setCurrentChatId(null);
        currentChatIdRef.current = null;
        setMessages(DEFAULT_GREETING);
      }
    });

    return () => {
      mounted = false;
      isUnmountingRef.current = true;
      abortControllerRef.current?.abort();
      subscription.unsubscribe();
    };
  }, []);

  // Close delete confirm on outside click
  useEffect(() => {
    const handleWindowClick = () => setConfirmDeleteId(null);
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  // Set default greeting and niki mode once profile loads
  const messageCount = messages.length;

  useEffect(() => {
    if (messageCount > 0) return;
    if (session && !profileLoaded) return;
    setMessages(DEFAULT_GREETING);
    if (profile?.default_niki_mode !== undefined) {
      setIsNikiMode(profile.default_niki_mode);
    }
  }, [messageCount, profile?.default_niki_mode, profileLoaded, session]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Visibility + Ctrl/Cmd + K
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log("Visibility changed:", document.visibilityState);
    };

    const handleCmdK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("keydown", handleCmdK);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("keydown", handleCmdK);
    };
  }, []);

  // --- DATABASE ACTIONS ---
  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) console.log("Home profile fetch error:", error);
    if (data) setProfile(data);
    setProfileLoaded(true);
  };

  const fetchHistory = async (userId: string) => {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", userId)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) console.log("Fetch history error:", error);
    if (data) setChatHistory(data);
  };

  const loadChat = async (chatId: string) => {
    setCurrentChatId(chatId);
    currentChatIdRef.current = chatId;
    setRenamingChatId(null);

    await supabase
      .from("chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("Load chat error:", error);
      return;
    }

    if (data && data.length > 0) {
      const formatted: Message[] = data
        .filter((msg) => msg.role === "ai" || msg.role === "user")
        .map((msg) => ({
          role: msg.role as Message["role"],
          content: msg.text || "",
        }));
      setMessages(formatted);
    } else {
      setMessages(DEFAULT_GREETING);
    }

    if (session?.user?.id) fetchHistory(session.user.id);
  };

  const togglePin = async (e: React.MouseEvent, chatId: string, currentStatus: boolean) => {
    e.stopPropagation();
    const { error } = await supabase
      .from("chats")
      .update({ is_pinned: !currentStatus, updated_at: new Date().toISOString() })
      .eq("id", chatId);

    if (error) {
      console.log("Toggle pin error:", error);
      return;
    }
    if (session?.user?.id) fetchHistory(session.user.id);
  };

  const deleteChat = async (chatId: string) => {
    if (!session?.user?.id) return;
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) {
      console.log("Delete chat error:", error);
      return;
    }

    setChatHistory((prev) => prev.filter((chat) => chat.id !== chatId));

    if (currentChatId === chatId) {
      setCurrentChatId(null);
      currentChatIdRef.current = null;
      setMessages(DEFAULT_GREETING);
    }
    setConfirmDeleteId(null);
  };

  // --- RENAME ACTIONS ---
  const startRename = (e: React.MouseEvent, chatId: string, currentTitle: string) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setRenamingChatId(chatId);
    setRenameValue(currentTitle);
  };

  const commitRename = async (chatId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingChatId(null);
      return;
    }
    const { error } = await supabase
      .from("chats")
      .update({ title: trimmed, updated_at: new Date().toISOString() })
      .eq("id", chatId);

    if (error) {
      console.log("Rename error:", error);
    }

    setChatHistory((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: trimmed } : c))
    );
    setRenamingChatId(null);
  };

  const handleFileSelect = (file: File) => {
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("File too large. Maximum size is 25 MB.");
      return;
    }

    const isImage = file.type.startsWith("image/");

    if (isImage) {
      const preview = URL.createObjectURL(file);
      setAttachedFile({ file, preview, type: "image" });
    } else {
      setAttachedFile({ file, type: "text" });
    }
  };

  const handleRemoveFile = () => {
    if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
    setAttachedFile(null);
  };

  const handleScreenshot = async () => {
    const target =
      chatViewportRef.current ??
      (document.querySelector("[data-chat-capture]") as HTMLDivElement | null);
    if (!target) {
      alert("Screenshot target not found. Please reload and try again.");
      return;
    }

    const colorProps = [
      "color",
      "background-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "outline-color",
      "text-decoration-color",
      "caret-color",
      "box-shadow",
    ] as const;

    const patches: Array<{
      el: HTMLElement;
      prop: (typeof colorProps)[number];
      prev: string;
    }> = [];

    try {
      const nodes = [target, ...Array.from(target.querySelectorAll("*"))];
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const computed = window.getComputedStyle(node);
        for (const prop of colorProps) {
          const next = computed.getPropertyValue(prop);
          if (!next) continue;
          patches.push({
            el: node,
            prop,
            prev: node.style.getPropertyValue(prop),
          });
          node.style.setProperty(prop, next);
        }
      }

      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `nikiai-chat-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Screenshot failed:", err);
      alert(
        "Screenshot failed. If you use external avatars/images, try hiding them or using a local image and retry."
      );
    } finally {
      for (const patch of patches) {
        if (patch.prev) {
          patch.el.style.setProperty(patch.prop, patch.prev);
        } else {
          patch.el.style.removeProperty(patch.prop);
        }
      }
    }
  };

  const uploadFileToSupabase = async (
    file: File,
    chatId: string
  ): Promise<string | null> => {
    if (!session?.user?.id) return null;

    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/${chatId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("chat-uploads")
      .upload(path, file, { upsert: false });

    if (error) {
      console.error("Upload error:", error);
      return null;
    }

    return path;
  };

  const startNewSession = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isStreamingRef.current = false;
    setIsLoading(false);

    if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
    setAttachedFile(null);

    setCurrentChatId(null);
    currentChatIdRef.current = null;
    setMessages(DEFAULT_GREETING);
    setConfirmDeleteId(null);
    setRenamingChatId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const fetchRag = async (question: string): Promise<RagResponse | null> => {
    if (!lectureMode || !question.trim()) return null;

    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          lectureMode: true,
          courseFilter: profile?.current_unit ?? undefined,
          maxChunks: 8,
          maxStyleSnippets: 3,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn("RAG status:", res.status, text);
        return null;
      }

      return (await res.json()) as RagResponse;
    } catch (error) {
      console.warn("RAG fetch failed:", error);
      return null;
    }
  };


  // --- CORE SEND ENGINE ---
  const handleSend = async () => {
    if (!inputValue.trim() && !attachedFile) return;
    if (isLoading) return;

    const userText = inputValue.trim();
    const currentName = profile?.first_name || profile?.username || "User";
    let chatId = currentChatIdRef.current;

    const displayContent =
      userText || (attachedFile ? `[${attachedFile.file.name}]` : "");

    const updatedHistory: Message[] = [
      ...messages,
      { role: "user", content: displayContent },
    ];

    setMessages(updatedHistory);
    setInputValue("");
    setIsLoading(true);
    isStreamingRef.current = true;

    const currentAttached = attachedFile;
    setAttachedFile(null);
    if (currentAttached?.preview) URL.revokeObjectURL(currentAttached.preview);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = window.setTimeout(() => {
      console.log("Client timeout hit: aborting stream.");
      controller.abort();
    }, 120000);

    try {
      if (!chatId && session) {
        const title =
          userText.substring(0, 50) ||
          currentAttached?.file.name ||
          "File upload";

        const { data: newChat } = await supabase
          .from("chats")
          .insert({
            user_id: session.user.id,
            title,
            project_name: activeTab === "projects" ? "Calculus 1" : null,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (newChat) {
          chatId = newChat.id;
          setCurrentChatId(chatId);
          currentChatIdRef.current = chatId;
        }
      }

      let storagePath: string | null = null;
      if (currentAttached && chatId && session) {
        storagePath = await uploadFileToSupabase(currentAttached.file, chatId);
      }

      if (chatId && session) {
        await supabase.from("messages").insert({
          chat_id: chatId,
          role: "user",
          text: displayContent,
          ...(storagePath ? { attachment_path: storagePath } : {}),
        });

        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId);
      }

      let base64Image: string | null = null;
      let textFileContent: string | null = null;
      const rag = await fetchRag(userText);

      if (currentAttached?.type === "image") {
        const arrayBuffer = await currentAttached.file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = "";
        uint8.forEach((b) => (binary += String.fromCharCode(b)));
        base64Image = btoa(binary);
      } else if (currentAttached?.type === "text") {
        textFileContent = await currentAttached.file.text();
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history: updatedHistory,
          isNikiMode,
          userName: currentName,
          userId: session?.user?.id,
          chatId,
          trainConsent: profile?.train_on_data,
          lectureMode,
          ragContext: rag?.context ?? [],
          ragStyleSnippets: rag?.styleSnippets ?? [],
          ragCitations: rag?.citations ?? [],
          base64Image: base64Image ?? undefined,
          imageMediaType:
            currentAttached?.type === "image"
              ? currentAttached.file.type
              : undefined,
          textFileContent: textFileContent ?? undefined,
          textFileName:
            currentAttached?.type === "text"
              ? currentAttached.file.name
              : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();

        let apiMessage = `System Error: API returned ${response.status}.`;
        try {
          const parsed = JSON.parse(errorText) as { reply?: string };
          if (parsed?.reply) apiMessage = parsed.reply;
        } catch {
          if (errorText.trim()) apiMessage = errorText;
        }

        console.warn("API status:", response.status, apiMessage);
        setMessages((prev) => [...prev, { role: "ai", content: apiMessage }]);
        return;
      }

      setMessages((prev) => [...prev, { role: "ai", content: "" }]);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiReply = "";

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            aiReply += chunk;

            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "ai", content: aiReply };
              return updated;
            });
          }
        } catch (streamError: unknown) {
          if (!(streamError instanceof Error) || streamError.name !== "AbortError") throw streamError;
        } finally {
          reader.releaseLock();
        }
      }

      if (chatId && session && aiReply.length > 0) {
        const lectureCitations = rag?.citations ?? [];
        const citationFooter =
          lectureMode && lectureCitations.length > 0
            ? `\n\nSources:\n${lectureCitations
              .slice(0, 4)
              .map((c, i) => {
                const ts = typeof c.timestampStartSeconds === "number" ? `${c.timestampStartSeconds}s` : "unknown";
                const head = `${i + 1}. ${c.lectureTitle ?? "Unknown lecture"} (${c.professor ?? "Unknown professor"}) @ ${ts}`;
                return c.timestampUrl ? `${head} — ${c.timestampUrl}` : head;
              })
              .join("\n")}`
            : "";
        const finalReply = aiReply + citationFooter;

        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1]?.role === "ai") {
            updated[updated.length - 1] = { role: "ai", content: finalReply };
          }
          return updated;
        });

        await supabase
          .from("messages")
          .insert({ chat_id: chatId, role: "ai", text: finalReply });

        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId);
      }
    } catch (error: unknown) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        console.error("handleSend error:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: `System Error: ${getErrorMessage(error)}`,
          },
        ]);
      }
    } finally {
      window.clearTimeout(timeoutId);
      isStreamingRef.current = false;
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      if (!isUnmountingRef.current) setIsLoading(false);
      if (session?.user?.id) fetchHistory(session.user.id);
    }
  };

  // --- SIDEBAR CHAT ROW ---
  const ChatRow = ({ chat }: { chat: ChatItem }) => (
    <div
      key={chat.id}
      onClick={() => renamingChatId !== chat.id && loadChat(chat.id)}
      className={`w-full flex justify-between items-center p-3 rounded-xl hover:bg-white/5 text-slate-400 text-xs group cursor-pointer transition-all ${currentChatId === chat.id ? "bg-white/5 text-white" : ""
        }`}
    >
      {renamingChatId === chat.id ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => commitRename(chat.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(chat.id);
            if (e.key === "Escape") setRenamingChatId(null);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none border border-white/20 mr-2"
        />
      ) : (
        <span
          className="truncate group-hover:text-white transition-colors flex-1"
          onDoubleClick={(e) => startRename(e, chat.id, chat.title)}
          title="Double-click to rename"
        >
          {chat.title}
        </span>
      )}

      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          onClick={(e) => togglePin(e, chat.id, !!chat.is_pinned)}
          className={`cursor-pointer transition-opacity ${chat.is_pinned
            ? `${accentColor} opacity-100`
            : "opacity-20 hover:opacity-100 hover:text-white"
            }`}
        >
          {chat.is_pinned ? "★" : "☆"}
        </div>

        {confirmDeleteId === chat.id ? (
          <div className="flex items-center gap-2">
            <span
              onClick={(e) => {
                e.stopPropagation();
                deleteChat(chat.id);
              }}
              className="text-red-400 hover:text-red-300 cursor-pointer font-bold"
            >
              Delete
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteId(null);
              }}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              Cancel
            </span>
          </div>
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteId(chat.id);
            }}
            className="text-red-400 hover:text-red-300 cursor-pointer opacity-70 hover:opacity-100"
          >
            ✕
          </div>
        )}
      </div>
    </div>
  );

  return (
    <main className="flex h-screen bg-black text-white font-sans antialiased overflow-hidden">
      {/* SIDEBAR */}
      <aside
        className={`h-full bg-[#080808] border-r border-white/5 z-30 transition-all duration-300 flex flex-col ${isSidebarOpen ? "w-80" : "w-0 overflow-hidden"
          }`}
      >
        <div className="p-4 pt-6">
          <button
            onClick={startNewSession}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group outline-none"
          >
            <span className="text-sm font-bold text-slate-200">New Session</span>
            <div className={`bg-white/5 p-1 rounded-md ${accentGroupHoverBg} group-hover:text-white transition-all`}>
              <PlusIcon />
            </div>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex px-4 mb-6 gap-1">
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all outline-none ${activeTab === "history"
              ? `bg-white/5 ${accentColor} ${accentBorder}`
              : "text-slate-500 border-transparent hover:text-slate-300"
              }`}
          >
            History
          </button>
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all outline-none ${activeTab === "projects"
              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
              : "text-slate-500 border-transparent hover:text-slate-300"
              }`}
          >
            Projects
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {activeTab === "history" ? (
            <div className="space-y-2">
              {chatHistory.some((c) => c.is_pinned) && (
                <>
                  <div className="flex items-center gap-2 px-2 py-2">
                    <div className={accentColor}>
                      <PinIcon />
                    </div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                      Pinned
                    </span>
                  </div>
                  {chatHistory
                    .filter((c) => c.is_pinned)
                    .map((chat) => (
                      <ChatRow key={chat.id} chat={chat} />
                    ))}
                  <div className="h-px bg-white/5 my-4" />
                </>
              )}

              {chatHistory.filter((c) => !c.is_pinned).length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    Recent
                  </span>
                </div>
              )}

              {chatHistory
                .filter((c) => !c.is_pinned)
                .map((chat) => (
                  <ChatRow key={chat.id} chat={chat} />
                ))}

              {chatHistory.length === 0 && (
                <p className="text-center text-slate-700 text-[10px] uppercase tracking-widest py-8">
                  No sessions yet
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl bg-white/[0.02] border ${accentBorder}`}>
                <p className={`text-[10px] font-black ${accentColor} uppercase mb-1`}>
                  Active Space
                </p>
                <p className="text-xs text-slate-400 font-bold">
                  {profile?.current_unit ? `Section ${profile.current_unit}` : "Calculus 1"}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <section className="flex-1 flex flex-col relative bg-black">
        {/* HEADER */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/50 backdrop-blur-md z-20">
          <div className="flex items-center gap-5">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-2 hover:bg-white/5 rounded-lg text-slate-500 ${accentHoverText} transition-colors outline-none`}
            >
              <MenuIcon />
            </button>
            <h1 className="text-xl font-black text-white tracking-tighter uppercase">
              Niki<span className={accentColor}>Ai</span>
            </h1>
          </div>

          <div className="flex gap-6 items-center">
            <div className="hidden md:flex font-mono text-[10px] tracking-tight text-slate-500 uppercase gap-5 items-center">
              <div className="flex items-center gap-2 px-3 py-1 rounded bg-white/5 border border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${accentBg} animate-pulse`} />
                <span>RTX 5070 Ti Active</span>
              </div>
            </div>

            <div className="border-l border-white/10 pl-6 flex items-center gap-5">
              {!authChecked ? (
                <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
              ) : session ? (
                <button
                  onClick={() => router.push("/settings")}
                  className="group flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-white/5 transition-all border border-transparent hover:border-white/10 outline-none"
                >
                  <div
                    className={`relative w-8 h-8 rounded-full ${accentBg} flex items-center justify-center font-black text-[10px] text-white overflow-hidden border border-white/10 shadow-lg`}                  >
                    {profile?.avatar_url ? (
                      <Image src={profile.avatar_url} alt="User" fill className="object-cover" />
                    ) : (
                      profile?.first_name?.[0] || profile?.username?.[0] || "U"
                    )}
                  </div>
                  <div className="flex flex-col items-start leading-none">
                    <span className={`text-[10px] font-black uppercase tracking-widest text-white ${accentGroupHoverText}`}>
                      {profile?.first_name || profile?.username || "User"}
                    </span>
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">
                      {profile?.username ? `@${profile.username}` : "@vault"}
                    </span>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => router.push("/login")}
                  className={`px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest ${accentHoverBg} hover:text-white transition-all outline-none`}
                >
                  Log In
                </button>
              )}
            </div>
          </div>
        </header>

        {/* CHAT VIEWPORT */}
        <div
          ref={(el) => {
            scrollRef.current = el;
            chatViewportRef.current = el;
          }}
          data-chat-capture
          className={`flex-1 overflow-y-auto ${profile?.compact_mode ? "pt-4 pb-32 text-[15px]" : "pt-10 pb-44 text-[17px] sm:text-[18px]"
            } px-6 scroll-smooth`}
        >
          <div className="max-w-3xl mx-auto space-y-10">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${profile?.compact_mode ? "gap-4" : "gap-6"} items-start animate-in fade-in slide-in-from-bottom-2 duration-500`}
              >
                <div
                  className={`${profile?.compact_mode ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm"} flex-shrink-0 rounded-xl flex items-center justify-center font-black ${msg.role === "ai" ? aiBubbleBg : "bg-white/10 text-white"
                    }`}
                >
                  {msg.role === "ai"
                    ? "N"
                    : profile?.first_name?.[0] || profile?.username?.[0] || "U"}
                </div>

                <div className="max-w-none text-slate-200 pt-1 select-text selection:bg-white/20 leading-6 sm:leading-7 sm:leading-8 text-sm sm:text-base overflow-hidden">
                  {msg.role === "ai" ? (
                    (() => {
                      const isStreamingMessage = isLoading && i === messages.length - 1;

                      if (isStreamingMessage) {
                        const liveContent = stripPartialThink(msg.content);
                        const liveMathContent = sanitizeMathContent(liveContent);
                        const canRenderLiveMath = /[$\\]/.test(liveMathContent) && liveMathContent.length > 0;


                        return canRenderLiveMath ? (
                          <div className="prose prose-invert max-w-none prose-p:my-2 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-headings:my-3">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {liveMathContent}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{liveContent}</div>
                        );
                      }

                      const { steps, clean } = parseThoughtTrace(msg.content);
                      const finalContent = sanitizeMathContent(clean);
                      const shouldRenderFinalMath = /[$\\]/.test(finalContent);
                      const finalAnswerBoxClass =
                        "mt-1 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 sm:px-5 sm:py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

                      return (
                        <>
                          <div className={finalAnswerBoxClass}>
                            {shouldRenderFinalMath ? (
                              <div className="prose prose-invert max-w-none prose-p:my-2 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-headings:my-3">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {finalContent}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap">{clean}</div>
                            )}
                          </div>


                          {steps.length > 0 && (
                            <ThoughtTrace
                              steps={steps}
                              accentColor={profile?.theme_accent ?? "cyan"}
                            />
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <div>{msg.content}</div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-6 items-start">
                <div
                  className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center bg-zinc-800 ${accentColor} border border-white/10 font-black`}
                >
                  N
                </div>
                <div className="flex gap-1.5 pt-4">
                  <div className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce`} />
                  <div className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce delay-100`} />
                  <div className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce delay-200`} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER INPUT */}
        <footer className="absolute bottom-0 left-0 right-0 px-3 sm:px-6 lg:px-8 pb-3 sm:pb-6 pt-0 bg-gradient-to-t from-black via-black/95 to-transparent">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="max-w-[320px] mx-auto flex items-center p-1 bg-[#0a0a0a] rounded-xl border border-white/5 shadow-2xl w-full sm:w-auto">
              <button
                onClick={() => setIsNikiMode(false)}
                className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all outline-none ${!isNikiMode ? "bg-white/10 text-white" : "text-slate-600 hover:text-white"
                  }`}
              >
                Pure Logic
              </button>
              <button
                onClick={() => setIsNikiMode(true)}
                className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all outline-none ${isNikiMode ? `bg-white/5 ${accentColor}` : "text-slate-600 hover:text-white"
                  }`}
              >
                Nemanja Mode
              </button>
            </div>

            <FilePreview
              attached={attachedFile}
              onRemove={handleRemoveFile}
              accentColor={profile?.theme_accent ?? "cyan"}
            />

            <div className="bg-[#111] border border-white/10 rounded-[1.5rem] sm:rounded-[2rem] p-2 sm:p-3 shadow-2xl focus-within:border-white/30 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
                <FileUploadButton
                  onFileSelect={handleFileSelect}
                  onScreenshot={handleScreenshot}
                  accentColor={profile?.theme_accent ?? "cyan"}
                  disabled={isLoading}
                />

                <button
                  onClick={() => setLectureMode((prev) => !prev)}
                  disabled={isLoading}
                  className={`shrink-0 h-10 sm:h-12 px-3 sm:px-4 rounded-xl border text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all outline-none ${lectureMode
                    ? `${accentBorder} ${accentColor} bg-white/5`
                    : "border-white/10 text-slate-500 hover:text-slate-200 hover:border-white/20 bg-white/[0.02]"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title="Toggle Lecture Mode retrieval context"
                  aria-pressed={lectureMode}
                >
                  {lectureMode ? "Lecture On" : "Lecture Off"}
                </button>

                <input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  type="text"
                  placeholder={
                    attachedFile
                      ? `Ask about ${attachedFile.file.name}…`
                      : lectureMode
                        ? "Lecture Mode: ask with retrieval context..."
                        : isNikiMode
                          ? "Ask Professor Nikitovic..."
                          : "Specify mathematical query..."
                  }
                  className={`w-full min-w-0 bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none text-slate-100 px-4 sm:px-5 ${profile?.compact_mode ? "text-base py-3" : "text-base sm:text-lg py-3 sm:py-4"
                    } placeholder:text-slate-600 shadow-none`}
                />

                <button
                  onClick={handleSend}
                  disabled={isLoading || (!inputValue.trim() && !attachedFile)}
                  className={`shrink-0 w-full sm:w-auto bg-white ${accentHoverBg} disabled:bg-zinc-800 disabled:text-zinc-600 hover:text-white text-black px-6 sm:px-8 py-3 sm:py-4 rounded-[1.2rem] sm:rounded-[1.8rem] text-sm font-black transition-all uppercase tracking-tighter outline-none`}
                >
                  {isLoading ? "Thinking" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </section>

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        isNikiMode={isNikiMode}
        onToggleNikiMode={() => setIsNikiMode((prev) => !prev)}
        lectureMode={lectureMode}
        onToggleLectureMode={() => setLectureMode((prev) => !prev)}
        accentColor={profile?.theme_accent ?? "cyan"}
        hasActiveChat={!!currentChatId}
        currentChatTitle={chatHistory.find((c) => c.id === currentChatId)?.title ?? ""}
        onNewSession={startNewSession}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onClearChat={() => {
          if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
          setAttachedFile(null);
          setMessages(DEFAULT_GREETING);
          setCurrentChatId(null);
          currentChatIdRef.current = null;
        }}
        onRenameChat={() => {
          if (currentChatId) {
            setIsSidebarOpen(true);
            setRenamingChatId(currentChatId);
          }
          setIsPaletteOpen(false);
        }}
        onPinChat={async () => {
          if (!currentChatId) return;
          const chat = chatHistory.find((c) => c.id === currentChatId);
          if (!chat) return;
          await supabase
            .from("chats")
            .update({ is_pinned: !chat.is_pinned, updated_at: new Date().toISOString() })
            .eq("id", currentChatId);
          if (session?.user?.id) fetchHistory(session.user.id);
        }}
      />
    </main>
  );
}
