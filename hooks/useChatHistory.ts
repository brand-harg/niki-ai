"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from "react";
import { supabase } from "@/lib/supabaseClient";

const CURRENT_CHAT_ID_STORAGE_KEY = "niki_current_chat_id";

export type ChatItem = {
  id: string;
  title: string;
  is_pinned?: boolean;
  updated_at?: string;
};

export type ChatHistoryMessageRow = {
  role?: unknown;
  text?: unknown;
  citations?: unknown;
  mode?: unknown;
  teaching_enabled?: unknown;
  knowledge_base_course?: unknown;
  requested_course?: unknown;
  knowledge_base_mismatch?: unknown;
};

type UseChatHistoryOptions<Message> = {
  sessionUserId?: string | null;
  isStreamingRef: MutableRefObject<boolean>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  resetFreshChat: () => void;
  formatLoadedMessages: (rows: ChatHistoryMessageRow[]) => Message[];
};

function getCurrentChatStorageKey(userId: string) {
  return `${CURRENT_CHAT_ID_STORAGE_KEY}:${userId}`;
}

export function useChatHistory<Message>({
  sessionUserId,
  isStreamingRef,
  setMessages,
  resetFreshChat,
  formatLoadedMessages,
}: UseChatHistoryOptions<Message>) {
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [chatHistoryNotice, setChatHistoryNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const currentChatIdRef = useRef<string | null>(null);
  const chatLoadSequenceRef = useRef(0);
  const activeSessionUserIdRef = useRef<string | null>(sessionUserId ?? null);

  useEffect(() => {
    activeSessionUserIdRef.current = sessionUserId ?? null;
  }, [sessionUserId]);

  useEffect(() => {
    const userId = sessionUserId;
    if (!userId) return;

    try {
      const storageKey = getCurrentChatStorageKey(userId);
      if (currentChatId) {
        window.localStorage.setItem(storageKey, currentChatId);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage persistence failures.
    }
  }, [currentChatId, sessionUserId]);

  const setActiveChatId = useCallback((chatId: string | null) => {
    setCurrentChatId(chatId);
    currentChatIdRef.current = chatId;
  }, []);

  const invalidateChatHistoryLoads = useCallback(() => {
    chatLoadSequenceRef.current += 1;
    setChatHistoryLoading(false);
  }, []);

  const clearChatHistoryState = useCallback((notice: string | null = null) => {
    chatLoadSequenceRef.current += 1;
    setChatHistoryLoading(false);
    setChatHistory([]);
    setChatHistoryNotice(notice);
    setActiveChatId(null);
    setConfirmDeleteId(null);
    setRenamingChatId(null);
  }, [setActiveChatId]);

  const loadChat = async (
    chatId: string,
    options?: { userId?: string; refreshHistory?: boolean }
  ) => {
    const userId = options?.userId ?? sessionUserId;
    if (!userId) {
      setChatHistoryNotice("Log in to reopen saved conversations.");
      return;
    }

    const loadToken = chatLoadSequenceRef.current + 1;
    chatLoadSequenceRef.current = loadToken;
    setChatHistoryNotice(null);
    setRenamingChatId(null);

    const { data: chatRow, error: chatError } = await supabase
      .from("chats")
      .select("id, title, is_pinned")
      .eq("id", chatId)
      .eq("user_id", userId)
      .maybeSingle();

    if (loadToken !== chatLoadSequenceRef.current) return;

    if (chatError || !chatRow) {
      console.log("Load chat ownership check failed:", chatError);
      setChatHistoryNotice("This conversation is no longer available.");
      if (currentChatIdRef.current === chatId) {
        setActiveChatId(null);
        resetFreshChat();
      }
      void fetchHistory(userId);
      return;
    }

    setActiveChatId(chatId);

    await supabase
      .from("chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId)
      .eq("user_id", userId);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (loadToken !== chatLoadSequenceRef.current) return;

    if (error) {
      console.log("Load chat error:", error);
      setChatHistoryNotice("I couldn't load messages for this conversation.");
      return;
    }

    if (data && data.length > 0) {
      setMessages(formatLoadedMessages(data as ChatHistoryMessageRow[]));
    } else {
      resetFreshChat();
    }

    if (options?.refreshHistory !== false) void fetchHistory(userId);
  };

  const fetchHistory = async (
    userId: string,
    options?: { restoreSelected?: boolean }
  ): Promise<ChatItem[]> => {
    const loadToken = chatLoadSequenceRef.current;
    setChatHistoryLoading(true);
    setChatHistoryNotice(null);
    try {
      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .eq("user_id", userId)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (loadToken !== chatLoadSequenceRef.current) {
        return [];
      }

      if (error) {
        console.log("Fetch history error:", error);
        setChatHistoryNotice("I couldn't load chat history. Try refreshing.");
        return [];
      }

      const nextHistory = (data ?? []) as ChatItem[];
      setChatHistory(nextHistory);

      const activeChatStillExists =
        !!currentChatIdRef.current &&
        nextHistory.some((chat) => chat.id === currentChatIdRef.current);

      if (currentChatIdRef.current && !activeChatStillExists && !isStreamingRef.current) {
        setActiveChatId(null);
        resetFreshChat();
      }

      if (options?.restoreSelected && !currentChatIdRef.current) {
        try {
          const storedChatId = window.localStorage.getItem(getCurrentChatStorageKey(userId));
          if (storedChatId && nextHistory.some((chat) => chat.id === storedChatId)) {
            void loadChat(storedChatId, { userId, refreshHistory: false });
          }
        } catch {
          // Ignore storage read failures.
        }
      }

      return nextHistory;
    } finally {
      if (loadToken === chatLoadSequenceRef.current) {
        setChatHistoryLoading(false);
      }
    }
  };

  const registerCreatedChat = (newChat: ChatItem) => {
    setActiveChatId(newChat.id);
    setChatHistory((prev) => {
      const withoutDuplicate = prev.filter((chat) => chat.id !== newChat.id);
      return [newChat, ...withoutDuplicate];
    });
  };

  const togglePin = async (e: MouseEvent, chatId: string, currentStatus: boolean) => {
    e.stopPropagation();
    if (!sessionUserId) {
      setChatHistoryNotice("Log in to pin saved conversations.");
      return;
    }

    const userId = sessionUserId;
    const { error } = await supabase
      .from("chats")
      .update({ is_pinned: !currentStatus, updated_at: new Date().toISOString() })
      .eq("id", chatId)
      .eq("user_id", sessionUserId);

    if (activeSessionUserIdRef.current !== userId) return;

    if (error) {
      console.log("Toggle pin error:", error);
      setChatHistoryNotice("I couldn't update this conversation.");
      return;
    }

    void fetchHistory(userId);
  };

  const toggleCurrentChatPin = async () => {
    if (!currentChatId || !sessionUserId) return;
    const userId = sessionUserId;
    const chat = chatHistory.find((candidate) => candidate.id === currentChatId);
    if (!chat) return;
    await supabase
      .from("chats")
      .update({ is_pinned: !chat.is_pinned, updated_at: new Date().toISOString() })
      .eq("id", currentChatId)
      .eq("user_id", sessionUserId);
    if (activeSessionUserIdRef.current !== userId) return;
    void fetchHistory(userId);
  };

  const deleteChat = async (chatId: string) => {
    if (!sessionUserId) return;

    const userId = sessionUserId;
    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId)
      .eq("user_id", sessionUserId);
    if (activeSessionUserIdRef.current !== userId) return;
    if (error) {
      console.log("Delete chat error:", error);
      setChatHistoryNotice("I couldn't delete this conversation.");
      return;
    }

    setChatHistory((prev) => prev.filter((chat) => chat.id !== chatId));

    if (currentChatId === chatId) {
      setActiveChatId(null);
      resetFreshChat();
    }

    setConfirmDeleteId(null);
  };

  const startRename = (e: MouseEvent, chatId: string, currentTitle: string) => {
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
    if (!sessionUserId) {
      setChatHistoryNotice("Log in to rename saved conversations.");
      setRenamingChatId(null);
      return;
    }

    const userId = sessionUserId;
    const { error } = await supabase
      .from("chats")
      .update({ title: trimmed, updated_at: new Date().toISOString() })
      .eq("id", chatId)
      .eq("user_id", sessionUserId);

    if (activeSessionUserIdRef.current !== userId) return;

    if (error) {
      console.log("Rename error:", error);
      setChatHistoryNotice("I couldn't rename this conversation.");
      setRenamingChatId(null);
      return;
    }

    setChatHistory((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, title: trimmed } : chat))
    );

    setRenamingChatId(null);
  };

  return {
    chatHistory,
    currentChatId,
    setCurrentChatId: setActiveChatId,
    chatHistoryLoading,
    chatHistoryNotice,
    setChatHistoryNotice,
    confirmDeleteId,
    setConfirmDeleteId,
    renamingChatId,
    setRenamingChatId,
    renameValue,
    setRenameValue,
    currentChatIdRef,
    chatLoadSequenceRef,
    invalidateChatHistoryLoads,
    clearChatHistoryState,
    fetchHistory,
    loadChat,
    registerCreatedChat,
    togglePin,
    toggleCurrentChatPin,
    deleteChat,
    startRename,
    commitRename,
  };
}
