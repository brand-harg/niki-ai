"use client";
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import ThoughtTrace from "@/components/ThoughtTrace";
import CommandPalette from "@/components/CommandPalette";
import ChatModeControls from "@/components/ChatModeControls";
import KnowledgeBasePanel from "@/components/KnowledgeBasePanel";
import NemanjaRoadmap from "@/components/NemanjaRoadmap";
import ChatEmptyState from "@/components/chat/ChatEmptyState";
import CitationCard from "@/components/chat/CitationCard";
import ChatSidebar from "@/components/chat/ChatSidebar";
import CodeBlock from "@/components/chat/CodeBlock";
import LoginGatePrompt from "@/components/chat/LoginGatePrompt";
import RelatedLecturesCard from "@/components/chat/RelatedLecturesCard";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Image from "next/image";
import "katex/dist/katex.min.css";
import FileUploadButton from "@/components/FileUploadButton";
import FilePreview, { type AttachedFile } from "@/components/FilePreview";
import html2canvas from "html2canvas";
import { inferCourseFromMathTopic } from "@/lib/courseFilters";
import { clearAuthCallbackUrl, hasAuthCallbackParams, recoverSessionFromUrl } from "@/lib/authRecovery";
import { ensureProfileForSession, mergeProfileWithFallback, profileFallbackFromSession } from "@/lib/authProfile";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import ArtifactWorkspacePanel from "@/components/ArtifactWorkspacePanel";
import { useArtifactWorkspace } from "@/hooks/useArtifactWorkspace";
import { useKnowledgeBasePanel } from "@/hooks/useKnowledgeBasePanel";
import { sanitizeMathContent } from "@/lib/mathFormatting";
import {
  ALL_GREETING_TEXTS,
  buildRecentContextTopic,
  confidenceFromCitations,
  createGreeting,
  createHistoryMessage,
  dedupeCitations,
  formatPinnedTimestamp,
  getErrorMessage,
  getFocusSuggestion,
  isGreetingOnly,
  isLikelyKnowledgeFileName,
  isPracticeRequestText,
  normalizeCourseKey,
  parseThoughtTrace,
  stripPartialThink,
} from "@/lib/chatDisplay";
import type {
  KnowledgeBaseCourse,
} from "@/lib/knowledgeBasePanel";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  readLocalPersonalizationSettings,
  writeLocalPersonalizationSettings,
  type PersonalizationSettings,
} from "@/lib/personalization";
import {
  DEFAULT_GENERAL_SETTINGS,
  readLocalGeneralSettings,
  type GeneralSettings,
} from "@/lib/generalSettings";

// --- ICONS ---
const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h12m-12 6h16" />
  </svg>
);

type Message = {
  role: "ai" | "user";
  content: string;
  citations?: RagCitation[];
  relatedLectures?: RelatedLecture[];
  retrievalConfidence?: RagResponse["retrievalConfidence"];
  mode?: "pure" | "nemanja";
  teachingEnabled?: boolean;
  knowledgeBaseCourse?: string;
  requestedCourse?: string;
  knowledgeBaseMismatch?: boolean;
};

type AppSession = { user: { id: string } } | null;
type AppProfile = {
  id?: string;
  first_name?: string;
  username?: string;
  theme_accent?: "cyan" | "green" | "amber";
  default_niki_mode?: boolean;
  train_on_data?: boolean;
  is_searchable?: boolean;
  avatar_url?: string;
  current_unit?: string;
  compact_mode?: boolean;
  cmd_enter_to_send?: boolean;
  share_usage_data?: boolean;
  about_user?: string;
  response_style?: string;
};

const AUTH_TIMEOUT_MS = 6000;
const CHAT_FOCUS_STORAGE_KEY = "niki_chat_focus";
const TRAINING_PROMPT_SNOOZE_KEY = "niki_train_on_data_prompt_until";
const TRAINING_PROMPT_SNOOZE_MS = 1000 * 60 * 60 * 24 * 14;
const CURRENT_CHAT_MODE_STORAGE_KEY = "niki_current_chat_mode";
const CURRENT_SESSION_SNAPSHOT_STORAGE_KEY = "niki_current_session_snapshot";
const PENDING_HOME_ACTION_STORAGE_KEY = "niki_pending_home_action";
const MOBILE_CHAT_CONTROLS_EXPANDED_KEY = "niki_mobile_chat_controls_expanded";
const CURRENT_CHAT_ID_STORAGE_KEY = "niki_current_chat_id";

type ChatFocusState = {
  course: string;
  topic: string;
};

type PendingHomeAction = "new-chat" | "open-artifact";

type LoginGatePrompt = {
  title: string;
  detail: string;
};

const ONBOARDING_PROMPTS = [
  "Create notes on derivatives ->",
  "Explain limits step-by-step ->",
  "Give me practice problems ->",
  "Help me study for Calc 1 ->",
];

const KNOWLEDGE_BASE_COURSES: KnowledgeBaseCourse[] = [
  { label: "Elementary Algebra", courseContext: "Elementary Algebra", shortLabel: "Elem Alg" },
  { label: "PreCalc 1", courseContext: "PreCalc1", shortLabel: "PreCalc 1" },
  { label: "Calc 1", courseContext: "Calculus 1", shortLabel: "Calc 1" },
  { label: "Calc 2", courseContext: "Calculus 2", shortLabel: "Calc 2" },
  { label: "Calc 3", courseContext: "Calculus 3", shortLabel: "Calc 3" },
  { label: "Differential Equations", courseContext: "Differential Equations", shortLabel: "Diff Eq" },
  { label: "Statistics", courseContext: "Statistics", shortLabel: "Statistics" },
];

function withTimeout<T>(promise: PromiseLike<T>, label: string, ms = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

type ChatItem = {
  id: string;
  title: string;
  is_pinned?: boolean;
  updated_at?: string;
};
type RagCitation = {
  lectureTitle?: string;
  professor?: string;
  timestampStartSeconds?: number;
  timestampUrl?: string | null;
  course?: string;
  similarity?: number;
  excerpt?: string;
  sectionHint?: string;
};
type RagResponse = {
  context?: string[];
  styleSnippets?: { text: string; personaTag?: string }[];
  citations?: RagCitation[];
  retrievalConfidence?: "high" | "medium" | "low" | "none";
  error?: string;
};
type RelatedLecture = {
  id: string;
  lecture_title: string;
  course: string;
  professor: string;
  video_url: string;
};
type CalendarEventContextRow = {
  title: string;
  event_date: string;
  event_time: string;
  course: string | null;
};
type SpeechRecognitionResultLike = {
  [index: number]: { transcript: string };
  isFinal?: boolean;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getCurrentChatStorageKey(userId: string) {
  return `${CURRENT_CHAT_ID_STORAGE_KEY}:${userId}`;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function isLectureInventoryRequest(message: string) {
  return (
    /\b(?:what|which|list|show|all)\b[\s\S]{0,50}\blectures?\b/i.test(message) ||
    /\blectures?\b[\s\S]{0,40}\b(?:have|got|available|list|show)\b/i.test(message) ||
    /\b(?:show|list)\s+me\s+(?:all\s+)?(?:of\s+)?(?:calc(?:ulus)?\s*[123]|pre\s*calc(?:ulus)?\s*1?|precalc\s*1?|stats?|statistics|differential\s+equations?|elementary\s+algebra)\b/i.test(message) ||
    /\b(?:calc(?:ulus)?\s*[123]|pre\s*calc(?:ulus)?\s*1?|precalc\s*1?|stats?|statistics|differential\s+equations?|elementary\s+algebra)\b[\s\S]{0,24}\b(?:lectures?|all)\b/i.test(message)
  );
}

function isExplicitKnowledgeBaseRequest(message: string) {
  return (
    /\b(source|sources|citation|citations|cite|evidence|transcript|clip|clips|timestamp|timestamps|video|videos|watch|grounded|lecture connection)\b/i.test(
      message
    ) ||
    /where did (?:that|this) come from/i.test(message) ||
    /show (?:me )?(?:the )?(?:source|sources|citations|evidence)/i.test(message) ||
    /peek evidence/i.test(message) ||
    /\b(lecture|lectures)\b/i.test(message)
  );
}

function getCalloutKind(text: string) {
  if (/^Efficiency Tip\b/i.test(text)) return "math-callout-efficiency";
  if (/^Concept Check\b/i.test(text)) return "math-callout-concept";
  if (/^Common Mistake\b/i.test(text)) return "math-callout-warning";
  if (/^Checkpoint\b/i.test(text)) return "math-callout-checkpoint";
  if (/^Lecture (Connection|Source)\b/i.test(text)) return "math-callout-lecture";
  return "";
}

function getNodeText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (React.isValidElement(child)) {
        const props = child.props as { children?: React.ReactNode };
        return getNodeText(props.children);
      }

      return "";
    })
    .join("");
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
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [chatHistoryNotice, setChatHistoryNotice] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isNikiMode, setIsNikiMode] = useState(false);
  const [lectureMode, setLectureMode] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"history" | "projects">("history");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [chatFocus, setChatFocus] = useState<ChatFocusState>({
    course: "",
    topic: "",
  });
  const [personalization, setPersonalization] = useState<PersonalizationSettings>(
    DEFAULT_PERSONALIZATION_SETTINGS
  );
  const [localGeneralSettings, setLocalGeneralSettings] = useState<GeneralSettings>(
    DEFAULT_GENERAL_SETTINGS
  );
  const [focusModeExpanded, setFocusModeExpanded] = useState<boolean | null>(null);
  const [mobileControlsExpanded, setMobileControlsExpanded] = useState(false);
  const [studyProgressNotice, setStudyProgressNotice] = useState<string | null>(null);
  const [isRoadmapOpen, setIsRoadmapOpen] = useState(false);
  const [loginGatePrompt, setLoginGatePrompt] = useState<LoginGatePrompt | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [trainingPromptSnoozedUntil, setTrainingPromptSnoozedUntil] = useState<number | null>(null);
  const [trainingPromptHidden, setTrainingPromptHidden] = useState(false);
  const [trainingPromptBusy, setTrainingPromptBusy] = useState(false);
  const headerAvatarUrl = resolveAvatarUrl(profile?.avatar_url);

  // --- RENAME STATE ---
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatViewportRef = useRef<HTMLDivElement>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const chatLoadSequenceRef = useRef(0);
  const attachedFileRef = useRef<AttachedFile | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isUnmountingRef = useRef(false);
  const isStreamingRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null);
  const profileLoadedRef = useRef(false);
  const lastFocusAnnouncementRef = useRef<string>("");

  // --- DYNAMIC THEME ENGINE ---
  const effectiveThemeAccent = profile?.theme_accent ?? localGeneralSettings.theme_accent;
  const effectiveCompactMode = profile?.compact_mode ?? localGeneralSettings.compact_mode;
  const effectiveCmdEnterToSend =
    profile?.cmd_enter_to_send ?? localGeneralSettings.cmd_enter_to_send;

  const isGreen = effectiveThemeAccent === "green";
  const isAmber = effectiveThemeAccent === "amber";

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

  const {
    activeKnowledgeCourse,
    pinnedSyllabus,
    recentKnowledgeContexts,
    knowledgeBaseStatus,
    isSyllabusPreviewOpen,
    sourceHealthExpanded,
    syllabusUploadInputRef,
    activeLectureSetLabel,
    activeLectureSetShortLabel,
    activeLectureIndexedCount,
    sourceHealth,
    sourceHealthCourseBreakdown,
    attachedKnowledgeButtonLabel,
    knowledgeBaseActivationCourse,
    setPinnedSyllabus,
    setIsSyllabusPreviewOpen,
    setSourceHealthExpanded,
    handleKnowledgeFileInputChange,
    handlePinAttachedSyllabus,
    handleSetActiveLectureSet,
    handleClearActiveLectureSet,
    handleSelectKnowledgeCourse,
    applyKnowledgeCourse,
    handleRestoreRecentContext,
    trackRecentKnowledgeContext,
  } = useKnowledgeBasePanel({
    knowledgeBaseCourses: KNOWLEDGE_BASE_COURSES,
    chatFocus,
    setChatFocus,
    sessionUserId: session?.user?.id,
    attachedFile,
    buildRecentContextTopic,
    isLikelyKnowledgeFileName,
    onRequireLogin: showLoginGatePrompt,
  });

  const focusCourseLabel = useMemo(() => {
    return (
      KNOWLEDGE_BASE_COURSES.find((course) => course.courseContext === chatFocus.course)?.label ??
      "No subject selected"
    );
  }, [chatFocus.course]);

  const focusSuggestion = useMemo(() => {
    if (chatFocus.topic.trim()) return null;
    return getFocusSuggestion(chatFocus.course, inputValue);
  }, [chatFocus.course, chatFocus.topic, inputValue]);

  const focusSummary = useMemo(() => {
    const trimmedTopic = chatFocus.topic.trim();
    if (!chatFocus.course) {
      return trimmedTopic ? `No subject selected · ${trimmedTopic}` : "No subject selected";
    }
    return `${focusCourseLabel} · ${trimmedTopic || "No topic set"}`;
  }, [chatFocus.course, chatFocus.topic, focusCourseLabel]);

  const focusStatusLabel = useMemo(() => {
    const trimmedTopic = chatFocus.topic.trim();
    if (!chatFocus.course && !trimmedTopic) return "No course selected";
    if (!chatFocus.course) return `Focus: ${trimmedTopic}`;
    if (!trimmedTopic) return `Focus: ${focusCourseLabel}`;
    return `Focus: ${focusCourseLabel} • ${trimmedTopic}`;
  }, [chatFocus.course, chatFocus.topic, focusCourseLabel]);

  const sessionStudyLabel = useMemo(() => {
    const trimmedTopic = chatFocus.topic.trim();
    if (!chatFocus.course) return "";
    if (!trimmedTopic) return `Studying: ${focusCourseLabel}`;
    return `Studying: ${focusCourseLabel} • ${trimmedTopic}`;
  }, [chatFocus.course, chatFocus.topic, focusCourseLabel]);

  const mobileControlsSummary = useMemo(() => {
    const trimmedTopic = chatFocus.topic.trim();
    const focusPart = !chatFocus.course
      ? trimmedTopic
        ? `No course • ${trimmedTopic}`
        : "No course"
      : trimmedTopic
        ? `${focusCourseLabel} • ${trimmedTopic}`
        : focusCourseLabel;

    return [
      isNikiMode ? "Nemanja" : "Pure Logic",
      isNikiMode ? (lectureMode ? "Teaching ON" : "Teaching OFF") : null,
      focusPart,
    ]
      .filter(Boolean)
      .join(" • ");
  }, [chatFocus.course, chatFocus.topic, focusCourseLabel, isNikiMode, lectureMode]);

  const practiceModeActive = useMemo(() => {
    return messages.some(
      (message) => message.role === "user" && isPracticeRequestText(message.content)
    );
  }, [messages]);

  const substantiveMessageCount = useMemo(
    () => messages.filter((msg) => !ALL_GREETING_TEXTS.has(msg.content ?? "")).length,
    [messages]
  );

  const {
    artifactPanel,
    visibleRecentArtifactResume,
    artifactCreationNotice,
    artifactSaveNotice,
    savedArtifacts,
    publicArtifacts,
    artifactPreviewRef,
    artifactPreviewContent,
    artifactHasUnsavedChanges,
    recentArtifacts,
    closeArtifactWorkspace,
    openStoredArtifactFromStorage,
    handleOpenArtifact,
    handleArtifactContentChange,
    handleArtifactVisibilityToggle,
    handleArtifactRefresh,
    handleOpenSavedArtifact,
    handleOpenPublicArtifact,
    handleResumeRecentArtifact,
    dismissRecentArtifactResume,
    handleSaveArtifact,
    handleDeleteSavedArtifact,
    handleArtifactExportPdf,
    reopenCreationNoticeArtifact,
    artifactKindLabel,
  } = useArtifactWorkspace({
    sessionUserId: session?.user?.id,
    profileIsSearchable: profile?.is_searchable,
    messages,
    chatFocus,
    activeKnowledgeCourse,
    parseMessageContent: parseThoughtTrace,
    onRequireLogin: showLoginGatePrompt,
    onStudyProgress: setStudyProgressNotice,
    onOpenLibraryArtifact: () => setActiveTab("projects"),
  });

  const shouldShowTrainingPrompt =
    !!session?.user?.id &&
    profileLoaded &&
    profile?.train_on_data === false &&
    substantiveMessageCount >= 4 &&
    !trainingPromptHidden &&
    (!trainingPromptSnoozedUntil || trainingPromptSnoozedUntil <= Date.now());

  const shouldShowOnboarding =
    !artifactPanel &&
    !isLoading &&
    substantiveMessageCount === 0 &&
    isGreetingOnly(messages);

  const effectivePersonalization = useMemo(
    () => ({
      about_user: profile?.about_user ?? personalization.about_user,
      response_style: profile?.response_style ?? personalization.response_style,
      default_niki_mode: profile?.default_niki_mode ?? personalization.default_niki_mode,
    }),
    [
      personalization.about_user,
      personalization.default_niki_mode,
      personalization.response_style,
      profile?.about_user,
      profile?.default_niki_mode,
      profile?.response_style,
    ]
  );

  const applyPreferredModeToFreshChat = useCallback(
    (options?: { resetTeaching?: boolean }) => {
      const preferredMode = effectivePersonalization.default_niki_mode;
      setIsNikiMode(preferredMode);
      if (options?.resetTeaching && !preferredMode) {
        setLectureMode(false);
      }
      setMessages(createGreeting(preferredMode));
    },
    [effectivePersonalization.default_niki_mode]
  );

  const focusModeHeaderClass =
    focusModeExpanded === true
      ? "rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
      : "rounded-full border border-white/8 bg-white/[0.02] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:rounded-2xl sm:px-3 sm:py-3";

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const syncSidebarToViewport = () => setIsSidebarOpen(query.matches);

    syncSidebarToViewport();
    query.addEventListener("change", syncSidebarToViewport);

    return () => query.removeEventListener("change", syncSidebarToViewport);
  }, []);

  useEffect(() => {
    if (!studyProgressNotice) return;
    const timeout = window.setTimeout(() => setStudyProgressNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [studyProgressNotice]);

  useEffect(() => {
    try {
      setPersonalization(readLocalPersonalizationSettings());
      setLocalGeneralSettings(readLocalGeneralSettings());
      const storedTrainingPromptSnooze = window.localStorage.getItem(TRAINING_PROMPT_SNOOZE_KEY);
      if (storedTrainingPromptSnooze) {
        const parsed = Number(storedTrainingPromptSnooze);
        if (Number.isFinite(parsed) && parsed > Date.now()) {
          setTrainingPromptSnoozedUntil(parsed);
        } else {
          window.localStorage.removeItem(TRAINING_PROMPT_SNOOZE_KEY);
        }
      }

      const storedFocus = window.localStorage.getItem(CHAT_FOCUS_STORAGE_KEY);
      if (storedFocus) {
        const parsed = JSON.parse(storedFocus) as ChatFocusState;
        if (
          parsed?.course &&
          KNOWLEDGE_BASE_COURSES.some((course) => course.courseContext === parsed.course)
        ) {
          setChatFocus({
            course: parsed.course,
            topic: parsed.topic ?? "",
          });
        }
      }

      setMobileControlsExpanded(
        window.localStorage.getItem(MOBILE_CHAT_CONTROLS_EXPANDED_KEY) === "true"
      );

    } catch {
      // Ignore local storage boot failures and keep defaults.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MOBILE_CHAT_CONTROLS_EXPANDED_KEY,
        String(mobileControlsExpanded)
      );
    } catch {
      // Ignore storage persistence failures.
    }
  }, [mobileControlsExpanded]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_FOCUS_STORAGE_KEY, JSON.stringify(chatFocus));
    } catch {
      // Ignore storage persistence failures.
    }
  }, [chatFocus]);

  useEffect(() => {
    const userId = session?.user?.id;
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
  }, [currentChatId, session?.user?.id]);


  useEffect(() => {
    const trimmedTopic = chatFocus.topic.trim();
    const focusKey = `${chatFocus.course}::${trimmedTopic}`;

    if (!chatFocus.course) {
      lastFocusAnnouncementRef.current = focusKey;
      return;
    }

    if (!lastFocusAnnouncementRef.current) {
      lastFocusAnnouncementRef.current = focusKey;
      return;
    }

    if (lastFocusAnnouncementRef.current === focusKey) return;

    const timeout = window.setTimeout(() => {
      setStudyProgressNotice(`You're working through ${focusCourseLabel} topics.`);
      lastFocusAnnouncementRef.current = focusKey;
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [chatFocus.course, chatFocus.topic, focusCourseLabel]);

  useEffect(() => {
    try {
      writeLocalPersonalizationSettings(effectivePersonalization);
    } catch {
      // Ignore storage persistence failures.
    }
  }, [effectivePersonalization]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CURRENT_CHAT_MODE_STORAGE_KEY,
        isNikiMode ? "Nemanja Mode" : "Pure Logic"
      );
      window.localStorage.setItem(
        CURRENT_SESSION_SNAPSHOT_STORAGE_KEY,
        JSON.stringify({
          course: chatFocus.course,
          topic: chatFocus.topic.trim(),
          mode: isNikiMode ? "Nemanja Mode" : "Pure Logic",
          practice: practiceModeActive,
        })
      );
    } catch {
      // Ignore storage persistence failures.
    }
  }, [chatFocus.course, chatFocus.topic, isNikiMode, practiceModeActive]);

  useEffect(() => {
    if (profile?.train_on_data) {
      setTrainingPromptHidden(true);
    }
  }, [profile?.train_on_data]);

  useEffect(() => {
    profileLoadedRef.current = profileLoaded;
  }, [profileLoaded]);

  useEffect(() => {
    attachedFileRef.current = attachedFile;
  }, [attachedFile]);

  useEffect(() => {
    try {
      const pendingAction = window.localStorage.getItem(
        PENDING_HOME_ACTION_STORAGE_KEY
      ) as PendingHomeAction | null;
      if (!pendingAction) return;

      if (pendingAction === "new-chat") {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        isStreamingRef.current = false;
        chatLoadSequenceRef.current += 1;
        setIsLoading(false);
        if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
        setAttachedFile(null);
        setCurrentChatId(null);
        currentChatIdRef.current = null;
        applyPreferredModeToFreshChat({ resetTeaching: true });
        setConfirmDeleteId(null);
        setRenamingChatId(null);
      } else if (pendingAction === "open-artifact") {
        openStoredArtifactFromStorage({ promptOnReplace: false });
      }

      window.localStorage.removeItem(PENDING_HOME_ACTION_STORAGE_KEY);
    } catch {
      // Ignore storage access failures.
    }
  }, [applyPreferredModeToFreshChat, attachedFile?.preview, openStoredArtifactFromStorage]);

  const switchNikiMode = (mode: boolean) => {
    setIsNikiMode(mode);
    if (!mode) setLectureMode(false);
    setMessages((prev) =>
      isGreetingOnly(prev) && !currentChatIdRef.current ? createGreeting(mode) : prev
    );
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches
    ) {
      setMobileControlsExpanded(false);
    }
  };

  const mathMarkdownComponents: Components = {
    h2: ({ children, ...props }) => {
      const text = React.Children.toArray(children).join("").trim().toLowerCase();
      const isFinalAnswer = text === "final answer";

      return (
        <h2
          className={
            isFinalAnswer
              ? `mt-7 mb-3 rounded-lg border ${accentBorder} bg-white/[0.04] px-4 py-2 text-[1.05rem] font-black uppercase tracking-widest ${accentColor}`
              : "mt-3 mb-2 text-[1.25rem] font-extrabold text-white tracking-tight"
          }
          {...props}
        >
          {children}
        </h2>
      );
    },
    h3: ({ ...props }) => (
      <h3 className="mt-5 mb-2 text-[1.1rem] font-extrabold text-white" {...props} />
    ),
    hr: ({ ...props }) => <hr className="my-5 border-white/15" {...props} />,
    p: ({ children, ...props }) => {
      const text = getNodeText(children).trim();
      const isStepLabel = /^Step\s+\d+:/i.test(text);
      const calloutKind = getCalloutKind(text);
      const isBoardSetup = /^Board Setup$/i.test(text);
      const isMainTitle =
        !isStepLabel &&
        !calloutKind &&
        !isBoardSetup &&
        /^(Derivative|Integral|Factoring|Solving|Simplifying|Limit|Matrix|System|Probability|Statistics)\b/i.test(
          text
        );

      if (isBoardSetup) {
        return (
          <p
            className={`math-board-setup-label sticky top-20 z-10 my-4 rounded-xl border ${accentBorder} bg-[#101010]/95 px-4 py-3 text-[0.78rem] font-black uppercase tracking-widest ${accentColor} shadow-[0_12px_34px_rgba(0,0,0,0.28)] backdrop-blur`}
            {...props}
          >
            {children}
          </p>
        );
      }

      if (calloutKind) {
        return (
          <p
            className={`math-callout-label ${calloutKind} my-4 rounded-xl border px-4 py-3 leading-7 text-slate-100`}
            {...props}
          >
            {children}
          </p>
        );
      }

      return (
        <p
          className={
            isMainTitle
              ? "math-response-title mb-3 mt-0 leading-7"
              : isStepLabel
                ? "math-step-label mb-2 mt-5 leading-7"
                : "my-2 leading-8 text-slate-100"
          }
          {...props}
        >
          {children}
        </p>
      );
    },
    ul: ({ ...props }) => <ul className="my-2 list-disc pl-6 space-y-2" {...props} />,
    ol: ({ ...props }) => <ol className="my-2 list-decimal pl-6 space-y-2" {...props} />,
    li: ({ ...props }) => <li className="marker:text-slate-300 text-slate-100" {...props} />,
    strong: ({ ...props }) => <strong className="font-extrabold text-white" {...props} />,
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }) => {
      const raw = String(children ?? "");
      const isBlock = /language-/.test(className ?? "") || raw.includes("\n");
      if (isBlock) {
        return <CodeBlock className={className}>{children}</CodeBlock>;
      }

      return (
        <code
          className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-cyan-100"
          {...props}
        >
          {children}
        </code>
      );
    },
  };

  const artifactMarkdownComponents: Components = {
    ...mathMarkdownComponents,
    h1: ({ children, ...props }) => (
      <h1
        className="mb-5 mt-2 border-b border-white/10 pb-3 text-[1.55rem] font-black tracking-tight text-white sm:text-[1.8rem]"
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => {
      const text = React.Children.toArray(children).join("").trim().toLowerCase();
      const isFinalAnswer = text === "final answer";

      if (isFinalAnswer) {
        return (
          <h2
            className={`mt-7 mb-3 rounded-lg border ${accentBorder} bg-white/[0.04] px-4 py-2 text-[1.05rem] font-black uppercase tracking-widest ${accentColor}`}
            {...props}
          >
            {children}
          </h2>
        );
      }

      return (
        <h2
          className={`mb-4 mt-8 border-b ${accentBorder} pb-2 text-[1.1rem] font-black tracking-wide ${accentColor} sm:text-[1.2rem]`}
          {...props}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children, ...props }) => (
      <h3
        className="mb-3 mt-6 text-[1rem] font-extrabold tracking-tight text-slate-100 sm:text-[1.05rem]"
        {...props}
      >
        {children}
      </h3>
    ),
    hr: ({ ...props }) => <hr className="my-7 border-white/10" {...props} />,
  };


  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognitionConstructor());
    return () => {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
    };
  }, []);

  // --- BOOT & SYNC SEQUENCE ---
  useEffect(() => {
    let mounted = true;
    isUnmountingRef.current = false;

    const applySessionFallbackProfile = (activeSession: AppSession) => {
      const fallbackProfile = profileFallbackFromSession(activeSession);
      if (!fallbackProfile) return;
      setProfile((prev) => mergeProfileWithFallback(prev, fallbackProfile) as AppProfile);
      setProfileLoaded(true);
    };

    const loadUserData = async (userId: string, activeSession?: AppSession) => {
      if (!profileLoadedRef.current) setProfileLoaded(false);
      const results = await Promise.allSettled([
        withTimeout(fetchHistory(userId, { restoreSelected: true }), "fetchHistory"),
        withTimeout(fetchProfile(userId, activeSession), "fetchProfile"),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.warn("User data load failed:", result.reason);
        }
      }

      if (mounted) setProfileLoaded(true);
    };

    const clearSignedOutState = (notice: string | null = null) => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      isStreamingRef.current = false;
      chatLoadSequenceRef.current += 1;
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
      setIsListening(false);
      const attached = attachedFileRef.current;
      if (attached?.preview) URL.revokeObjectURL(attached.preview);
      attachedFileRef.current = null;
      setAttachedFile(null);
      setSession(null);
      setProfile(null);
      setProfileLoaded(true);
      setChatHistory([]);
      setChatHistoryLoading(false);
      setChatHistoryNotice(notice);
      setCurrentChatId(null);
      currentChatIdRef.current = null;
      setMessages(createGreeting(false));
      setLoginGatePrompt(null);
      setConfirmDeleteId(null);
      setRenamingChatId(null);
      setInputValue("");
      lastSessionIdRef.current = null;
    };

    const initialize = async () => {
      try {
        if (hasAuthCallbackParams()) {
          const recoveredSession = await withTimeout(recoverSessionFromUrl(), "recoverSessionFromUrl");
          if (recoveredSession?.user?.id) {
            clearAuthCallbackUrl("/");
            setSession(recoveredSession);
            setAuthChecked(true);
            lastSessionIdRef.current = recoveredSession.user.id;
            applySessionFallbackProfile(recoveredSession);
            ensureProfileForSession(recoveredSession).then((bootstrappedProfile) => {
              if (mounted && bootstrappedProfile) {
                setProfile((prev) => mergeProfileWithFallback(prev, bootstrappedProfile) as AppProfile);
              }
            });
            void loadUserData(recoveredSession.user.id, recoveredSession);
            return;
          }
        }

        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), "getSession");

        if (!mounted) return;

        if (!session?.user?.id) {
          clearSignedOutState();
          setAuthChecked(true);
          return;
        }

        setSession(session);
        setAuthChecked(true);
        lastSessionIdRef.current = session.user.id;
        applySessionFallbackProfile(session);
        void loadUserData(session.user.id, session);
      } catch (error) {
        if (mounted) {
          console.warn("Auth initialization failed; preserving stored session for next retry:", error);
          clearSignedOutState("Chat history is unavailable right now.");
          setAuthChecked(true);
        }
      }
    };

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      const newUserId = session?.user?.id ?? null;
      if (!newUserId) {
        clearSignedOutState();
        setAuthChecked(true);
        return;
      }

      if (isStreamingRef.current) return;

      if (newUserId && newUserId === lastSessionIdRef.current) {
        setSession(session);
        applySessionFallbackProfile(session);
        if (!profileLoadedRef.current) {
          void loadUserData(newUserId, session);
        }
        return;
      }

      lastSessionIdRef.current = newUserId;
      setSession(session);
      applySessionFallbackProfile(session);
      void loadUserData(newUserId, session);
    });

    return () => {
      mounted = false;
      isUnmountingRef.current = true;
      abortControllerRef.current?.abort();
      subscription.unsubscribe();
    };
    // Auth bootstrap is intentionally subscribed once; adding helper dependencies would resubscribe on unrelated chat state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleWindowClick = () => setConfirmDeleteId(null);
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  useEffect(() => {
    if (substantiveMessageCount > 0) return;
    if (session && !profileLoaded) return;

    applyPreferredModeToFreshChat({ resetTeaching: true });
  }, [applyPreferredModeToFreshChat, profileLoaded, session, substantiveMessageCount]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

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

  const fetchProfile = async (userId: string, activeSession?: AppSession) => {
    const fallbackProfile = profileFallbackFromSession(activeSession ?? null);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) console.log("Home profile fetch error:", error);
    if (data) {
      setProfile(mergeProfileWithFallback(data, fallbackProfile) as AppProfile);
    } else if (fallbackProfile) {
      setProfile(fallbackProfile);
      ensureProfileForSession(activeSession ?? null).then((bootstrappedProfile) => {
        if (bootstrappedProfile) {
          setProfile((prev) => mergeProfileWithFallback(prev, bootstrappedProfile) as AppProfile);
        }
      });
    }
    setProfileLoaded(true);
  };

  const fetchHistory = async (
    userId: string,
    options?: { restoreSelected?: boolean }
  ): Promise<ChatItem[]> => {
    setChatHistoryLoading(true);
    setChatHistoryNotice(null);

    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", userId)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      console.log("Fetch history error:", error);
      setChatHistoryNotice("Chat history could not load. Try refreshing.");
      setChatHistoryLoading(false);
      return [];
    }

    const nextHistory = (data ?? []) as ChatItem[];
    setChatHistory(nextHistory);
    setChatHistoryLoading(false);

    const activeChatStillExists =
      !!currentChatIdRef.current &&
      nextHistory.some((chat) => chat.id === currentChatIdRef.current);

    if (currentChatIdRef.current && !activeChatStillExists && !isStreamingRef.current) {
      setCurrentChatId(null);
      currentChatIdRef.current = null;
      applyPreferredModeToFreshChat({ resetTeaching: true });
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
  };

  const loadChat = async (
    chatId: string,
    options?: { userId?: string; refreshHistory?: boolean }
  ) => {
    const userId = options?.userId ?? session?.user?.id;
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
        setCurrentChatId(null);
        currentChatIdRef.current = null;
        applyPreferredModeToFreshChat({ resetTeaching: true });
      }
      void fetchHistory(userId);
      return;
    }

    setCurrentChatId(chatId);
    currentChatIdRef.current = chatId;

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
      setChatHistoryNotice("Messages could not load for this conversation.");
      return;
    }

    if (data && data.length > 0) {
      const formatted: Message[] = data
        .filter((msg) => msg.role === "ai" || msg.role === "user")
        .map((msg) => {
          const aiCitations = msg.role === "ai" ? dedupeCitations(msg.citations ?? []) : [];
          return {
            role: msg.role as Message["role"],
            content: msg.text || "",
            citations: msg.role === "ai" ? aiCitations : undefined,
            retrievalConfidence:
              msg.role === "ai" ? confidenceFromCitations(aiCitations) : undefined,
            mode:
              msg.role === "ai" && (msg.mode === "pure" || msg.mode === "nemanja")
                ? msg.mode
                : undefined,
            teachingEnabled:
              msg.role === "ai" && typeof msg.teaching_enabled === "boolean"
                ? msg.teaching_enabled
                : undefined,
            knowledgeBaseCourse:
              msg.role === "ai"
                ? typeof msg.knowledge_base_course === "string"
                  ? msg.knowledge_base_course
                  : aiCitations[0]?.course
                : undefined,
            requestedCourse:
              msg.role === "ai" && typeof msg.requested_course === "string"
                ? msg.requested_course
                : undefined,
            knowledgeBaseMismatch:
              msg.role === "ai" && typeof msg.knowledge_base_mismatch === "boolean"
                ? msg.knowledge_base_mismatch
                : undefined,
          };
        });

      setMessages(formatted);
    } else {
      applyPreferredModeToFreshChat({ resetTeaching: true });
    }

    if (options?.refreshHistory !== false) void fetchHistory(userId);
  };

  const togglePin = async (e: React.MouseEvent, chatId: string, currentStatus: boolean) => {
    e.stopPropagation();
    if (!session?.user?.id) {
      setChatHistoryNotice("Log in to pin saved conversations.");
      return;
    }

    const { error } = await supabase
      .from("chats")
      .update({ is_pinned: !currentStatus, updated_at: new Date().toISOString() })
      .eq("id", chatId)
      .eq("user_id", session.user.id);

    if (error) {
      console.log("Toggle pin error:", error);
      setChatHistoryNotice("This conversation could not be updated.");
      return;
    }

    void fetchHistory(session.user.id);
  };

  const deleteChat = async (chatId: string) => {
    if (!session?.user?.id) return;

    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId)
      .eq("user_id", session.user.id);
    if (error) {
      console.log("Delete chat error:", error);
      setChatHistoryNotice("This conversation could not be deleted.");
      return;
    }

    setChatHistory((prev) => prev.filter((chat) => chat.id !== chatId));

    if (currentChatId === chatId) {
      setCurrentChatId(null);
      currentChatIdRef.current = null;
      applyPreferredModeToFreshChat({ resetTeaching: true });
    }

    setConfirmDeleteId(null);
  };

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
    if (!session?.user?.id) {
      setChatHistoryNotice("Log in to rename saved conversations.");
      setRenamingChatId(null);
      return;
    }

    const { error } = await supabase
      .from("chats")
      .update({ title: trimmed, updated_at: new Date().toISOString() })
      .eq("id", chatId)
      .eq("user_id", session.user.id);

    if (error) {
      console.log("Rename error:", error);
      setChatHistoryNotice("This conversation could not be renamed.");
      setRenamingChatId(null);
      return;
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

  function showLoginGatePrompt(detail: string) {
    setLoginGatePrompt({
      title: "Log in to save your study progress",
      detail,
    });
  }

  async function captureElementCanvas(
    target: HTMLElement,
    cloneSelector?: string,
    options?: {
      scale?: number;
      backgroundColor?: string;
      exportForPdf?: boolean;
    }
  ) {
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
    ] as const;
    const unsafeVisualProps = [
      "background-image",
      "box-shadow",
      "text-shadow",
      "filter",
      "backdrop-filter",
      "-webkit-backdrop-filter",
    ] as const;

    const patches: Array<{
      el: HTMLElement;
      prop: (typeof colorProps)[number] | (typeof unsafeVisualProps)[number];
      prev: string;
    }> = [];

    const screenshotSafeColor = (prop: (typeof colorProps)[number], value: string) => {
      if (!value || value === "transparent") return value;
      if (/^(rgb|rgba|#)/i.test(value)) return value;
      if (prop === "background-color") return "rgba(0, 0, 0, 0)";
      if (prop.includes("border") || prop === "outline-color") return "rgba(255, 255, 255, 0.12)";
      return "rgb(226, 232, 240)";
    };

    const patchStyle = (el: HTMLElement, prop: (typeof patches)[number]["prop"], value: string) => {
      patches.push({
        el,
        prop,
        prev: el.style.getPropertyValue(prop),
      });
      el.style.setProperty(prop, value);
    };

    const makeScreenshotSafe = (root: HTMLElement) => {
      const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const computed = window.getComputedStyle(node);

        for (const prop of colorProps) {
          const next = computed.getPropertyValue(prop);
          if (!next) continue;
          patchStyle(node, prop, screenshotSafeColor(prop, next));
        }

        for (const prop of unsafeVisualProps) {
          const next = computed.getPropertyValue(prop);
          if (!next || next === "none") continue;
          patchStyle(node, prop, "none");
        }
      }
    };

    try {
      makeScreenshotSafe(target);

        return await html2canvas(target, {
          scale: options?.scale ?? (options?.exportForPdf ? 2.5 : 2),
          useCORS: true,
          logging: false,
          backgroundColor: options?.backgroundColor ?? (options?.exportForPdf ? "#ffffff" : "#030303"),
          scrollY: options?.exportForPdf ? -window.scrollY : undefined,
          windowWidth: options?.exportForPdf ? document.body.scrollWidth : undefined,
          windowHeight: options?.exportForPdf ? document.body.scrollHeight : undefined,
          onclone: (doc: Document) => {
            const cloneTarget = cloneSelector
              ? (doc.querySelector(cloneSelector) as HTMLElement | null)
              : null;
            const activeTarget = cloneTarget ?? (doc.body as HTMLElement);
            if (options?.exportForPdf) {
              doc.body.style.background = "#ffffff";
              activeTarget.style.background = "#ffffff";
              activeTarget.style.color = "#0f172a";
              activeTarget.style.overflow = "visible";
              activeTarget.style.maxHeight = "none";
              activeTarget.style.height = "auto";
            }
            for (const node of [activeTarget, ...Array.from(activeTarget.querySelectorAll("*"))]) {
              if (!(node instanceof HTMLElement)) continue;
              node.style.backgroundImage = "none";
              node.style.boxShadow = "none";
              node.style.textShadow = "none";
              node.style.filter = "none";
              node.style.backdropFilter = "none";
              node.style.setProperty("-webkit-backdrop-filter", "none");
              if (options?.exportForPdf) {
                node.style.overflow = "visible";
                node.style.maxHeight = "none";
                node.style.color = "#0f172a";
                if (node.dataset.artifactExport !== undefined) {
                  node.style.background = "#ffffff";
                } else if (window.getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)") {
                  node.style.backgroundColor = "#ffffff";
                }
                if (/^(INPUT|TEXTAREA|BUTTON)$/i.test(node.tagName)) {
                  node.style.borderColor = "#cbd5e1";
                }
              }
            }
          },
        });
    } finally {
      for (const patch of patches) {
        if (patch.prev) {
          patch.el.style.setProperty(patch.prop, patch.prev);
        } else {
          patch.el.style.removeProperty(patch.prop);
        }
      }
    }
  }

  const handleScreenshot = async () => {
    const target =
      chatViewportRef.current ??
      (document.querySelector("[data-chat-capture]") as HTMLDivElement | null);

    if (!target) {
      alert("Screenshot target not found. Please reload and try again.");
      return;
    }

    try {
      const canvas = await captureElementCanvas(target, "[data-chat-capture]");

      const link = document.createElement("a");
      link.download = `nikiai-chat-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Screenshot failed:", err);
      alert("Screenshot failed. I could not capture this view in the browser.");
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
    chatLoadSequenceRef.current += 1;
    setIsLoading(false);
    setChatHistoryNotice(null);

    if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
    setAttachedFile(null);

    setCurrentChatId(null);
    currentChatIdRef.current = null;
    applyPreferredModeToFreshChat({ resetTeaching: true });
    setConfirmDeleteId(null);
    setRenamingChatId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (effectiveCmdEnterToSend) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceInput = () => {
    if (isLoading) return;

    if (isListening) {
      speechRecognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    const startingText = inputValue.trim();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!transcript) return;
      setInputValue(startingText ? `${startingText} ${transcript}` : transcript);
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition failed:", event.error ?? "unknown error");
      setIsListening(false);
    };

    recognition.onend = () => {
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      setIsListening(false);
    };

    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const fetchRag = async (
    question: string,
    options?: { teachingMode?: boolean; nikiMode?: boolean }
  ): Promise<RagResponse | null> => {
    const nikiMode = options?.nikiMode ?? isNikiMode;
    const teachingMode = options?.teachingMode ?? lectureMode;
    if (!question.trim()) return null;
    if (!isExplicitKnowledgeBaseRequest(question) && !teachingMode) return null;
    if (isLectureInventoryRequest(question)) return null;

    try {
      const knowledgeFallback = activeKnowledgeCourse || profile?.current_unit;
      const inferredCourse = inferCourseFromMathTopic(question);
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          lectureMode: true,
          courseFilter: knowledgeFallback || inferredCourse,
          minSimilarity: 0.2,
          maxChunks: 8,
          maxStyleSnippets: nikiMode ? 6 : 3,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn("RAG status:", res.status, text);
        return null;
      }

      const json = (await res.json()) as RagResponse;
      return {
        ...json,
        citations: dedupeCitations(json.citations ?? []),
      };
    } catch (error) {
      console.warn("RAG fetch failed:", error);
      return null;
    }
  };

  const fetchRelatedLectures = async (question: string): Promise<RelatedLecture[]> => {
    if (!question.trim()) return [];

    try {
      const response = await fetch("/api/lectures/related", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          focusCourse: chatFocus.course || undefined,
          activeCourse: activeKnowledgeCourse || profile?.current_unit || undefined,
          maxResults: 4,
        }),
      });

      if (!response.ok) return [];
      const payload = (await response.json()) as { lectures?: RelatedLecture[] };
      return Array.isArray(payload.lectures) ? payload.lectures : [];
    } catch {
      return [];
    }
  };

  const fetchUpcomingCalendarContext = async (userId: string): Promise<string> => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("calendar_events")
        .select("title,event_date,event_time,course")
        .eq("user_id", userId)
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
        .limit(8);

      if (error || !data?.length) {
        if (error && error.code !== "42P01") console.warn("Calendar context fetch failed:", error);
        return "";
      }

      const rows = data as CalendarEventContextRow[];
      return rows
        .map((event) => {
          const courseLabel = event.course ? ` | ${event.course}` : "";
          return `- ${event.event_date} ${event.event_time}${courseLabel} | ${event.title}`;
        })
        .join("\n");
    } catch (error) {
      console.warn("Calendar context unavailable:", error);
      return "";
    }
  };

  type SendChatOptions = {
    userText: string;
    requestHistoryBase?: Message[];
    nikiMode?: boolean;
    teachingMode?: boolean;
    attached?: AttachedFile | null;
    clearComposer?: boolean;
    consumeAttachedFile?: boolean;
  };

  const sendChatMessage = async ({
    userText,
    requestHistoryBase,
    nikiMode = isNikiMode,
    teachingMode = lectureMode,
    attached = null,
    clearComposer = false,
    consumeAttachedFile = false,
  }: SendChatOptions) => {
    const trimmedUserText = userText.trim();
    if (!trimmedUserText && !attached) return;
    if (isLoading) return;

    const currentName = profile?.first_name || profile?.username || "User";
    let chatId = currentChatIdRef.current;
    const displayContent =
      trimmedUserText || (attached ? `[${attached.file.name}]` : "");
    const requestHistory: Message[] = [
      ...(requestHistoryBase ?? messages).map(createHistoryMessage),
      { role: "user", content: displayContent },
    ];

    if (trimmedUserText) {
      trackRecentKnowledgeContext(trimmedUserText);
    }

    setMessages((prev) => [...prev, { role: "user", content: displayContent }]);
    if (clearComposer) setInputValue("");
    setIsLoading(true);
    isStreamingRef.current = true;

    const currentAttached = attached;
    if (consumeAttachedFile) {
      setAttachedFile(null);
      if (currentAttached?.preview) URL.revokeObjectURL(currentAttached.preview);
    }

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
          trimmedUserText.substring(0, 50) ||
          currentAttached?.file.name ||
          "File upload";

        const { data: newChat, error: newChatError } = await supabase
          .from("chats")
          .insert({
            user_id: session.user.id,
            title,
            project_name: activeTab === "projects" ? "Calculus 1" : null,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (newChatError) {
          console.log("Create chat error:", newChatError);
          setChatHistoryNotice("This chat is not saved yet. The answer will still appear here.");
        }

        if (newChat) {
          chatId = newChat.id;
          setCurrentChatId(chatId);
          currentChatIdRef.current = chatId;
          setChatHistory((prev) => {
            const withoutDuplicate = prev.filter((chat) => chat.id !== newChat.id);
            return [newChat as ChatItem, ...withoutDuplicate];
          });
        }
      }

      let storagePath: string | null = null;
      if (currentAttached && chatId && session) {
        storagePath = await uploadFileToSupabase(currentAttached.file, chatId);
      }

      if (chatId && session) {
        const { error: userMessageError } = await supabase.from("messages").insert({
          chat_id: chatId,
          role: "user",
          text: displayContent,
          ...(storagePath ? { attachment_path: storagePath } : {}),
        });

        if (userMessageError) {
          console.log("Save user message error:", userMessageError);
          setChatHistoryNotice("This message could not be saved to history.");
        }

        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId)
          .eq("user_id", session.user.id);
      }

      let base64Image: string | null = null;
      let textFileContent: string | null = null;
      const rag = await fetchRag(trimmedUserText, { teachingMode, nikiMode });
      const relatedLectures =
        teachingMode && (!rag?.citations || rag.citations.length === 0)
          ? await fetchRelatedLectures(trimmedUserText)
          : [];
      const activeLectureSet = activeKnowledgeCourse || profile?.current_unit || undefined;
      const requestedCourse = inferCourseFromMathTopic(trimmedUserText);
      const knowledgeBaseMismatch =
        !!activeLectureSet &&
        !!requestedCourse &&
        normalizeCourseKey(activeLectureSet) !== normalizeCourseKey(requestedCourse);
      const calendarContext = session?.user?.id
        ? await fetchUpcomingCalendarContext(session.user.id)
        : "";

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
          message: trimmedUserText,
          history: requestHistory,
          isNikiMode: nikiMode,
          userName: currentName,
          userId: session?.user?.id,
          chatId,
          trainConsent: profile?.train_on_data,
          usageLogsConsent: profile?.share_usage_data,
          aboutUserContext: effectivePersonalization.about_user || undefined,
          responseStyleContext: effectivePersonalization.response_style || undefined,
          lectureMode: teachingMode,
          ragContext: rag?.context ?? [],
          ragStyleSnippets: rag?.styleSnippets ?? [],
          ragCitations: rag?.citations ?? [],
          knowledgeCourseContext: activeKnowledgeCourse || undefined,
          pinnedSyllabusContent: pinnedSyllabus?.content,
          pinnedSyllabusName: pinnedSyllabus?.name,
          focusCourseContext: chatFocus.course || undefined,
          focusTopicContext: chatFocus.topic.trim() || undefined,
          calendarContext: calendarContext || undefined,
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
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: apiMessage,
            mode: nikiMode ? "nemanja" : "pure",
            teachingEnabled: teachingMode,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "",
          citations: dedupeCitations(rag?.citations ?? []),
          relatedLectures,
          retrievalConfidence: rag?.retrievalConfidence,
          mode: nikiMode ? "nemanja" : "pure",
          teachingEnabled: teachingMode,
          knowledgeBaseCourse: activeLectureSet,
          requestedCourse,
          knowledgeBaseMismatch,
        },
      ]);

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
              const existing = updated[updated.length - 1];
              updated[updated.length - 1] = {
                role: "ai",
                content: aiReply,
                citations: existing?.citations ?? dedupeCitations(rag?.citations ?? []),
                relatedLectures: existing?.relatedLectures ?? relatedLectures,
                retrievalConfidence:
                  existing?.retrievalConfidence ?? rag?.retrievalConfidence,
                mode: existing?.mode ?? (nikiMode ? "nemanja" : "pure"),
                teachingEnabled: existing?.teachingEnabled ?? teachingMode,
                knowledgeBaseCourse: existing?.knowledgeBaseCourse ?? activeLectureSet,
                requestedCourse: existing?.requestedCourse ?? requestedCourse,
                knowledgeBaseMismatch:
                  existing?.knowledgeBaseMismatch ?? knowledgeBaseMismatch,
              };
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
        const lectureCitations = dedupeCitations(rag?.citations ?? []);
        const finalReply = aiReply.trim();

        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1]?.role === "ai") {
            updated[updated.length - 1] = {
              role: "ai",
              content: finalReply,
              citations: lectureCitations,
              relatedLectures,
              retrievalConfidence: rag?.retrievalConfidence,
              mode: nikiMode ? "nemanja" : "pure",
              teachingEnabled: teachingMode,
              knowledgeBaseCourse: activeLectureSet,
              requestedCourse,
              knowledgeBaseMismatch,
            };
          }
          return updated;
        });

        const { error: aiMessageError } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            role: "ai",
            text: finalReply,
            citations: lectureCitations,
          });

        if (aiMessageError) {
          console.log("Save AI message error:", aiMessageError);
          setChatHistoryNotice("The latest answer could not be saved to history.");
        }

        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId)
          .eq("user_id", session.user.id);
      }
    } catch (error: unknown) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        console.error("handleSend error:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: `System Error: ${getErrorMessage(error)}`,
            mode: nikiMode ? "nemanja" : "pure",
            teachingEnabled: teachingMode,
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

  const handleTurnOnTrainingConsent = async () => {
    if (!session?.user?.id || trainingPromptBusy) return;

    setTrainingPromptBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ train_on_data: true })
        .eq("id", session.user.id);

      if (error) {
        console.error("Training consent update failed:", error);
        return;
      }

      setProfile((prev) => (prev ? { ...prev, train_on_data: true } : prev));
      setTrainingPromptHidden(true);
      setTrainingPromptSnoozedUntil(null);
      try {
        window.localStorage.removeItem(TRAINING_PROMPT_SNOOZE_KEY);
      } catch {
        // Ignore storage cleanup failures.
      }
    } finally {
      setTrainingPromptBusy(false);
    }
  };

  const handleSnoozeTrainingPrompt = () => {
    const snoozeUntil = Date.now() + TRAINING_PROMPT_SNOOZE_MS;
    setTrainingPromptHidden(true);
    setTrainingPromptSnoozedUntil(snoozeUntil);
    try {
      window.localStorage.setItem(TRAINING_PROMPT_SNOOZE_KEY, String(snoozeUntil));
    } catch {
      // Ignore storage persistence failures.
    }
  };

  const handleSend = async () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches
    ) {
      setMobileControlsExpanded(false);
    }

    await sendChatMessage({
      userText: inputValue,
      attached: attachedFile,
      clearComposer: true,
      consumeAttachedFile: true,
    });
  };

  const handleOnboardingPrompt = async (prompt: string) => {
    setInputValue(prompt);
    await sendChatMessage({
      userText: prompt,
      clearComposer: true,
    });
  };

  const handleOpenRoadmapTopicInChat = ({
    course,
    topic,
    prompt,
  }: {
    course: string;
    topic: string;
    prompt: string;
  }) => {
    setChatFocus({
      course,
      topic,
    });
    setInputValue(prompt);
    setIsRoadmapOpen(false);
  };

  const toggleFocusMode = () => {
    if (focusModeExpanded === null) {
      setFocusModeExpanded(true);
      return;
    }

    setFocusModeExpanded((prev) => !prev);
  };

  const toggleMobileControls = () => {
    setMobileControlsExpanded((prev) => !prev);
  };

  const getMessageFollowupContext = (messageIndex: number) => {
    const sourceMessage = messages[messageIndex];
    const sourceUserMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
    const sourceMode =
      sourceMessage?.mode === "nemanja"
        ? true
        : sourceMessage?.mode === "pure"
          ? false
          : isNikiMode;
    const sourceTeaching = sourceMessage?.teachingEnabled ?? lectureMode;

    return {
      sourceMessage,
      sourceUserMessage,
      sourceMode,
      sourceTeaching,
    };
  };

  const handleExplainThis = async (messageIndex: number) => {
    const { sourceMessage, sourceUserMessage } = getMessageFollowupContext(messageIndex);

    if (
      sourceMessage?.role !== "ai" ||
      sourceUserMessage?.role !== "user" ||
      !sourceUserMessage.content.trim()
    ) {
      return;
    }

    setIsNikiMode(true);
    setLectureMode(true);

    await sendChatMessage({
      userText: sourceUserMessage.content,
      requestHistoryBase: messages.slice(0, Math.max(0, messageIndex - 1)),
      nikiMode: true,
      teachingMode: true,
    });
  };

  const handleResponseFollowup = async (
    messageIndex: number,
    action: "another" | "explain" | "harder" | "check" | "more"
  ) => {
    const { sourceMessage, sourceUserMessage, sourceMode, sourceTeaching } =
      getMessageFollowupContext(messageIndex);

    if (
      sourceMessage?.role !== "ai" ||
      sourceUserMessage?.role !== "user" ||
      !sourceUserMessage.content.trim()
    ) {
      return;
    }

    if (action === "explain") {
      await handleExplainThis(messageIndex);
      return;
    }

    if (action === "check" || action === "more") {
      await sendChatMessage({
        userText: action === "check" ? "Check my answers" : "Give me more problems",
        requestHistoryBase: messages.slice(0, messageIndex + 1),
        nikiMode: sourceMode,
        teachingMode: sourceTeaching,
      });
      return;
    }

    await sendChatMessage({
      userText: action === "another" ? "Do another one" : "Harder example",
      requestHistoryBase: messages.slice(0, messageIndex + 1),
      nikiMode: sourceMode,
      teachingMode: sourceTeaching,
    });
  };

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-[#030303] font-sans antialiased text-white">
      <ChatSidebar
        isOpen={isSidebarOpen}
        activeTab={activeTab}
        chatHistory={chatHistory}
        currentChatId={currentChatId}
        chatHistoryLoading={chatHistoryLoading}
        chatHistoryNotice={chatHistoryNotice}
        sessionUserId={session?.user?.id}
        confirmDeleteId={confirmDeleteId}
        renamingChatId={renamingChatId}
        renameValue={renameValue}
        accentColor={accentColor}
        accentBorder={accentBorder}
        accentGroupHoverBg={accentGroupHoverBg}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onStartNewSession={startNewSession}
        onSetActiveTab={setActiveTab}
        onLoadChat={(chatId) => void loadChat(chatId)}
        onTogglePin={(event, chatId, currentStatus) => void togglePin(event, chatId, currentStatus)}
        onDeleteChat={(chatId) => void deleteChat(chatId)}
        onStartRename={startRename}
        onCommitRename={(chatId) => void commitRename(chatId)}
        onRenameValueChange={setRenameValue}
        onCancelRename={() => setRenamingChatId(null)}
        onSetConfirmDeleteId={setConfirmDeleteId}
        knowledgeBasePanel={
          <KnowledgeBasePanel
            accentColor={accentColor}
            accentBorder={accentBorder}
            knowledgeBaseCourses={KNOWLEDGE_BASE_COURSES}
            sessionUserId={session?.user?.id}
            activeKnowledgeCourse={activeKnowledgeCourse}
            chatFocusCourse={chatFocus.course}
            activeLectureSetLabel={activeLectureSetLabel}
            activeLectureSetShortLabel={activeLectureSetShortLabel}
            activeLectureIndexedCount={activeLectureIndexedCount}
            sourceHealth={sourceHealth}
            sourceHealthExpanded={sourceHealthExpanded}
            sourceHealthCourseBreakdown={sourceHealthCourseBreakdown}
            knowledgeBaseStatusIndexedCount={knowledgeBaseStatus.indexedLectureCount}
            pinnedSyllabus={pinnedSyllabus}
            isSyllabusPreviewOpen={isSyllabusPreviewOpen}
            attachedKnowledgeButtonLabel={attachedKnowledgeButtonLabel}
            recentKnowledgeContexts={recentKnowledgeContexts}
            savedArtifacts={savedArtifacts}
            publicArtifacts={publicArtifacts}
            knowledgeBaseActivationCourse={knowledgeBaseActivationCourse}
            syllabusUploadInputRef={syllabusUploadInputRef}
            formatPinnedTimestamp={formatPinnedTimestamp}
            onKnowledgeFileInputChange={handleKnowledgeFileInputChange}
            onSetActiveLectureSet={handleSetActiveLectureSet}
            onClearActiveLectureSet={handleClearActiveLectureSet}
            onToggleSourceHealth={() => setSourceHealthExpanded((prev) => !prev)}
            onApplyKnowledgeCourse={applyKnowledgeCourse}
            onRequestSyllabusUpload={() => {
              if (!session?.user?.id) {
                showLoginGatePrompt(
                  "Upload a syllabus after you log in and Niki will be able to keep it attached to your study context."
                );
                return;
              }
              syllabusUploadInputRef.current?.click();
            }}
            onPinAttachedSyllabus={() => void handlePinAttachedSyllabus()}
            onOpenSyllabusPreview={() => setIsSyllabusPreviewOpen(true)}
            onCloseSyllabusPreview={() => setIsSyllabusPreviewOpen(false)}
            onUnpinSyllabus={() => setPinnedSyllabus(null)}
            onOpenSavedArtifact={handleOpenSavedArtifact}
            onDeleteSavedArtifact={handleDeleteSavedArtifact}
            onOpenPublicArtifact={handleOpenPublicArtifact}
            onLogin={() => router.push("/login")}
            onOpenRoadmap={() => setIsRoadmapOpen(true)}
            onRestoreRecentContext={handleRestoreRecentContext}
            onSelectKnowledgeCourse={handleSelectKnowledgeCourse}
          />
        }
      />

      {/* MAIN CONTENT */}
      <section className="chat-surface flex-1 flex min-h-0 flex-col relative min-w-0">
        {/* HEADER */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-4 sm:px-8 bg-[#030303]/82 backdrop-blur-md z-20">
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

          <div className="flex gap-3 sm:gap-6 items-center">
            <div className="hidden md:flex font-mono text-[10px] tracking-tight text-slate-500 uppercase gap-5 items-center">
              <div className="flex items-center gap-2 px-3 py-1 rounded bg-white/5 border border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${accentBg} animate-pulse`} />
                <span>RTX 5070 Ti Active</span>
              </div>
              {isNikiMode && (
                <div className={`flex items-center gap-2 rounded border px-3 py-1 ${lectureMode ? `${accentBorder} bg-white/[0.045] ${accentColor}` : "border-white/5 bg-white/[0.025] text-slate-600"}`}>
                  <span>{lectureMode ? "Teaching: ON" : "Teaching: OFF"}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.push("/calendar")}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.035] ${accentColor} hover:bg-white/[0.07]`}
            >
              Calendar
            </button>

            <div className="sm:border-l border-white/10 sm:pl-6 flex items-center gap-3 sm:gap-5">
              {!authChecked ? (
                <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
              ) : session ? (
                <button
                  onClick={() => router.push("/settings")}
                  className="group flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-white/5 transition-all border border-transparent hover:border-white/10 outline-none"
                >
                  <div
                    className={`relative w-8 h-8 rounded-full ${accentBg} flex items-center justify-center font-black text-[10px] text-white overflow-hidden border border-white/10 shadow-lg`}
                  >
                    {headerAvatarUrl ? (
                      <Image src={headerAvatarUrl} alt="User" fill className="object-cover" unoptimized />
                    ) : (
                      profile?.first_name?.[0] || profile?.username?.[0] || "U"
                    )}
                  </div>
                  <div className="hidden sm:flex flex-col items-start leading-none">
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
          className={`flex-1 min-h-0 overflow-y-auto ${effectiveCompactMode ? "pt-3 pb-36 sm:pb-8 text-[15px]" : "pt-4 sm:pt-10 pb-40 sm:pb-8 text-[17px] sm:text-[18px]"
            } px-3 sm:px-6 scroll-smooth`}
        >
          <div className="mx-auto max-w-5xl space-y-4 sm:space-y-8">
            {sessionStudyLabel && (
              <div className="px-1">
                <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                  {sessionStudyLabel}
                </p>
              </div>
            )}

            {studyProgressNotice && (
              <div className="px-1">
                <p className="text-[11px] font-bold text-slate-500" aria-live="polite">
                  {studyProgressNotice}
                </p>
              </div>
            )}

            <div className="px-1">
              <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                <p className="text-[11px] font-bold text-slate-500">
                  {focusStatusLabel}
                </p>
                {practiceModeActive && (
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${accentBorder} bg-white/[0.035] ${accentColor}`}>
                    Practice Mode
                  </span>
                )}
              </div>
            </div>

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex w-full ${effectiveCompactMode ? "gap-4" : "gap-6"} items-start animate-in fade-in slide-in-from-bottom-2 duration-500 
                ${msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                <div
                  className={`${effectiveCompactMode ? "w-7 h-7 text-xs" : "w-8 h-8 sm:w-9 sm:h-9 text-sm"} flex-shrink-0 rounded-xl flex items-center justify-center font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] 
                  ${msg.role === "ai" ? aiBubbleBg : "bg-white/10 text-white"
                    } ${msg.role === "user" ? "order-2" : "order-1"}`}
                >
                  {msg.role === "ai"
                    ? "N"
                    : profile?.first_name?.[0] || profile?.username?.[0] || "U"}
                </div>

                <div
                  className={`max-w-[calc(100%-3.25rem)] sm:max-w-[880px] text-slate-200 pt-1 select-text selection:bg-white/20 leading-7 sm:leading-8 text-base sm:text-lg overflow-hidden 
                    ${msg.role === "user" ? "text-right order-1" : "text-left order-2"}`}
                >
                  {msg.role === "ai" && ALL_GREETING_TEXTS.has(msg.content) && messages.length > 1 ? (
                    <div className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] font-bold tracking-wide text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-4 sm:py-2 sm:text-xs">
                      {msg.content}
                    </div>
                  ) : msg.role === "ai" ? (
                    (() => {
                      const isStreamingMessage = isLoading && i === messages.length - 1;

                      if (isStreamingMessage) {
                        const liveContent = stripPartialThink(msg.content);
                        const liveMathContent = sanitizeMathContent(liveContent);

                        return (
                          <div className="answer-card relative rounded-2xl border px-5 py-5 sm:px-7 sm:py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.22)]">
                            <div className="prose prose-invert prose-base sm:prose-lg max-w-none prose-p:my-3 prose-li:my-2 prose-ul:my-3 prose-ol:my-3 prose-headings:my-4">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={mathMarkdownComponents}
                            >
                              {liveMathContent}
                            </ReactMarkdown>
                            </div>
                          </div>
                        );
                      }

                      const { steps, clean } = parseThoughtTrace(msg.content);
                      const finalContent = sanitizeMathContent(clean);
                      const finalAnswerBoxClass =
                        "answer-card relative mt-1 rounded-2xl border px-5 py-5 sm:px-7 sm:py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.22)]";

                      return (
                        <>
                          <div className={finalAnswerBoxClass}>
                            <div className="prose prose-invert prose-base sm:prose-lg max-w-none prose-p:my-3 prose-li:my-2 prose-ul:my-3 prose-ol:my-3 prose-headings:my-4">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={mathMarkdownComponents}
                              >
                                {finalContent}
                              </ReactMarkdown>
                            </div>
                          </div>

                          {steps.length > 0 && (
                            <ThoughtTrace
                              steps={steps}
                              accentColor={effectiveThemeAccent}
                            />
                          )}

                          {msg.citations && msg.citations.length > 0 && (
                            <CitationCard
                              citations={msg.citations}
                              confidence={msg.retrievalConfidence}
                              accentColor={effectiveThemeAccent}
                              knowledgeBaseCourse={msg.knowledgeBaseCourse}
                              requestedCourse={msg.requestedCourse}
                              knowledgeBaseMismatch={msg.knowledgeBaseMismatch}
                            />
                          )}

                          {(!msg.citations || msg.citations.length === 0) &&
                            msg.relatedLectures &&
                            msg.relatedLectures.length > 0 && (
                              <RelatedLecturesCard
                                lectures={msg.relatedLectures}
                                accentColor={effectiveThemeAccent}
                                accentBorder={accentBorder}
                              />
                            )}

                          {!isStreamingMessage &&
                            i > 0 &&
                            messages[i - 1]?.role === "user" &&
                            messages[i - 1]?.content.trim() &&
                            !msg.content.startsWith("System Error:") && (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleResponseFollowup(i, "another")}
                                  disabled={isLoading}
                                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all outline-none hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Do another
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleResponseFollowup(i, "explain")}
                                  disabled={isLoading}
                                  className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40`}
                                >
                                  Explain step-by-step
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleResponseFollowup(i, "harder")}
                                  disabled={isLoading}
                                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all outline-none hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Harder problem
                                </button>
                                {practiceModeActive && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void handleResponseFollowup(i, "check")}
                                      disabled={isLoading}
                                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all outline-none hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      Check my answers
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleResponseFollowup(i, "more")}
                                      disabled={isLoading}
                                      className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40`}
                                    >
                                      Give me more problems
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenArtifact(i)}
                                  disabled={isLoading}
                                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all outline-none hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  OPEN ARTIFACT
                                </button>
                              </div>
                            )}
                        </>
                      );
                    })()
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 sm:px-5 sm:py-4 whitespace-pre-wrap shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_10px_35px_rgba(0,0,0,0.18)]">
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {shouldShowOnboarding && (
              <ChatEmptyState
                prompts={ONBOARDING_PROMPTS}
                isLoading={isLoading}
                accentColor={accentColor}
                accentBorder={accentBorder}
                onPromptClick={(prompt) => void handleOnboardingPrompt(prompt)}
              />
            )}

            {isLoading && (
              <div className="flex gap-6 items-start">
                <div
                  className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center bg-zinc-800 ${accentColor} border border-white/10 font-black`}
                >
                  N
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                    Thinking
                  </div>
                  <div className="flex gap-1.5">
                  <div className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce`} />
                  <div className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce delay-100`} />
                  <div className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce delay-200`} />
                  </div>
                </div>
              </div>
            )}

            {!!session?.user?.id &&
              !artifactPanel &&
              visibleRecentArtifactResume?.savedArtifactId &&
              savedArtifacts.length > 0 && (
                <div className="mx-auto max-w-3xl px-1">
                  <div className="rounded-2xl border border-white/6 bg-white/[0.012] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)] sm:px-4 sm:py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-400">
                          Continue your last study artifact
                        </p>
                        <p className="mt-0.5 text-[10px] leading-5 text-slate-500">
                          {visibleRecentArtifactResume.title}
                          {visibleRecentArtifactResume.courseTag ? ` · ${visibleRecentArtifactResume.courseTag}` : ""}
                          {visibleRecentArtifactResume.topicTag ? ` · ${visibleRecentArtifactResume.topicTag}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={dismissRecentArtifactResume}
                          className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-all outline-none hover:border-white/20 hover:text-slate-300"
                        >
                          Not now
                        </button>
                        <button
                          type="button"
                          onClick={handleResumeRecentArtifact}
                          className="rounded-full border border-white/8 bg-white/[0.02] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all outline-none hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                        >
                          Open workspace
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* FOOTER INPUT */}
        <footer className="sticky bottom-0 z-20 shrink-0 border-t border-white/8 bg-[#030303]/98 px-2 pt-0.5 sm:static sm:px-6 sm:pt-4 lg:px-8 pb-[calc(0.6rem+env(safe-area-inset-bottom))] sm:pb-6 backdrop-blur">
          <div className="mx-auto max-w-[880px] space-y-0.5 sm:space-y-1">
              <ChatModeControls
                isNikiMode={isNikiMode}
                lectureMode={lectureMode}
                chatFocus={chatFocus}
                focusSummary={focusSummary}
                focusSuggestion={focusSuggestion}
                focusCourseLabel={focusCourseLabel}
                focusModeExpanded={focusModeExpanded}
                mobileControlsExpanded={mobileControlsExpanded}
                mobileControlsSummary={mobileControlsSummary}
                accentColor={accentColor}
                accentBorder={accentBorder}
                focusModeHeaderClass={focusModeHeaderClass}
                knowledgeBaseCourses={KNOWLEDGE_BASE_COURSES}
                switchNikiMode={switchNikiMode}
                setLectureMode={setLectureMode}
                setChatFocus={setChatFocus}
                setMobileControlsExpanded={setMobileControlsExpanded}
                toggleFocusMode={toggleFocusMode}
                toggleMobileControls={toggleMobileControls}
              />

            <FilePreview
              attached={attachedFile}
              onRemove={handleRemoveFile}
              accentColor={effectiveThemeAccent}
            />

            {shouldShowTrainingPrompt && (
              <div className="rounded-2xl border border-white/10 bg-[#0d0d0d]/92 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white">
                      Help improve NikiAI for everyone?
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Allow anonymized math interactions to improve future responses.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={handleTurnOnTrainingConsent}
                      disabled={trainingPromptBusy}
                      className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.05] ${accentColor} hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {trainingPromptBusy ? "Saving..." : "Turn On"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSnoozeTrainingPrompt}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-white/20 hover:text-slate-300"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {artifactCreationNotice && (
              <div className={`rounded-2xl border ${accentBorder} bg-white/[0.02] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-200">
                      Study artifact created
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {artifactKindLabel(artifactCreationNotice.kind)}
                      {artifactCreationNotice.courseTag
                        ? ` · ${artifactCreationNotice.courseTag}`
                        : ""}
                      {artifactCreationNotice.topicTag
                        ? ` · ${artifactCreationNotice.topicTag}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={reopenCreationNoticeArtifact}
                    className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:bg-white/[0.06]`}
                  >
                    Open workspace
                  </button>
                </div>
              </div>
            )}

            <div className="bg-[#101010]/95 border border-white/10 rounded-[1.25rem] sm:rounded-[2rem] p-2 sm:p-3 shadow-[0_22px_70px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-white/25 transition-all backdrop-blur">
              <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap sm:gap-3">
                <FileUploadButton
                  onFileSelect={handleFileSelect}
                  onScreenshot={handleScreenshot}
                  lectureMode={isNikiMode && lectureMode}
                  onToggleLectureMode={
                    isNikiMode ? () => setLectureMode((prev) => !prev) : undefined
                  }
                  accentColor={effectiveThemeAccent}
                  disabled={isLoading}
                />

                <div className="min-w-0 flex-1 basis-[13rem]">
                  <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="text"
                    placeholder={
                      attachedFile
                        ? `Ask about ${attachedFile.file.name}…`
                        : isNikiMode && lectureMode
                          ? "Teaching: ask with retrieval context..."
                          : isNikiMode
                            ? "Ask in Nemanja Mode..."
                            : "Ask a math, code, or technical question..."
                    }
                    className={`w-full min-w-0 bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none text-slate-100 px-2.5 sm:px-5 ${effectiveCompactMode ? "text-base py-3" : "text-base sm:text-lg py-3 sm:py-4"
                      } placeholder:text-slate-500 shadow-none`}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleVoiceInput}
                  disabled={isLoading || !speechSupported}
                  aria-pressed={isListening}
                  aria-label={isListening ? "Stop voice input" : "Start voice input"}
                  title={
                    speechSupported
                      ? isListening
                        ? "Stop voice input"
                        : "Push to talk"
                      : "Voice input is not supported in this browser"
                  }
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-[0.95rem] border text-slate-300 transition sm:h-11 sm:w-11 sm:rounded-[1rem] ${isListening
                    ? `${accentBorder} bg-cyan-500/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.16)]`
                    : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
                    }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
                  </svg>
                </button>

                <button
                  onClick={handleSend}
                  disabled={isLoading || (!inputValue.trim() && !attachedFile)}
                  className={`shrink-0 bg-white ${accentHoverBg} disabled:bg-zinc-800 disabled:text-zinc-600 hover:text-white text-black px-4 sm:px-8 py-2.5 sm:py-4 rounded-[1rem] sm:rounded-[1.8rem] text-sm font-black transition-all uppercase tracking-tighter outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]`}
                >
                  {isLoading ? "Thinking" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </section>

      {loginGatePrompt && (
        <LoginGatePrompt
          title={loginGatePrompt.title}
          detail={loginGatePrompt.detail}
          accentColor={accentColor}
          accentBorder={accentBorder}
          onClose={() => setLoginGatePrompt(null)}
          onLogin={() => {
            setLoginGatePrompt(null);
            router.push("/login");
          }}
        />
      )}

      {isRoadmapOpen && (
        <>
          <button
            type="button"
            aria-label="Close roadmap"
            onClick={() => setIsRoadmapOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
          />
          <div className="fixed inset-x-3 top-8 z-50 mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#090909]/98 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:inset-x-8">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                  Roadmap
                </p>
                <h2 className="mt-2 truncate text-lg font-extrabold tracking-tight text-white">
                  Nemanja Roadmap
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Browse the course path and open lecture-backed detail without cluttering chat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRoadmapOpen(false)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-4 py-4 sm:px-5">
              <NemanjaRoadmap onOpenTopicInChat={handleOpenRoadmapTopicInChat} />
            </div>
          </div>
        </>
      )}

      <ArtifactWorkspacePanel
        artifactPanel={artifactPanel}
        artifactSaveNotice={artifactSaveNotice}
        artifactHasUnsavedChanges={artifactHasUnsavedChanges}
        artifactPreviewContent={artifactPreviewContent}
        recentArtifacts={recentArtifacts}
        savedArtifactsCount={savedArtifacts.length}
        sessionUserId={session?.user?.id}
        accentColor={accentColor}
        accentBorder={accentBorder}
        artifactMarkdownComponents={artifactMarkdownComponents}
        artifactPreviewRef={artifactPreviewRef}
        artifactKindLabel={artifactKindLabel}
        formatPinnedTimestamp={formatPinnedTimestamp}
        onClose={closeArtifactWorkspace}
        onVisibilityToggle={handleArtifactVisibilityToggle}
        onSave={() => void handleSaveArtifact()}
        onRefresh={handleArtifactRefresh}
        onExportPdf={handleArtifactExportPdf}
        onOpenSavedArtifact={handleOpenSavedArtifact}
        onDeleteSavedArtifact={handleDeleteSavedArtifact}
        onContentChange={handleArtifactContentChange}
      />

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        isNikiMode={isNikiMode}
        onToggleNikiMode={() => switchNikiMode(!isNikiMode)}
        lectureMode={isNikiMode && lectureMode}
        onToggleLectureMode={
          isNikiMode ? () => setLectureMode((prev) => !prev) : undefined
        }
        accentColor={effectiveThemeAccent}
        hasActiveChat={!!currentChatId}
        currentChatTitle={chatHistory.find((c) => c.id === currentChatId)?.title ?? ""}
        onNewSession={startNewSession}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onClearChat={() => {
          if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
          setAttachedFile(null);
          applyPreferredModeToFreshChat({ resetTeaching: true });
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
          if (!currentChatId || !session?.user?.id) return;
          const chat = chatHistory.find((c) => c.id === currentChatId);
          if (!chat) return;
          await supabase
            .from("chats")
            .update({ is_pinned: !chat.is_pinned, updated_at: new Date().toISOString() })
            .eq("id", currentChatId)
            .eq("user_id", session.user.id);
          void fetchHistory(session.user.id);
        }}
      />
    </main>
  );
}
