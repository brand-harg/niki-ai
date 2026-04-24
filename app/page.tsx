"use client";
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import ThoughtTrace from "@/components/ThoughtTrace";
import CommandPalette from "@/components/CommandPalette";
import ChatModeControls from "@/components/ChatModeControls";
import KnowledgeBasePanel from "@/components/KnowledgeBasePanel";

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
  citations?: RagCitation[];
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

type ChatFocusState = {
  course: string;
  topic: string;
};

type FocusTopicSuggestion = {
  topic: string;
  keywords: string[];
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

const FOCUS_TOPIC_SUGGESTIONS: Record<string, FocusTopicSuggestion[]> = {
  "Elementary Algebra": [
    { topic: "1.2 Linear Equations", keywords: ["linear equation", "solve", "isolate", "equation"] },
    { topic: "2.1 Factoring Basics", keywords: ["factor", "factoring", "trinomial"] },
    { topic: "3.1 Systems of Equations", keywords: ["system", "elimination", "substitution"] },
    { topic: "4.1 Radicals and Exponents", keywords: ["radical", "sqrt", "exponent"] },
  ],
  PreCalc1: [
    { topic: "1.3 More on Functions and Graphs", keywords: ["function", "graph", "domain", "range"] },
    { topic: "2.2 Polynomial and Rational Functions", keywords: ["polynomial", "rational", "asymptote"] },
    { topic: "3.1 Exponential Functions", keywords: ["exponential", "growth", "decay"] },
    { topic: "3.2 Logarithmic Functions", keywords: ["log", "ln", "logarithm"] },
  ],
  "Calculus 1": [
    { topic: "2.2 Derivative Rules", keywords: ["derivative", "differentiate", "power rule", "product rule", "quotient rule"] },
    { topic: "1.3 Limits and Continuity", keywords: ["limit", "continuity", "approaches"] },
    { topic: "3.1 Applications of Derivatives", keywords: ["optimization", "related rates", "critical point"] },
    { topic: "3.2 Derivative as a Function", keywords: ["slope", "tangent", "derivative as a function"] },
  ],
  "Calculus 2": [
    { topic: "6.1 Basic Integration", keywords: ["integral", "integrate", "antiderivative"] },
    { topic: "7.1 U-Substitution", keywords: ["u substitution", "u-sub", "substitution"] },
    { topic: "7.3 Integration by Parts", keywords: ["integration by parts", "ibp"] },
    { topic: "9.1 Sequences and Series", keywords: ["sequence", "series", "summation"] },
  ],
  "Calculus 3": [
    { topic: "10.2 Vectors and Geometry", keywords: ["vector", "dot product", "cross product"] },
    { topic: "11.1 Partial Derivatives", keywords: ["partial derivative", "gradient", "multivariable"] },
    { topic: "12.1 Double Integrals", keywords: ["double integral", "iterated integral"] },
    { topic: "12.3 Polar and Parametric Surfaces", keywords: ["polar", "parametric", "surface"] },
  ],
  "Differential Equations": [
    { topic: "1.1 Separable Equations", keywords: ["separable", "differential equation"] },
    { topic: "1.5 Linear First-Order Equations", keywords: ["linear first-order", "integrating factor"] },
    { topic: "2.1 Second-Order Equations", keywords: ["second order", "characteristic equation"] },
    { topic: "3.1 Laplace Transforms", keywords: ["laplace", "transform"] },
  ],
  Statistics: [
    { topic: "1.1 Statistics Basics", keywords: ["mean", "median", "mode", "standard deviation"] },
    { topic: "2.1 Probability Foundations", keywords: ["probability", "conditional probability"] },
    { topic: "3.1 Normal Distributions and Z-Scores", keywords: ["normal distribution", "z-score"] },
    { topic: "4.1 Confidence Intervals and Tests", keywords: ["confidence interval", "hypothesis", "p-value", "z-test"] },
  ],
};

function normalizeSuggestionText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isPracticeRequestText(value: string) {
  const normalized = normalizeSuggestionText(value);
  if (!normalized) return false;

  return (
    /\bpractice\b/.test(normalized) ||
    /\bpractice problems?\b/.test(normalized) ||
    /\bmore problems?\b/.test(normalized) ||
    /\bproblem set\b/.test(normalized) ||
    /\bworksheet\b/.test(normalized) ||
    /\bdrill\b/.test(normalized)
  );
}

function getFocusSuggestion(course: string, draft: string): string | null {
  const normalizedDraft = normalizeSuggestionText(draft);
  if (!normalizedDraft || normalizedDraft.length < 3) return null;

  const suggestions = FOCUS_TOPIC_SUGGESTIONS[course] ?? [];
  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const suggestion of suggestions) {
    let score = 0;
    for (const keyword of suggestion.keywords) {
      const normalizedKeyword = normalizeSuggestionText(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedDraft.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ") ? 3 : 2;
      } else {
        const parts = normalizedKeyword.split(" ").filter(Boolean);
        const partHits = parts.filter((part) => normalizedDraft.includes(part)).length;
        if (partHits >= Math.max(1, parts.length - 1)) score += partHits;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTopic = suggestion.topic;
    }
  }

  return bestScore >= 2 ? bestTopic : null;
}

function isLikelyKnowledgeFileName(name = ""): boolean {
  return /(syllabus|schedule|calendar|canvas|assignment|module|quiz|exam|test|deadline|ics|csv)/i.test(
    name
  );
}

function formatPinnedTimestamp(value?: string | null): string {
  if (!value) return "Just pinned";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just pinned";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function normalizeRecentContextTopic(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildRecentContextTopic(course: string, draft: string, fallbackTopic: string): string {
  const explicitTopic = normalizeRecentContextTopic(fallbackTopic);
  if (explicitTopic) return explicitTopic;

  const suggestedTopic = getFocusSuggestion(course, draft);
  if (suggestedTopic) return suggestedTopic;

  const compactDraft = normalizeRecentContextTopic(draft);
  if (compactDraft.length <= 72) return compactDraft;
  return `${compactDraft.slice(0, 69).trimEnd()}...`;
}

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
const PURE_LOGIC_GREETINGS = [
  "What are we solving today?",
  "Send the math, code, or technical problem.",
  "What do you want to work through?",
  "Give me the problem and I’ll keep it clean.",
  "What needs fixing, proving, solving, or explaining?",
];
const NEMANJA_GREETINGS = [
  "Do you need help with kalk?",
  "All right, what are we working on?",
  "Bring me the problem. We will make it behave.",
  "What do we need to figure out today?",
  "Kalk, algebra, stats, code. What is the situation?",
];
const ALL_GREETING_TEXTS = new Set([...PURE_LOGIC_GREETINGS, ...NEMANJA_GREETINGS]);

function createGreeting(isProfessorMode: boolean): Message[] {
  const pool = isProfessorMode ? NEMANJA_GREETINGS : PURE_LOGIC_GREETINGS;
  const content = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
  return [{ role: "ai", content }];
}

function isGreetingOnly(messages: Message[]) {
  return (
    messages.length === 0 ||
    (messages.length === 1 &&
      messages[0]?.role === "ai" &&
      ALL_GREETING_TEXTS.has(messages[0]?.content ?? ""))
  );
}

function createHistoryMessage(message: Message): Message {
  return {
    role: message.role,
    content: message.content,
    citations: message.citations,
    retrievalConfidence: message.retrievalConfidence,
  };
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function formatTimestamp(seconds?: number) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function getYouTubeVideoId(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }

  return null;
}

function getYouTubeEmbedUrl(url?: string | null, timestampStartSeconds?: number) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  const start =
    typeof timestampStartSeconds === "number" && Number.isFinite(timestampStartSeconds)
      ? Math.max(0, Math.floor(timestampStartSeconds))
      : 0;
  return `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&rel=0`;
}

function dedupeCitations(citations: RagCitation[] = []) {
  const seen = new Set<string>();
  const out: RagCitation[] = [];

  for (const c of citations) {
    const key = [
      c.lectureTitle ?? "",
      c.course ?? "",
      c.professor ?? "",
      c.timestampStartSeconds ?? "",
      c.timestampUrl ?? "",
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }

  return out;
}

function confidenceFromCitations(
  citations: RagCitation[] = []
): RagResponse["retrievalConfidence"] {
  if (!citations.length) return "none";
  const bestSimilarity = Math.max(
    0,
    ...citations
      .map((citation) => citation.similarity)
      .filter((score): score is number => typeof score === "number")
  );

  if (bestSimilarity >= 0.82) return "high";
  if (bestSimilarity >= 0.62) return "medium";
  return "low";
}

function cleanEvidenceText(value?: string) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeCourseKey(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCitationEvidenceMeta(citation: RagCitation) {
  const excerpt = cleanEvidenceText(citation.excerpt);
  const sectionHint = cleanEvidenceText(citation.sectionHint);

  if (excerpt && typeof citation.similarity === "number" && citation.similarity >= 0.82) {
    return {
      label: "Exact",
      detail: "Direct transcript match from lecture",
      body: excerpt,
    };
  }

  if (excerpt) {
    return {
      label: "Related",
      detail: "Relevant excerpt from this lecture",
      body: excerpt,
    };
  }

  if (sectionHint) {
    return {
      label: "Foundational",
      detail: "No direct transcript — based on lecture topic",
      body: sectionHint,
    };
  }

  return {
    label: "Foundational",
    detail: "No direct transcript — based on lecture topic",
    body: "",
  };
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
  if (/^Lecture Connection\b/i.test(text)) return "math-callout-lecture";
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

const CitationCard = ({
  citations,
  confidence,
  accentColor,
  knowledgeBaseCourse,
  requestedCourse,
  knowledgeBaseMismatch,
}: {
  citations: RagCitation[];
  confidence?: RagResponse["retrievalConfidence"];
  accentColor: string;
  knowledgeBaseCourse?: string;
  requestedCourse?: string;
  knowledgeBaseMismatch?: boolean;
}) => {
  const isGreen = accentColor === "green";
  const isAmber = accentColor === "amber";
  const accentText = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const accentBorder = isGreen ? "border-green-500/20" : isAmber ? "border-amber-500/20" : "border-cyan-500/20";
  const accentBg = isGreen ? "bg-green-500/5" : isAmber ? "bg-amber-500/5" : "bg-cyan-500/5";
  const unique = useMemo(() => dedupeCitations(citations).slice(0, 4), [citations]);
  const [activeClip, setActiveClip] = useState<RagCitation | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const shownConfidence = confidence ?? confidenceFromCitations(unique);
  const activeLectureSet = knowledgeBaseCourse?.trim() || "";
  const requestedCourseLabel = requestedCourse?.trim() || "";
  const lowRelevance = !!knowledgeBaseMismatch || shownConfidence === "low";
  const confidenceLabel =
    lowRelevance
      ? "Low relevance"
      : shownConfidence === "high"
      ? "High confidence"
      : shownConfidence === "medium"
        ? "Medium confidence"
          : "No confidence score";

  if (!unique.length) return null;

  const activeEmbedUrl = getYouTubeEmbedUrl(activeClip?.timestampUrl, activeClip?.timestampStartSeconds);

  return (
    <>
    <div className={`mt-4 rounded-2xl border ${accentBorder} ${accentBg} p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_45px_rgba(0,0,0,0.18)]`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[9px] font-black uppercase tracking-widest ${accentText}`}>
            Sources
          </p>
          {activeLectureSet && (
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              Active lecture set: {activeLectureSet}
              {knowledgeBaseMismatch && requestedCourseLabel
                ? ` · Current question looks like ${requestedCourseLabel}`
                : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className={`rounded-md border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest transition ${accentBorder} bg-black/25 ${accentText} hover:bg-white/[0.05]`}
          >
            Peek evidence
          </button>
          {shownConfidence && shownConfidence !== "none" && (
            <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
              {confidenceLabel}
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {unique.map((c, i) => {
          const videoId = getYouTubeVideoId(c.timestampUrl);
          const timestampLabel = formatTimestamp(c.timestampStartSeconds);
          const evidenceMeta = getCitationEvidenceMeta(c);
          const cardContent = (
            <>
              {videoId && (
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                  <Image
                    src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover opacity-80 transition group-hover:scale-105 group-hover:opacity-100"
                  />
                  {timestampLabel && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[8px] font-bold text-white">
                      {timestampLabel}
                    </span>
                  )}
                </div>
              )}
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 text-[9px] font-black ${accentText}`}>{i + 1}</span>
              <div className="min-w-0">
                <p className="line-clamp-2 text-[11px] font-bold leading-snug text-slate-300">
                  {c.lectureTitle ?? "Unknown lecture"}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {c.course ?? "Unknown course"}
                  {timestampLabel ? ` · ${timestampLabel}` : ""}
                  {c.timestampUrl && (
                    <span className={`ml-2 ${accentText}`}>
                      Open clip →
                    </span>
                  )}
                </p>
                <div className="mt-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {evidenceMeta.label}
                  </span>
                </div>
              </div>
            </>
          );

          const className =
            "group flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 transition hover:border-white/20 hover:bg-white/[0.035]";

          return c.timestampUrl ? (
            <a
              key={`${c.lectureTitle ?? "unknown"}-${c.timestampStartSeconds ?? i}-${i}`}
              href={c.timestampUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!getYouTubeEmbedUrl(c.timestampUrl, c.timestampStartSeconds)) return;
                event.preventDefault();
                setActiveClip(c);
              }}
              className={className}
              title={`Preview ${c.lectureTitle ?? "lecture"}${timestampLabel ? ` at ${timestampLabel}` : ""}`}
            >
              {cardContent}
            </a>
          ) : (
            <div
              key={`${c.lectureTitle ?? "unknown"}-${c.timestampStartSeconds ?? i}-${i}`}
              className={className}
            >
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
      {inspectorOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Source inspector"
          onClick={() => setInspectorOpen(false)}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/12 bg-[#101010] shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-100">
                  Source Inspector
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Inspect the evidence behind this answer. Exact transcript evidence is shown when available; foundational matches are labeled plainly.
                </p>
                {activeLectureSet && (
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    Active lecture set: {activeLectureSet}
                    {knowledgeBaseMismatch && requestedCourseLabel
                      ? ` · This question looks like ${requestedCourseLabel}, so the current lecture sources are low relevance.`
                      : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                {unique.map((citation, index) => {
                  const timestampLabel = formatTimestamp(citation.timestampStartSeconds);
                  const evidenceMeta = getCitationEvidenceMeta(citation);
                  return (
                    <div
                      key={`${citation.lectureTitle ?? "source"}-${citation.timestampStartSeconds ?? index}-${index}`}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-100">
                            {citation.lectureTitle ?? "Unknown lecture"}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {citation.course ?? "Unknown course"}
                            {timestampLabel ? ` · ${timestampLabel}` : ""}
                          </p>
                        </div>
                        <div className="flex max-w-[11rem] flex-col items-end gap-1">
                          <span className={`rounded-full border ${accentBorder} bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${accentText}`}>
                            {evidenceMeta.label}
                          </span>
                          <p className="text-right text-[10px] leading-4 text-slate-500">
                            {evidenceMeta.detail}
                          </p>
                          {lowRelevance && (
                            <p className="text-right text-[10px] leading-4 text-amber-300/80">
                              Low relevance to the current question.
                            </p>
                          )}
                        </div>
                      </div>

                      {evidenceMeta.body ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[13px] leading-6 text-slate-200">
                          {evidenceMeta.body}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-[12px] leading-5 text-slate-500">
                          No direct transcript snippet was available for this source.
                        </div>
                      )}

                      {citation.timestampUrl && (
                        <div className="mt-3">
                          <a
                            href={citation.timestampUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-[11px] font-black uppercase tracking-widest ${accentText} hover:text-white`}
                          >
                            Open source clip →
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {activeClip && activeEmbedUrl && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Lecture clip preview"
          onClick={() => setActiveClip(null)}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/12 bg-[#101010] shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-black text-slate-100">
                  {activeClip.lectureTitle ?? "Lecture clip"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {activeClip.course ?? "Unknown course"}
                  {formatTimestamp(activeClip.timestampStartSeconds)
                    ? ` · ${formatTimestamp(activeClip.timestampStartSeconds)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveClip(null)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                className="h-full w-full"
                src={activeEmbedUrl}
                title={activeClip.lectureTitle ?? "Lecture clip"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            {activeClip.timestampUrl && (
              <div className="border-t border-white/10 px-4 py-3">
                <a
                  href={activeClip.timestampUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs font-black uppercase tracking-widest ${accentText} hover:text-white`}
                >
                  Open on YouTube →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeCodeLanguage(language?: string): string {
  const lang = (language ?? "").trim().toLowerCase();
  if (!lang) return "text";

  const aliases: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    shell: "bash",
    sh: "bash",
    zsh: "bash",
    powershell: "ps1",
    python: "py",
    plaintext: "text",
    txt: "text",
  };

  return aliases[lang] ?? lang;
}

function inferCodeLanguage(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "text";
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(trimmed) && /"[^"]+"\s*:/.test(trimmed)) return "json";
  if (/\b(import|export|const|let|interface|type|React|useState|NextResponse)\b/.test(trimmed)) return "ts";
  if (/\b(function|const|let|var|=>|console\.log)\b/.test(trimmed)) return "js";
  if (/\b(def|import|from|print|self|None|True|False)\b/.test(trimmed)) return "py";
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|FROM|WHERE)\b/i.test(trimmed)) return "sql";
  if (/^(npm|pnpm|yarn|git|cd|ls|dir|python|node|npx)\b/m.test(trimmed)) return "bash";
  return "text";
}

function codeLanguageLabel(language: string): string {
  const labels: Record<string, string> = {
    bash: "terminal",
    ps1: "powershell",
    py: "python",
    js: "javascript",
    jsx: "react",
    ts: "typescript",
    tsx: "react tsx",
    text: "text",
  };

  return labels[language] ?? language;
}

function highlightCode(code: string, language: string): string {
  const escaped = escapeHtml(code);
  const lang = language.toLowerCase();

  if (/^(ts|tsx|js|jsx|javascript|typescript)$/.test(lang)) {
    return escaped
      .replace(/(".*?"|'.*?'|`[\s\S]*?`)/g, '<span class="code-token-string">$1</span>')
      .replace(
        /\b(import|from|export|default|const|let|var|function|return|if|else|for|while|async|await|try|catch|class|new|type|interface|extends|implements)\b/g,
        '<span class="code-token-keyword">$1</span>'
      )
      .replace(
        /\b(true|false|null|undefined)\b/g,
        '<span class="code-token-literal">$1</span>'
      )
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>')
      .replace(/\/\/.*/g, '<span class="code-token-comment">$&</span>');
  }

  if (/^(py|python)$/.test(lang)) {
    return escaped
      .replace(/(".*?"|'.*?')/g, '<span class="code-token-string">$1</span>')
      .replace(
        /\b(import|from|def|return|if|elif|else|for|while|try|except|class|with|as|lambda|None|True|False)\b/g,
        '<span class="code-token-keyword">$1</span>'
      )
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>')
      .replace(/#.*/g, '<span class="code-token-comment">$&</span>');
  }

  if (/^(json)$/.test(lang)) {
    return escaped
      .replace(/("[^"]+"\s*:)/g, '<span class="code-token-property">$1</span>')
      .replace(/:\s*("[^"]*")/g, ': <span class="code-token-string">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="code-token-literal">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>');
  }

  if (/^(sql)$/.test(lang)) {
    return escaped
      .replace(/('.*?')/g, '<span class="code-token-string">$1</span>')
      .replace(
        /\b(select|from|where|join|left|right|inner|insert|update|delete|create|table|alter|group|order|by|limit|as|and|or|not|null|primary|key|references|index|on|values|returning)\b/gi,
        '<span class="code-token-keyword">$1</span>'
      )
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>');
  }

  return escaped;
}

const CodeBlock = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
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
};

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
  if (!match) return { steps: [], clean: stripPartialThink(content).trim() };

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
    clean: stripPartialThink(content.replace(/<think>[\s\S]*?<\/think>/, "")).trim(),
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
    captureElementCanvas,
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
    try {
      const pendingAction = window.localStorage.getItem(
        PENDING_HOME_ACTION_STORAGE_KEY
      ) as PendingHomeAction | null;
      if (!pendingAction) return;

      if (pendingAction === "new-chat") {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        isStreamingRef.current = false;
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
        withTimeout(fetchHistory(userId), "fetchHistory"),
        withTimeout(fetchProfile(userId, activeSession), "fetchProfile"),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.warn("User data load failed:", result.reason);
        }
      }

      if (mounted) setProfileLoaded(true);
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
          setSession(null);
          setProfile(null);
          setProfileLoaded(true);
          setChatHistory([]);
          setCurrentChatId(null);
          currentChatIdRef.current = null;
          setMessages(createGreeting(false));
          lastSessionIdRef.current = null;
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
          setSession(null);
          setProfile(null);
          setProfileLoaded(true);
          setChatHistory([]);
          setCurrentChatId(null);
          currentChatIdRef.current = null;
          setMessages(createGreeting(false));
          lastSessionIdRef.current = null;
          setAuthChecked(true);
        }
      }
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
        applySessionFallbackProfile(session);
        if (!profileLoadedRef.current) {
          void loadUserData(newUserId, session);
        }
        return;
      }

      if (newUserId) {
        lastSessionIdRef.current = newUserId;
        setSession(session);
        applySessionFallbackProfile(session);
        void loadUserData(newUserId, session);
      } else {
        lastSessionIdRef.current = null;
        setSession(null);
        setProfile(null);
        setProfileLoaded(true);
        setChatHistory([]);
        setCurrentChatId(null);
        currentChatIdRef.current = null;
        setMessages(createGreeting(false));
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

  function showLoginGatePrompt(detail: string) {
    setLoginGatePrompt({
      title: "Log in to save your study progress",
      detail,
    });
  }

  async function captureElementCanvas(
    target: HTMLElement,
    cloneSelector?: string
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
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#030303",
        onclone: (doc: Document) => {
          const cloneTarget = cloneSelector
            ? (doc.querySelector(cloneSelector) as HTMLElement | null)
            : null;
          const activeTarget = cloneTarget ?? target;
          for (const node of [activeTarget, ...Array.from(activeTarget.querySelectorAll("*"))]) {
            if (!(node instanceof HTMLElement)) continue;
            node.style.backgroundImage = "none";
            node.style.boxShadow = "none";
            node.style.textShadow = "none";
            node.style.filter = "none";
            node.style.backdropFilter = "none";
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
    setIsLoading(false);

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
      const rag = await fetchRag(trimmedUserText, { teachingMode, nikiMode });
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

        await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            role: "ai",
            text: finalReply,
            citations: lectureCitations,
          });

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

  const toggleFocusMode = () => {
    if (focusModeExpanded === null) {
      const isMobileViewport =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 639px)").matches;
      setFocusModeExpanded(isMobileViewport);
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
    <main className="flex h-[100dvh] overflow-hidden bg-[#030303] font-sans antialiased text-white">
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/55 backdrop-blur-[2px] md:hidden"
        />
      )}
      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 h-full bg-[#070707]/98 border-r border-white/10 z-30 flex flex-col shadow-[24px_0_80px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-all duration-300 md:relative md:shadow-none ${isSidebarOpen ? "w-[19.5rem] translate-x-0" : "w-[19.5rem] -translate-x-full md:w-0 md:translate-x-0 overflow-hidden"
          }`}
      >
        <div className="p-4 pt-6">
          <button
            onClick={startNewSession}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all group outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ${accentBorder} bg-white/[0.06] hover:bg-white/[0.1]`}
          >
            <span className="text-sm font-bold text-slate-100">
              Start New Session
            </span>
            <div className={`p-1 rounded-md bg-white/5 ${accentGroupHoverBg} transition-all group-hover:text-white`}>
              <PlusIcon />
            </div>
          </button>
        </div>

        <div className="px-4 mb-6 flex gap-1">
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
            Knowledge Base
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
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
              onRestoreRecentContext={handleRestoreRecentContext}
              onSelectKnowledgeCourse={handleSelectKnowledgeCourse}
            />
          )}
        </div>
      </aside>

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
              <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-5 sm:py-5">
                <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                  Quick Start
                </p>
                <p className="text-sm font-bold text-slate-100">
                  Start by asking a question or selecting a course below.
                </p>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  NikiAI helps you learn with structured notes, lecture-aware answers, and reusable study artifacts.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ONBOARDING_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void handleOnboardingPrompt(prompt)}
                      disabled={isLoading}
                      className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-200 outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:scale-[1.02] hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
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
                  <div className="rounded-2xl border border-white/8 bg-white/[0.016] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:px-4 sm:py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-300">
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
                          className="rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all outline-none hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
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
              <div className={`rounded-2xl border ${accentBorder} bg-white/[0.03] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-100">
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
                    className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.04] ${accentColor} hover:bg-white/[0.08]`}
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
        <>
          <button
            type="button"
            aria-label="Close login prompt"
            onClick={() => setLoginGatePrompt(null)}
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Login required"
            className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-3xl border border-white/10 bg-[#090909]/98 px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:bottom-8"
          >
            <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
              Keep your progress
            </p>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight text-white">
              {loginGatePrompt.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {loginGatePrompt.detail}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLoginGatePrompt(null)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginGatePrompt(null);
                  router.push("/login");
                }}
                className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.04] ${accentColor} hover:bg-white/[0.08]`}
              >
                Log In
              </button>
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
