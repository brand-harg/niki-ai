"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AttachedFile } from "@/components/FilePreview";
import { inferCourseFromMathTopic } from "@/lib/courseFilters";
import type {
  KnowledgeBaseCourse,
  KnowledgeBaseStatus,
  PinnedSyllabus,
  RecentKnowledgeContext,
  SourceHealthState,
} from "@/lib/knowledgeBasePanel";

const KNOWLEDGE_BASE_STORAGE_KEY = "niki_knowledge_base_course";
const PINNED_SYLLABUS_STORAGE_KEY = "niki_pinned_syllabus";
const RECENT_KNOWLEDGE_CONTEXTS_STORAGE_KEY = "niki_recent_knowledge_contexts";

function getPinnedSyllabusStorageKey(userId?: string | null): string | null {
  return userId ? `${PINNED_SYLLABUS_STORAGE_KEY}:${userId}` : null;
}

type ChatFocusLike = {
  course: string;
  topic: string;
};

type UseKnowledgeBasePanelOptions = {
  knowledgeBaseCourses: KnowledgeBaseCourse[];
  chatFocus: ChatFocusLike;
  setChatFocus: Dispatch<SetStateAction<ChatFocusLike>>;
  sessionUserId?: string | null;
  attachedFile: AttachedFile | null;
  buildRecentContextTopic: (course: string, draft: string, fallbackTopic: string) => string;
  isLikelyKnowledgeFileName: (name?: string) => boolean;
  onRequireLogin: (detail: string) => void;
};

function readStoredKnowledgeCourse(
  knowledgeBaseCourses: KnowledgeBaseCourse[]
): string | null {
  if (typeof window === "undefined") return null;

  try {
    const storedCourse = window.localStorage.getItem(KNOWLEDGE_BASE_STORAGE_KEY);
    if (storedCourse === "__cleared__") return null;
    if (
      storedCourse &&
      knowledgeBaseCourses.some((course) => course.courseContext === storedCourse)
    ) {
      return storedCourse;
    }
  } catch {
    // Ignore storage boot failures and keep defaults.
  }

  return null;
}

function readStoredPinnedSyllabus(storageKey?: string | null): PinnedSyllabus | null {
  if (typeof window === "undefined") return null;
  if (!storageKey) return null;

  try {
    const storedPinnedSyllabus = window.localStorage.getItem(storageKey);
    if (!storedPinnedSyllabus) return null;
    const parsed = JSON.parse(storedPinnedSyllabus) as PinnedSyllabus;
    if (parsed?.name && parsed?.content) {
      return parsed;
    }
  } catch {
    // Ignore storage boot failures and keep defaults.
  }

  return null;
}

export function useKnowledgeBasePanel({
  knowledgeBaseCourses,
  chatFocus,
  setChatFocus,
  sessionUserId,
  attachedFile,
  buildRecentContextTopic,
  isLikelyKnowledgeFileName,
  onRequireLogin,
}: UseKnowledgeBasePanelOptions) {
  const [activeKnowledgeCourse, setActiveKnowledgeCourse] = useState<string | null>(() =>
    readStoredKnowledgeCourse(knowledgeBaseCourses)
  );
  const [pinnedSyllabus, setPinnedSyllabus] = useState<PinnedSyllabus | null>(null);
  const [recentKnowledgeContexts, setRecentKnowledgeContexts] = useState<RecentKnowledgeContext[]>([]);
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState<KnowledgeBaseStatus>({
    indexedLectureCount: 0,
    courseCounts: [],
    status: "Missing",
  });
  const [isSyllabusPreviewOpen, setIsSyllabusPreviewOpen] = useState(false);
  const [sourceHealthExpanded, setSourceHealthExpanded] = useState(false);
  const syllabusUploadInputRef = useRef<HTMLInputElement>(null);
  const previousSessionUserIdRef = useRef<string | null>(sessionUserId ?? null);

  const knowledgeBaseCourse = useMemo(
    () =>
      knowledgeBaseCourses.find((course) => course.courseContext === activeKnowledgeCourse) ?? null,
    [activeKnowledgeCourse, knowledgeBaseCourses]
  );

  const activeLectureSetLabel = knowledgeBaseCourse?.label ?? "No active lecture set";
  const activeLectureSetShortLabel = knowledgeBaseCourse?.shortLabel ?? "Cleared";

  const activeLectureIndexedCount = useMemo(() => {
    if (!activeKnowledgeCourse) return 0;

    const normalizedActiveCourse = activeKnowledgeCourse.toLowerCase().replace(/\s+/g, " ").trim();
    const match = knowledgeBaseStatus.courseCounts.find((row) => {
      const normalizedCourse = row.course.toLowerCase().replace(/\s+/g, " ").trim();
      return normalizedCourse === normalizedActiveCourse;
    });

    return match?.count ?? 0;
  }, [activeKnowledgeCourse, knowledgeBaseStatus.courseCounts]);

  const sourceHealth = useMemo<SourceHealthState>(() => {
    const hasPinnedSyllabus = !!pinnedSyllabus;
    const hasLectures = knowledgeBaseStatus.indexedLectureCount > 0;
    const hasActiveCourseCoverage = !activeKnowledgeCourse || activeLectureIndexedCount > 0;
    const status = !hasLectures ? "Missing" : hasActiveCourseCoverage ? "Healthy" : "Warning";

    let detail = hasPinnedSyllabus
      ? "Syllabus pinned and ready to guide course context."
      : "Choose a course to see lecture coverage.";
    if (!hasLectures) {
      detail = "No lecture data is available yet.";
    }

    return {
      label: status,
      detail,
    };
  }, [
    activeKnowledgeCourse,
    activeLectureIndexedCount,
    knowledgeBaseStatus.indexedLectureCount,
    pinnedSyllabus,
  ]);

  const sourceHealthCourseBreakdown = useMemo(() => {
    return [...knowledgeBaseStatus.courseCounts].sort((a, b) => b.count - a.count);
  }, [knowledgeBaseStatus.courseCounts]);

  const attachedKnowledgeButtonLabel = useMemo(() => {
    if (attachedFile?.type !== "text") return null;
    return isLikelyKnowledgeFileName(attachedFile.file.name)
      ? "Pin attached syllabus"
      : "Pin attached study file";
  }, [attachedFile, isLikelyKnowledgeFileName]);

  const knowledgeBaseActivationCourse = useMemo(() => {
    const candidate = activeKnowledgeCourse ?? chatFocus.course;
    if (!candidate) return null;
    return knowledgeBaseCourses.some((course) => course.courseContext === candidate)
      ? candidate
      : null;
  }, [activeKnowledgeCourse, chatFocus.course, knowledgeBaseCourses]);

  const fetchKnowledgeBaseStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/knowledge-base/status", { cache: "no-store" });
      if (!response.ok) {
        console.log("Fetch knowledge base status error:", response.status);
        return;
      }

      const payload = (await response.json()) as Partial<KnowledgeBaseStatus>;
      setKnowledgeBaseStatus({
        indexedLectureCount:
          typeof payload.indexedLectureCount === "number" ? payload.indexedLectureCount : 0,
        courseCounts: Array.isArray(payload.courseCounts) ? payload.courseCounts : [],
        status:
          payload.status === "Healthy" ||
          payload.status === "Warning" ||
          payload.status === "Missing"
            ? payload.status
            : "Missing",
      });
    } catch (error) {
      console.log("Fetch knowledge base status error:", error);
    }
  }, []);

  useEffect(() => {
    const loadKnowledgeBaseStatus = async () => {
      await fetchKnowledgeBaseStatus();
    };

    void loadKnowledgeBaseStatus();
  }, [fetchKnowledgeBaseStatus]);

  useEffect(() => {
    try {
      if (activeKnowledgeCourse) {
        window.localStorage.setItem(KNOWLEDGE_BASE_STORAGE_KEY, activeKnowledgeCourse);
      } else {
        window.localStorage.setItem(KNOWLEDGE_BASE_STORAGE_KEY, "__cleared__");
      }
    } catch {
      // Ignore storage persistence failures.
    }
  }, [activeKnowledgeCourse]);

  useEffect(() => {
    try {
      const storageKey = getPinnedSyllabusStorageKey(sessionUserId);
      if (!storageKey) return;

      if (pinnedSyllabus) {
        window.localStorage.setItem(storageKey, JSON.stringify(pinnedSyllabus));
        window.localStorage.removeItem(PINNED_SYLLABUS_STORAGE_KEY);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage persistence failures.
    }
  }, [pinnedSyllabus, sessionUserId]);

  useEffect(() => {
    const previousUserId = previousSessionUserIdRef.current;
    const previousStorageKey = getPinnedSyllabusStorageKey(previousUserId);
    const nextStorageKey = getPinnedSyllabusStorageKey(sessionUserId);
    let cancelled = false;

    try {
      if (previousStorageKey && previousUserId !== sessionUserId) {
        window.localStorage.removeItem(previousStorageKey);
      }
      window.localStorage.removeItem(PINNED_SYLLABUS_STORAGE_KEY);
    } catch {
      // Ignore storage persistence failures.
    }

    if (!sessionUserId) {
      window.setTimeout(() => {
        if (cancelled) return;
        setPinnedSyllabus(null);
        setIsSyllabusPreviewOpen(false);
      }, 0);
      previousSessionUserIdRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    window.setTimeout(() => {
      if (cancelled) return;
      setPinnedSyllabus(readStoredPinnedSyllabus(nextStorageKey));
    }, 0);
    previousSessionUserIdRef.current = sessionUserId;
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  useEffect(() => {
    try {
      if (sessionUserId) {
        window.localStorage.setItem(
          RECENT_KNOWLEDGE_CONTEXTS_STORAGE_KEY,
          JSON.stringify(recentKnowledgeContexts)
        );
      } else {
        window.localStorage.removeItem(RECENT_KNOWLEDGE_CONTEXTS_STORAGE_KEY);
      }
    } catch {
      // Ignore storage persistence failures.
    }
  }, [recentKnowledgeContexts, sessionUserId]);

  useEffect(() => {
    let cancelled = false;

    const syncRecentContexts = async () => {
      if (!sessionUserId) {
        if (!cancelled) {
          setRecentKnowledgeContexts([]);
        }
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(RECENT_KNOWLEDGE_CONTEXTS_STORAGE_KEY);
        }
        return;
      }

      try {
        const storedRecentContexts = window.localStorage.getItem(
          RECENT_KNOWLEDGE_CONTEXTS_STORAGE_KEY
        );
        if (!storedRecentContexts) {
          if (!cancelled) {
            setRecentKnowledgeContexts([]);
          }
          return;
        }

        const parsed = JSON.parse(storedRecentContexts) as RecentKnowledgeContext[];
        if (Array.isArray(parsed)) {
          const [mostRecent] = parsed.filter(
            (item): item is RecentKnowledgeContext =>
              !!item &&
              typeof item.id === "string" &&
              typeof item.course === "string" &&
              typeof item.topic === "string" &&
              typeof item.updatedAt === "string"
          );
          if (!cancelled) {
            setRecentKnowledgeContexts(mostRecent ? [mostRecent] : []);
          }
        }
      } catch {
        if (!cancelled) {
          setRecentKnowledgeContexts([]);
        }
      }
    };

    void syncRecentContexts();

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  useEffect(() => {
    const normalizedFocusCourse =
      chatFocus.course &&
      knowledgeBaseCourses.some((course) => course.courseContext === chatFocus.course)
        ? chatFocus.course
        : null;

    if (normalizedFocusCourse !== activeKnowledgeCourse) {
      Promise.resolve().then(() => setActiveKnowledgeCourse(normalizedFocusCourse));
    }
  }, [activeKnowledgeCourse, chatFocus.course, knowledgeBaseCourses]);

  const handlePinAttachedSyllabus = useCallback(async () => {
    if (attachedFile?.type !== "text") return;
    if (!sessionUserId) {
      onRequireLogin(
        "Pinning a syllabus keeps your course context available the next time you come back."
      );
      return;
    }

    try {
      const content = (await attachedFile.file.text()).trim();
      if (!content) return;

      setPinnedSyllabus({
        name: attachedFile.file.name,
        content: content.slice(0, 20000),
        pinnedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("Could not pin attached syllabus:", error);
    }
  }, [attachedFile, onRequireLogin, sessionUserId]);

  const handleUploadPinnedSyllabus = useCallback(
    async (file: File) => {
      if (!sessionUserId) {
        onRequireLogin(
          "Upload a syllabus after you log in and Niki will be able to keep it attached to your study context."
        );
        return;
      }

      try {
        const content = (await file.text()).trim();
        if (!content) return;

        setPinnedSyllabus({
          name: file.name,
          content: content.slice(0, 20000),
          pinnedAt: new Date().toISOString(),
        });
        setIsSyllabusPreviewOpen(true);
      } catch (error) {
        console.warn("Could not upload pinned syllabus:", error);
      }
    },
    [onRequireLogin, sessionUserId]
  );

  const handleKnowledgeFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await handleUploadPinnedSyllabus(file);
      event.target.value = "";
    },
    [handleUploadPinnedSyllabus]
  );

  const handleSetActiveLectureSet = useCallback(() => {
    if (!knowledgeBaseActivationCourse) return;
    setActiveKnowledgeCourse(knowledgeBaseActivationCourse);
    setChatFocus((prev) => ({
      ...prev,
      course: knowledgeBaseActivationCourse,
    }));
  }, [knowledgeBaseActivationCourse, setChatFocus]);

  const handleClearActiveLectureSet = useCallback(() => {
    setActiveKnowledgeCourse(null);
    setChatFocus((prev) => ({
      ...prev,
      course: "",
    }));
  }, [setChatFocus]);

  const handleSelectKnowledgeCourse = useCallback(
    (courseContext: string) => {
      const nextCourse = chatFocus.course === courseContext ? "" : courseContext;
      setActiveKnowledgeCourse(nextCourse || null);
      setChatFocus((prev) => ({
        ...prev,
        course: nextCourse,
        topic: "",
      }));
    },
    [chatFocus.course, setChatFocus]
  );

  const applyKnowledgeCourse = useCallback(
    (courseContext: string) => {
      setActiveKnowledgeCourse(courseContext);
      setChatFocus((prev) => ({
        ...prev,
        course: courseContext,
        topic: "",
      }));
    },
    [setChatFocus]
  );

  const handleRestoreRecentContext = useCallback(
    (context: RecentKnowledgeContext) => {
      setActiveKnowledgeCourse(context.course);
      setChatFocus({
        course: context.course,
        topic: context.topic,
      });
    },
    [setChatFocus]
  );

  const trackRecentKnowledgeContext = useCallback(
    (draft: string) => {
      const normalizedDraft = draft.trim();
      if (!normalizedDraft) return;

      const course =
        inferCourseFromMathTopic(normalizedDraft) ??
        chatFocus.course ??
        activeKnowledgeCourse ??
        "Calculus 1";
      const topic = buildRecentContextTopic(course, normalizedDraft, chatFocus.topic);
      if (!topic) return;

      const updatedAt = new Date().toISOString();
      const nextContext: RecentKnowledgeContext = {
        id: `${course}::${topic.toLowerCase()}`,
        course,
        topic,
        updatedAt,
      };

      setRecentKnowledgeContexts([nextContext]);
    },
    [activeKnowledgeCourse, buildRecentContextTopic, chatFocus.course, chatFocus.topic]
  );

  return {
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
  };
}
