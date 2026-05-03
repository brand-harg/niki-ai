"use client";

import type { MouseEvent, ReactNode } from "react";

type ChatSidebarItem = {
  id: string;
  title: string;
  is_pinned?: boolean;
};

type ChatSidebarTab = "history" | "projects";

type ChatSidebarProps = {
  isOpen: boolean;
  activeTab: ChatSidebarTab;
  chatHistory: ChatSidebarItem[];
  currentChatId: string | null;
  chatHistoryLoading: boolean;
  chatHistoryNotice: string | null;
  sessionUserId?: string | null;
  confirmDeleteId: string | null;
  renamingChatId: string | null;
  renameValue: string;
  accentColor: string;
  accentBorder: string;
  accentGroupHoverBg: string;
  knowledgeBasePanel: ReactNode;
  onCloseSidebar: () => void;
  onStartNewSession: () => void;
  onSetActiveTab: (tab: ChatSidebarTab) => void;
  onLoadChat: (chatId: string) => void;
  onTogglePin: (event: MouseEvent, chatId: string, currentStatus: boolean) => void;
  onDeleteChat: (chatId: string) => void;
  onStartRename: (event: MouseEvent, chatId: string, currentTitle: string) => void;
  onCommitRename: (chatId: string) => void;
  onRenameValueChange: (value: string) => void;
  onCancelRename: () => void;
  onSetConfirmDeleteId: (chatId: string | null) => void;
};

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

export default function ChatSidebar({
  isOpen,
  activeTab,
  chatHistory,
  currentChatId,
  chatHistoryLoading,
  chatHistoryNotice,
  sessionUserId,
  confirmDeleteId,
  renamingChatId,
  renameValue,
  accentColor,
  accentBorder,
  accentGroupHoverBg,
  knowledgeBasePanel,
  onCloseSidebar,
  onStartNewSession,
  onSetActiveTab,
  onLoadChat,
  onTogglePin,
  onDeleteChat,
  onStartRename,
  onCommitRename,
  onRenameValueChange,
  onCancelRename,
  onSetConfirmDeleteId,
}: ChatSidebarProps) {
  const ChatRow = ({ chat }: { chat: ChatSidebarItem }) => (
    <div
      key={chat.id}
      onClick={() => renamingChatId !== chat.id && onLoadChat(chat.id)}
      className={`w-full flex justify-between items-center p-3 rounded-xl hover:bg-white/5 text-slate-400 text-xs group cursor-pointer transition-all ${currentChatId === chat.id ? "bg-white/5 text-white" : ""
        }`}
    >
      {renamingChatId === chat.id ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onBlur={() => onCommitRename(chat.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename(chat.id);
            if (e.key === "Escape") onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none border border-white/20 mr-2"
        />
      ) : (
        <span
          className="truncate group-hover:text-white transition-colors flex-1"
          onDoubleClick={(e) => onStartRename(e, chat.id, chat.title)}
          title="Double-click to rename"
        >
          {chat.title}
        </span>
      )}

      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          onClick={(e) => onTogglePin(e, chat.id, !!chat.is_pinned)}
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
                onDeleteChat(chat.id);
              }}
              className="text-red-400 hover:text-red-300 cursor-pointer font-bold"
            >
              Delete
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onSetConfirmDeleteId(null);
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
              onSetConfirmDeleteId(chat.id);
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
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onCloseSidebar}
          className="fixed inset-0 z-20 bg-black/55 backdrop-blur-[2px] md:hidden"
        />
      )}
      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 h-full bg-[#070707]/98 border-r border-white/10 z-30 flex flex-col shadow-[24px_0_80px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-all duration-300 md:relative md:shadow-none ${isOpen ? "w-[19.5rem] translate-x-0" : "w-[19.5rem] -translate-x-full md:w-0 md:translate-x-0 overflow-hidden"
          }`}
      >
        <div className="p-4 pt-6">
          <button
            onClick={onStartNewSession}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all group outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ${accentBorder} bg-white/[0.06] hover:bg-white/[0.1]`}
          >
            <span className="text-sm font-bold text-slate-100">
              New Chat
            </span>
            <div className={`p-1 rounded-md bg-white/5 ${accentGroupHoverBg} transition-all group-hover:text-white`}>
              <PlusIcon />
            </div>
          </button>
        </div>

        <div className="px-4 mb-6 flex gap-1">
          <button
            onClick={() => onSetActiveTab("history")}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all outline-none ${activeTab === "history"
              ? `bg-white/5 ${accentColor} ${accentBorder}`
              : "text-slate-500 border-transparent hover:text-slate-300"
              }`}
          >
            History
          </button>
          <button
            onClick={() => onSetActiveTab("projects")}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all outline-none ${activeTab === "projects"
              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
              : "text-slate-500 border-transparent hover:text-slate-300"
              }`}
          >
            Knowledge Base
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {activeTab === "history" ? (
            <div className="space-y-2">
              {chatHistoryNotice && (
                <p className="rounded-xl border border-amber-500/15 bg-amber-500/8 px-3 py-2 text-[10px] leading-5 text-amber-200/80">
                  {chatHistoryNotice}
                </p>
              )}
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

              {!sessionUserId && (
                <p className="text-center text-slate-600 text-[10px] uppercase tracking-widest py-8 leading-5">
                  Chat works while logged out. Log in to save and reopen conversations.
                </p>
              )}

              {sessionUserId && chatHistoryLoading && chatHistory.length === 0 && (
                <p className="text-center text-slate-700 text-[10px] uppercase tracking-widest py-8">
                  Loading saved chats...
                </p>
              )}

              {sessionUserId && !chatHistoryLoading && chatHistory.length === 0 && (
                <p className="text-center text-slate-700 text-[10px] uppercase tracking-widest py-8">
                  No saved chats yet
                </p>
              )}
            </div>
          ) : (
            knowledgeBasePanel
          )}
        </div>
      </aside>
    </>
  );
}
