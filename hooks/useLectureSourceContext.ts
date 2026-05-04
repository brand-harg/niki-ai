"use client";

import { useCallback, useState } from "react";
import { inferCourseFromMathTopic } from "@/lib/courseFilters";
import { dedupeCitations, normalizeCourseKey } from "@/lib/chatDisplay";

export type RagCitation = {
  lectureTitle?: string;
  professor?: string;
  timestampStartSeconds?: number;
  timestampUrl?: string | null;
  course?: string;
  similarity?: number;
  excerpt?: string;
  sectionHint?: string;
};

export type RagResponse = {
  context?: string[];
  styleSnippets?: { text: string; personaTag?: string }[];
  citations?: RagCitation[];
  retrievalConfidence?: "high" | "medium" | "low" | "none";
  error?: string;
};

export type RelatedLecture = {
  id: string;
  lecture_title: string;
  course: string;
  professor: string;
  video_url: string;
};

type ChatFocusLike = {
  course: string;
  topic: string;
};

type UseLectureSourceContextOptions = {
  activeKnowledgeCourse: string | null;
  chatFocus: ChatFocusLike;
  profileCurrentUnit?: string;
  isNikiMode: boolean;
};

type LectureSourceBundle = {
  rag: RagResponse | null;
  relatedLectures: RelatedLecture[];
  activeLectureSet?: string;
  requestedCourse?: string;
  knowledgeBaseMismatch: boolean;
};

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

function isUnsupportedLectureKnowledgeRequest(message: string) {
  const asksForLectureContext =
    /\b(lectures?|lecture notes?|lecture context|lecture sources?|professor|nemanja|class notes?|sources?)\b/i.test(
      message
    );
  if (!asksForLectureContext) return false;

  return /\b(organic chemistry|reaction mechanisms?|chemistry|ancient roman|roman history|ancient history|world history|history|medieval poetry|poetry|literature|quantum mechanics|quantum|biology|physics)\b/i.test(
    message
  );
}

export function useLectureSourceContext({
  activeKnowledgeCourse,
  chatFocus,
  profileCurrentUnit,
  isNikiMode,
}: UseLectureSourceContextOptions) {
  const [lectureMode, setLectureMode] = useState(false);

  const fetchRag = useCallback(
    async (
      question: string,
      options?: { teachingMode?: boolean; nikiMode?: boolean }
    ): Promise<RagResponse | null> => {
      const nikiMode = options?.nikiMode ?? isNikiMode;
      const teachingMode = options?.teachingMode ?? lectureMode;
      if (!question.trim()) return null;
      if (isUnsupportedLectureKnowledgeRequest(question)) return null;
      if (!isExplicitKnowledgeBaseRequest(question) && !teachingMode) return null;
      if (isLectureInventoryRequest(question)) return null;

      try {
        const knowledgeFallback = activeKnowledgeCourse || profileCurrentUnit;
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
    },
    [activeKnowledgeCourse, isNikiMode, lectureMode, profileCurrentUnit]
  );

  const fetchRelatedLectures = useCallback(
    async (question: string): Promise<RelatedLecture[]> => {
      if (!question.trim()) return [];

      try {
        const response = await fetch("/api/lectures/related", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            focusCourse: chatFocus.course || undefined,
            activeCourse: activeKnowledgeCourse || profileCurrentUnit || undefined,
            maxResults: 4,
          }),
        });

        if (!response.ok) return [];
        const payload = (await response.json()) as { lectures?: RelatedLecture[] };
        return Array.isArray(payload.lectures) ? payload.lectures : [];
      } catch {
        return [];
      }
    },
    [activeKnowledgeCourse, chatFocus.course, profileCurrentUnit]
  );

  const getLectureSourceBundle = useCallback(
    async (
      question: string,
      options?: { teachingMode?: boolean; nikiMode?: boolean }
    ): Promise<LectureSourceBundle> => {
      const teachingMode = options?.teachingMode ?? lectureMode;
      const nikiMode = options?.nikiMode ?? isNikiMode;
      const unsupportedLectureRequest = isUnsupportedLectureKnowledgeRequest(question);
      const rag = await fetchRag(question, { teachingMode, nikiMode });
      const relatedLectures =
        teachingMode && !unsupportedLectureRequest && (!rag?.citations || rag.citations.length === 0)
          ? await fetchRelatedLectures(question)
          : [];
      const activeLectureSet = activeKnowledgeCourse || profileCurrentUnit || undefined;
      const requestedCourse = inferCourseFromMathTopic(question);
      const knowledgeBaseMismatch =
        !!activeLectureSet &&
        !!requestedCourse &&
        normalizeCourseKey(activeLectureSet) !== normalizeCourseKey(requestedCourse);

      return {
        rag,
        relatedLectures,
        activeLectureSet,
        requestedCourse,
        knowledgeBaseMismatch,
      };
    },
    [
      activeKnowledgeCourse,
      fetchRag,
      fetchRelatedLectures,
      isNikiMode,
      lectureMode,
      profileCurrentUnit,
    ]
  );

  return {
    lectureMode,
    setLectureMode,
    getLectureSourceBundle,
  };
}
