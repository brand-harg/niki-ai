"use client";
import React, { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

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

// Safe sanitizer — never returns empty string, only cleans up malformed LaTeX delimiters
function sanitizeMathContent(content: string): string {
  if (!content || typeof content !== "string") return "";

  let cleaned = content
    .replace(/\\\[/g, "$$\n")
    .replace(/\\\]/g, "\n$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  const ddCount = (cleaned.match(/\$\$/g) || []).length;
  if (ddCount % 2 !== 0) {
    const lastIdx = cleaned.lastIndexOf("$$");
    cleaned = cleaned.slice(0, lastIdx) + cleaned.slice(lastIdx + 2);
  }

  const normalized = cleaned.replace(/\$\$/g, "");
  const sdCount = (normalized.match(/\$/g) || []).length;
  if (sdCount % 2 !== 0) {
    const lastIdx = cleaned.lastIndexOf("$");
    if (cleaned[lastIdx - 1] !== "$" && cleaned[lastIdx + 1] !== "$") {
      cleaned = cleaned.slice(0, lastIdx) + cleaned.slice(lastIdx + 1);
    }
  }

  return cleaned;
}

export default function Home() {
  const router = useRouter();

  // --- STATE ---
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Start as true so we never flash the "not logged in" state before Supabase responds
  const [authChecked, setAuthChecked] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isNikiMode, setIsNikiMode] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "projects">("history");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isUnmountingRef = useRef(false);
  // Track whether a stream is actively running so auth events don't reset state
  const isStreamingRef = useRef(false);
  // Track the last session user id to avoid redundant re-fetches
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

  const defaultGreeting: Message[] = [{ role: "ai", content: "What do you need help with?" }];

  // --- BOOT & SYNC SEQUENCE ---
  useEffect(() => {
    let mounted = true;
    isUnmountingRef.current = false;

    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session);
      setAuthChecked(true);

      if (session) {
        lastSessionIdRef.current = session.user.id;
        setProfileLoaded(false);
        await fetchHistory(session.user.id);
        await fetchProfile(session.user.id);
      } else {
        lastSessionIdRef.current = null;
        setProfile(null);
        setProfileLoaded(true);
        setChatHistory([]);
        setCurrentChatId(null);
        currentChatIdRef.current = null;
        setMessages(defaultGreeting);
      }
    };

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      const newUserId = session?.user?.id ?? null;

      // If a stream is running, don't disrupt state at all
      if (isStreamingRef.current) return;

      // If it's the same user (e.g. token refresh), skip redundant re-fetch
      if (newUserId && newUserId === lastSessionIdRef.current) {
        // Still update the session object (token may have refreshed) but don't reset UI
        setSession(session);
        return;
      }

      lastSessionIdRef.current = newUserId;
      setSession(session);

      if (session) {
        setProfileLoaded(false);
        await fetchHistory(session.user.id);
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setProfileLoaded(true);
        setChatHistory([]);
        setCurrentChatId(null);
        currentChatIdRef.current = null;
        setMessages(defaultGreeting);
      }
    });

    return () => {
      mounted = false;
      isUnmountingRef.current = true;
      abortControllerRef.current?.abort();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleWindowClick = () => setConfirmDeleteId(null);
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  useEffect(() => {
    if (messages.length > 0) return;
    if (session && !profileLoaded) return;

    setMessages(defaultGreeting);

    if (profile?.default_niki_mode !== undefined) {
      setIsNikiMode(profile.default_niki_mode);
    }
  }, [session, profileLoaded, profile]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Keep stream alive when tab is hidden — prevent page from being frozen
  useEffect(() => {
    const handleVisibilityChange = () => {
      // No-op: just having the listener prevents some browsers from
      // aggressively throttling/freezing the fetch stream when hidden
      console.log("Visibility changed:", document.visibilityState);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // --- DATABASE ACTIONS ---
  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

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

    await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

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
          content: msg.text || msg.text || "",
        }));

      setMessages(formatted);
    } else {
      setMessages(defaultGreeting);
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
      setMessages(defaultGreeting);
    }

    setConfirmDeleteId(null);
  };

  const startNewSession = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isStreamingRef.current = false;
    setIsLoading(false);
    setCurrentChatId(null);
    currentChatIdRef.current = null;
    setMessages(defaultGreeting);
    setConfirmDeleteId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  // --- CORE SEND ENGINE ---
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    const currentName = profile?.first_name || profile?.username || "User";

    let chatId = currentChatIdRef.current;

    const updatedHistory: Message[] = [...messages, { role: "user", content: userText }];

    setMessages(updatedHistory);
    setInputValue("");
    setIsLoading(true);
    isStreamingRef.current = true;

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = window.setTimeout(() => {
      console.log("Client timeout hit: aborting stream.");
      controller.abort();
    }, 120000);

    try {
      if (!chatId && session) {
        const { data: newChat } = await supabase
          .from("chats")
          .insert({
            user_id: session.user.id,
            title: userText.substring(0, 30),
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

      if (chatId && session) {
        await supabase.from("messages").insert({ chat_id: chatId, role: "user", text: userText });

        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString(), title: userText.substring(0, 30) })
          .eq("id", chatId);
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
          chatId: chatId,
          trainConsent: profile?.train_on_data,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
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
              const updatedMessages = [...prev];
              updatedMessages[updatedMessages.length - 1] = {
                role: "ai",
                content: aiReply,
              };
              return updatedMessages;
            });
          }
        } catch (streamError: any) {
          if (streamError?.name === "AbortError") {
            console.log("Reader aborted.");
          } else {
            console.error("Reader stream failed:", streamError);
            throw streamError;
          }
        } finally {
          reader.releaseLock();
        }
      }

      console.log("Streaming Complete. Final Reply length:", aiReply.length);

      if (chatId && session && aiReply.length > 0) {
        await supabase.from("messages").insert({ chat_id: chatId, role: "ai", text: aiReply });
        await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.log("handleSend aborted.");
      } else {
        console.error("handleSend error:", error);
        setMessages((prev) => [...prev, { role: "ai", content: "System Error: Vault connection lost." }]);
      }
    } finally {
      window.clearTimeout(timeoutId);
      isStreamingRef.current = false;

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      if (!isUnmountingRef.current) {
        setIsLoading(false);
      }

      if (session?.user?.id) fetchHistory(session.user.id);
    }
  };

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

        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {activeTab === "history" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2 py-2">
                <div className={accentColor}>
                  <PinIcon />
                </div>
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Pinned</span>
              </div>

              {chatHistory
                .filter((c) => c.is_pinned)
                .map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => loadChat(chat.id)}
                    className="w-full flex justify-between items-center p-3 rounded-xl hover:bg-white/5 text-slate-300 truncate text-xs outline-none group"
                  >
                    <span className="truncate group-hover:text-white transition-colors">{chat.title}</span>
                    <div className="flex items-center gap-2">
                      <div onClick={(e) => togglePin(e, chat.id, true)} className={`${accentColor} cursor-pointer`}>
                        ★
                      </div>
                      {confirmDeleteId === chat.id ? (
                        <div className="flex items-center gap-2">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChat(chat.id);
                            }}
                            className="text-red-400 hover:text-red-300 cursor-pointer text-xs font-bold"
                          >
                            Delete
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="text-slate-400 hover:text-white cursor-pointer text-xs"
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
                  </button>
                ))}

              <div className="h-px bg-white/5 my-4" />

              {chatHistory
                .filter((c) => !c.is_pinned)
                .map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => loadChat(chat.id)}
                    className="w-full flex justify-between items-center p-3 rounded-xl hover:bg-white/5 text-slate-400 truncate text-xs outline-none group"
                  >
                    <span className="truncate group-hover:text-white transition-colors">{chat.title}</span>
                    <div className="flex items-center gap-2">
                      <div
                        onClick={(e) => togglePin(e, chat.id, false)}
                        className="hover:text-white cursor-pointer opacity-20 hover:opacity-100 transition-opacity"
                      >
                        ☆
                      </div>
                      {confirmDeleteId === chat.id ? (
                        <div className="flex items-center gap-2">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChat(chat.id);
                            }}
                            className="text-red-400 hover:text-red-300 cursor-pointer text-xs font-bold"
                          >
                            Delete
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="text-slate-400 hover:text-white cursor-pointer text-xs"
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
                  </button>
                ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl bg-white/[0.02] border ${accentBorder}`}>
                <p className={`text-[10px] font-black ${accentColor} uppercase mb-1`}>Active Space</p>
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
              {/* Show nothing until auth is checked to avoid flash */}
              {!authChecked ? (
                <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
              ) : session ? (
                <button
                  onClick={() => router.push("/settings")}
                  className="group flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-white/5 transition-all border border-transparent hover:border-white/10 outline-none"
                >
                  <div
                    className={`w-8 h-8 rounded-full ${accentBg} flex items-center justify-center font-black text-[10px] text-white overflow-hidden border border-white/10 shadow-lg`}
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="User" className="w-full h-full object-cover" />
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
          ref={scrollRef}
          className={`flex-1 overflow-y-auto ${profile?.compact_mode ? "pt-4 pb-32 text-sm" : "pt-10 pb-44 text-xl"} px-6 scroll-smooth`}
        >
          <div className="max-w-3xl mx-auto space-y-10">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${profile?.compact_mode ? "gap-4" : "gap-6"} items-start animate-in fade-in slide-in-from-bottom-2 duration-500`}
              >
                <div
                  className={`${profile?.compact_mode ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm"
                    } flex-shrink-0 rounded-xl flex items-center justify-center font-black ${msg.role === "ai" ? aiBubbleBg : "bg-white/10 text-white"
                    }`}
                >
                  {msg.role === "ai" ? "N" : profile?.first_name?.[0] || profile?.username?.[0] || "U"}
                </div>

                <div className="max-w-none text-slate-200 pt-1 select-text selection:bg-white/20 whitespace-pre-wrap leading-7">
                  {msg.role === "ai" ? (
                    /[$\\]/.test(msg.content) ? (
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {sanitizeMathContent(msg.content)}
                      </ReactMarkdown>
                    ) : (
                      <div>{msg.content}</div>
                    )
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

        {/* FOOTER */}
        <footer className="absolute bottom-0 left-0 right-0 p-8 pt-0 bg-gradient-to-t from-black via-black/95 to-transparent">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="max-w-[280px] mx-auto flex items-center p-1 bg-[#0a0a0a] rounded-xl border border-white/5 shadow-2xl">
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

            <div className="bg-[#111] border border-white/10 rounded-[2rem] p-2 pl-8 flex items-center gap-5 shadow-2xl focus-within:border-white/30 transition-all">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                type="text"
                placeholder={isNikiMode ? "Ask Professor Nikitovic..." : "Specify mathematical query..."}
                className={`flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none text-slate-100 ${profile?.compact_mode ? "text-base py-3" : "text-lg py-4"
                  } placeholder:text-slate-800 shadow-none`}
              />
              <button
                onClick={handleSend}
                disabled={isLoading}
                className={`bg-white ${accentHoverBg} disabled:bg-zinc-800 disabled:text-zinc-600 hover:text-white text-black ${profile?.compact_mode ? "px-6 py-3" : "px-10 py-4"
                  } rounded-[1.8rem] text-sm font-black transition-all uppercase tracking-tighter outline-none`}
              >
                {isLoading ? "Thinking" : "Send"}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}