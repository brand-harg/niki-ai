"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { inferCourseFromMathTopic } from "@/lib/courseFilters";
import { sanitizeMathContent } from "@/lib/mathFormatting";
import {
  type ArtifactPanelState,
  type ArtifactSourceConfidence,
  type SavedArtifact,
  LAST_ARTIFACT_PANEL_STORAGE_KEY,
  artifactKindLabel,
  buildArtifactTitle,
  buildSinglePagePdfFromJpeg,
  inferArtifactKind,
  parseStoredArtifactPanel,
  sanitizeDownloadFilename,
  serializeArtifactWorkspace,
} from "@/lib/artifactWorkspace";

function getArtifactResumeStorageKey(userId?: string | null): string | null {
  return userId ? `${LAST_ARTIFACT_PANEL_STORAGE_KEY}:${userId}` : null;
}

type ArtifactMessage = {
  role: "ai" | "user";
  content: string;
  citations?: Array<{ course?: string | null }>;
  retrievalConfidence?: ArtifactSourceConfidence;
  knowledgeBaseCourse?: string;
  requestedCourse?: string;
};

type ChatFocusLike = {
  course: string;
  topic: string;
};

type UseArtifactWorkspaceOptions = {
  sessionUserId?: string | null;
  profileIsSearchable?: boolean;
  messages: ArtifactMessage[];
  chatFocus: ChatFocusLike;
  activeKnowledgeCourse: string | null;
  parseMessageContent: (content: string) => { clean: string };
  captureElementCanvas: (target: HTMLElement, cloneSelector?: string) => Promise<HTMLCanvasElement>;
  onRequireLogin: (detail: string) => void;
  onStudyProgress: (notice: string) => void;
  onOpenLibraryArtifact?: () => void;
};

type OpenArtifactWorkspaceOptions = {
  promptOnReplace?: boolean;
};

export function useArtifactWorkspace({
  sessionUserId,
  profileIsSearchable,
  messages,
  chatFocus,
  activeKnowledgeCourse,
  parseMessageContent,
  captureElementCanvas,
  onRequireLogin,
  onStudyProgress,
  onOpenLibraryArtifact,
}: UseArtifactWorkspaceOptions) {
  const [artifactPanel, setArtifactPanel] = useState<ArtifactPanelState | null>(null);
  const [recentArtifactResumeState, setRecentArtifactResumeState] =
    useState<ArtifactPanelState | null>(null);
  const [artifactBaselineSnapshot, setArtifactBaselineSnapshot] = useState<string | null>(null);
  const [artifactCreationNotice, setArtifactCreationNotice] = useState<ArtifactPanelState | null>(null);
  const [savedArtifacts, setSavedArtifacts] = useState<SavedArtifact[]>([]);
  const [publicArtifacts, setPublicArtifacts] = useState<SavedArtifact[]>([]);
  const [artifactSaveNotice, setArtifactSaveNotice] = useState<string | null>(null);
  const [dismissedRecentArtifactId, setDismissedRecentArtifactId] = useState<string | null>(null);
  const artifactPreviewRef = useRef<HTMLDivElement>(null);
  const previousSessionUserIdRef = useRef<string | null>(sessionUserId ?? null);
  const activeSavedArtifactId = artifactPanel?.savedArtifactId ?? null;

  const artifactPreviewContent = useMemo(() => {
    return artifactPanel ? sanitizeMathContent(artifactPanel.content) : "";
  }, [artifactPanel]);

  const artifactHasUnsavedChanges = useMemo(() => {
    if (!artifactPanel) return false;
    return serializeArtifactWorkspace(artifactPanel) !== artifactBaselineSnapshot;
  }, [artifactBaselineSnapshot, artifactPanel]);

  const recentArtifacts = useMemo(() => {
    if (!activeSavedArtifactId) {
      return savedArtifacts.slice(0, 4);
    }
    return savedArtifacts
      .filter((artifact) => artifact.id !== activeSavedArtifactId)
      .slice(0, 4);
  }, [activeSavedArtifactId, savedArtifacts]);

  const recentArtifactResume = useMemo(() => {
    if (!sessionUserId) return null;
    if (!recentArtifactResumeState?.savedArtifactId) return null;

    return savedArtifacts.some((artifact) => artifact.id === recentArtifactResumeState.savedArtifactId)
      ? recentArtifactResumeState
      : null;
  }, [recentArtifactResumeState, savedArtifacts, sessionUserId]);

  const visibleRecentArtifactResume = useMemo(() => {
    if (!recentArtifactResume?.savedArtifactId) return null;
    if (recentArtifactResume.savedArtifactId === dismissedRecentArtifactId) return null;
    return recentArtifactResume;
  }, [dismissedRecentArtifactId, recentArtifactResume]);

  const confirmArtifactLeave = useCallback(() => {
    if (!artifactHasUnsavedChanges) return true;
    return window.confirm("You have unsaved changes");
  }, [artifactHasUnsavedChanges]);

  const openArtifactWorkspace = useCallback(
    (
      nextArtifactPanel: ArtifactPanelState,
      options?: OpenArtifactWorkspaceOptions
    ) => {
      if (options?.promptOnReplace !== false && artifactPanel && !confirmArtifactLeave()) {
        return false;
      }

      setArtifactPanel(nextArtifactPanel);
      setArtifactBaselineSnapshot(serializeArtifactWorkspace(nextArtifactPanel));
      setRecentArtifactResumeState(nextArtifactPanel);
      return true;
    },
    [artifactPanel, confirmArtifactLeave]
  );

  const closeArtifactWorkspace = useCallback(() => {
    if (!artifactPanel) return true;
    if (!confirmArtifactLeave()) return false;
    setArtifactPanel(null);
    setArtifactBaselineSnapshot(null);
    return true;
  }, [artifactPanel, confirmArtifactLeave]);

  const fetchStudyArtifacts = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("study_artifacts")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Fetch study artifacts error:", error);
      return;
    }

    if (data) {
      setSavedArtifacts(data as SavedArtifact[]);
    }
  }, []);

  const fetchPublicArtifacts = useCallback(async () => {
    try {
      const response = await fetch("/api/artifacts/public", { cache: "no-store" });
      if (!response.ok) {
        console.log("Fetch public artifacts error:", response.status);
        return;
      }

      const payload = (await response.json()) as { artifacts?: SavedArtifact[] };
      setPublicArtifacts(Array.isArray(payload.artifacts) ? payload.artifacts : []);
    } catch (error) {
      console.log("Fetch public artifacts error:", error);
    }
  }, []);

  const clearStoredArtifactResume = useCallback((userId?: string | null) => {
    try {
      const scopedStorageKey = getArtifactResumeStorageKey(userId);
      if (scopedStorageKey) {
        window.localStorage.removeItem(scopedStorageKey);
      }
      window.localStorage.removeItem(LAST_ARTIFACT_PANEL_STORAGE_KEY);
    } catch {
      // Ignore storage persistence failures.
    }
  }, []);

  const openStoredArtifactFromStorage = useCallback(
    (options?: OpenArtifactWorkspaceOptions) => {
      try {
        const scopedStorageKey = getArtifactResumeStorageKey(sessionUserId);
        const storedArtifact = parseStoredArtifactPanel(
          (scopedStorageKey && window.localStorage.getItem(scopedStorageKey)) ||
            window.localStorage.getItem(LAST_ARTIFACT_PANEL_STORAGE_KEY)
        );
        if (!storedArtifact) return false;
        const opened = openArtifactWorkspace(storedArtifact, options);
        if (opened) {
          window.localStorage.removeItem(LAST_ARTIFACT_PANEL_STORAGE_KEY);
        }
        return opened;
      } catch {
        return false;
      }
    },
    [openArtifactWorkspace, sessionUserId]
  );

  const handleOpenArtifact = useCallback(
    (messageIndex: number) => {
      const sourceMessage = messages[messageIndex];
      const sourceUserMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;

      if (sourceMessage?.role !== "ai" || !sourceMessage.content.trim()) return;

      const sourcePrompt = sourceUserMessage?.role === "user" ? sourceUserMessage.content.trim() : "";
      const { clean } = parseMessageContent(sourceMessage.content);
      const nextKind = inferArtifactKind(sourcePrompt, clean);
      const derivedCourseTag =
        inferCourseFromMathTopic(sourcePrompt) ??
        (chatFocus.course || activeKnowledgeCourse || null);
      const derivedTopicTag = chatFocus.topic.trim() || null;
      const citations = sourceMessage.citations ?? [];
      const sourceAttached = citations.length > 0;
      const sourceCourse =
        sourceMessage.knowledgeBaseCourse ??
        sourceMessage.requestedCourse ??
        citations[0]?.course ??
        null;

      setArtifactSaveNotice(null);
      const nextArtifactPanel: ArtifactPanelState = {
        messageIndex,
        kind: nextKind,
        title: buildArtifactTitle(nextKind, sourcePrompt),
        sourcePrompt,
        content: clean,
        savedArtifactId: null,
        courseTag: derivedCourseTag,
        topicTag: derivedTopicTag,
        isPublic: sessionUserId ? profileIsSearchable === true : null,
        sourceCourse,
        sourceConfidence: sourceAttached ? sourceMessage.retrievalConfidence ?? "none" : null,
        sourceAttached,
      };

      openArtifactWorkspace(nextArtifactPanel);
      setArtifactCreationNotice(nextArtifactPanel);
      onStudyProgress("You're building reusable study material.");
    },
    [
      activeKnowledgeCourse,
      chatFocus.course,
      chatFocus.topic,
      messages,
      onStudyProgress,
      openArtifactWorkspace,
      parseMessageContent,
      profileIsSearchable,
      sessionUserId,
    ]
  );

  const handleArtifactContentChange = useCallback((content: string) => {
    setArtifactSaveNotice(null);
    setArtifactPanel((prev) => (prev ? { ...prev, content } : prev));
  }, []);

  const handleArtifactVisibilityToggle = useCallback(() => {
    if (!sessionUserId) return;
    setArtifactSaveNotice(null);
    setArtifactPanel((prev) =>
      prev ? { ...prev, isPublic: !(prev.isPublic ?? (profileIsSearchable === true)) } : prev
    );
  }, [profileIsSearchable, sessionUserId]);

  const handleArtifactRefresh = useCallback(() => {
    if (!artifactPanel) return;
    if (artifactPanel.messageIndex === null) return;
    const sourceMessage = messages[artifactPanel.messageIndex];
    if (sourceMessage?.role !== "ai") return;
    const { clean } = parseMessageContent(sourceMessage.content);
    setArtifactPanel((prev) => (prev ? { ...prev, content: clean } : prev));
  }, [artifactPanel, messages, parseMessageContent]);

  const handleOpenSavedArtifact = useCallback(
    (artifact: SavedArtifact) => {
      setArtifactSaveNotice(null);
      const opened = openArtifactWorkspace({
        messageIndex: null,
        kind: artifact.kind ?? inferArtifactKind(artifact.source_prompt ?? "", artifact.content),
        title: artifact.title,
        sourcePrompt: artifact.source_prompt ?? "",
        content: artifact.content,
        savedArtifactId: artifact.id,
        courseTag: artifact.course_tag ?? null,
        topicTag: artifact.topic_tag ?? null,
        isPublic: artifact.is_public ?? null,
        sourceCourse: null,
        sourceConfidence: null,
        sourceAttached: false,
      });
      if (opened) onOpenLibraryArtifact?.();
    },
    [onOpenLibraryArtifact, openArtifactWorkspace]
  );

  const handleOpenPublicArtifact = useCallback(
    (artifact: SavedArtifact) => {
      setArtifactSaveNotice("Public artifact opened as a reference copy.");
      const opened = openArtifactWorkspace({
        messageIndex: null,
        kind: artifact.kind ?? inferArtifactKind(artifact.source_prompt ?? "", artifact.content),
        title: artifact.title,
        sourcePrompt: artifact.source_prompt ?? "",
        content: artifact.content,
        savedArtifactId: null,
        courseTag: artifact.course_tag ?? null,
        topicTag: artifact.topic_tag ?? null,
        isPublic: artifact.is_public ?? true,
        sourceCourse: null,
        sourceConfidence: null,
        sourceAttached: false,
      });
      if (opened) onOpenLibraryArtifact?.();
    },
    [onOpenLibraryArtifact, openArtifactWorkspace]
  );

  const handleResumeRecentArtifact = useCallback(() => {
    if (!recentArtifactResume) return;
    openArtifactWorkspace(recentArtifactResume);
  }, [openArtifactWorkspace, recentArtifactResume]);

  const dismissRecentArtifactResume = useCallback(() => {
    setDismissedRecentArtifactId(recentArtifactResume?.savedArtifactId ?? null);
  }, [recentArtifactResume]);

  const handleSaveArtifact = useCallback(async () => {
    if (!artifactPanel) return;

    if (!sessionUserId) {
      onRequireLogin(
        "You can keep editing and exporting this artifact right now. Log in when you're ready to save it to your Study Library."
      );
      return;
    }

    const resolvedCourseTag =
      artifactPanel.courseTag ??
      inferCourseFromMathTopic(artifactPanel.sourcePrompt) ??
      chatFocus.course ??
      activeKnowledgeCourse ??
      null;
    const resolvedTopicTag = artifactPanel.topicTag ?? (chatFocus.topic.trim() || null);
    const payload = {
      user_id: sessionUserId,
      title: artifactPanel.title.trim() || buildArtifactTitle(artifactPanel.kind, artifactPanel.sourcePrompt),
      content: artifactPanel.content,
      source_prompt: artifactPanel.sourcePrompt || null,
      kind: artifactPanel.kind,
      course_tag: resolvedCourseTag,
      topic_tag: resolvedTopicTag,
      is_public: artifactPanel.isPublic ?? (profileIsSearchable === true),
      updated_at: new Date().toISOString(),
    };

    if (artifactPanel.savedArtifactId) {
      const { data, error } = await supabase
        .from("study_artifacts")
        .update(payload)
        .eq("id", artifactPanel.savedArtifactId)
        .select("*")
        .single();

      if (error) {
        console.log("Update artifact error:", error);
        setArtifactSaveNotice("I couldn't update that artifact right now.");
        return;
      }

      if (data) {
        setSavedArtifacts((prev) => {
          const next = prev.filter((artifact) => artifact.id !== data.id);
          return [data as SavedArtifact, ...next];
        });
        setArtifactPanel((prev) => {
          if (!prev) return prev;
          const nextPanel = {
            ...prev,
            savedArtifactId: data.id,
            title: data.title,
            courseTag: data.course_tag ?? resolvedCourseTag,
            topicTag: data.topic_tag ?? resolvedTopicTag,
            isPublic: data.is_public ?? prev.isPublic ?? null,
          };
          setArtifactBaselineSnapshot(serializeArtifactWorkspace(nextPanel));
          return nextPanel;
        });
      }

      void fetchPublicArtifacts();

      setArtifactSaveNotice("Saved to your Study Library");
      onStudyProgress(
        resolvedCourseTag
          ? `You're working through ${resolvedCourseTag} topics.`
          : "You're building on this study session."
      );
      return;
    }

    const { data, error } = await supabase
      .from("study_artifacts")
      .insert({
        ...payload,
      })
      .select("*")
      .single();

    if (error) {
      console.log("Save artifact error:", error);
      setArtifactSaveNotice("I couldn't save that artifact right now.");
      return;
    }

    if (data) {
      setSavedArtifacts((prev) => [data as SavedArtifact, ...prev]);
      setArtifactPanel((prev) => {
        if (!prev) return prev;
        const nextPanel = {
          ...prev,
          savedArtifactId: data.id,
          title: data.title,
          courseTag: data.course_tag ?? resolvedCourseTag,
          topicTag: data.topic_tag ?? resolvedTopicTag,
          isPublic: data.is_public ?? false,
        };
        setArtifactBaselineSnapshot(serializeArtifactWorkspace(nextPanel));
        return nextPanel;
      });
    }

    void fetchPublicArtifacts();

    setArtifactSaveNotice("Saved to your Study Library");
    onStudyProgress(
      resolvedCourseTag
        ? `You're working through ${resolvedCourseTag} topics.`
        : "You're building on this study session."
    );
  }, [
    activeKnowledgeCourse,
    artifactPanel,
    chatFocus.course,
    chatFocus.topic,
    fetchPublicArtifacts,
    onRequireLogin,
    onStudyProgress,
    profileIsSearchable,
    sessionUserId,
  ]);

  const handleDeleteSavedArtifact = useCallback(
    async (artifact: SavedArtifact) => {
      if (!sessionUserId) {
        onRequireLogin("Log in to manage saved artifacts in your Study Library.");
        return;
      }

      const confirmed = window.confirm(`Delete "${artifact.title}" from your Study Library?`);
      if (!confirmed) return;

      const { error } = await supabase
        .from("study_artifacts")
        .delete()
        .eq("id", artifact.id)
        .eq("user_id", sessionUserId);

      if (error) {
        console.log("Delete artifact error:", error);
        setArtifactSaveNotice("I couldn't delete that artifact right now.");
        return;
      }

      setSavedArtifacts((prev) => prev.filter((entry) => entry.id !== artifact.id));
      setPublicArtifacts((prev) => prev.filter((entry) => entry.id !== artifact.id));
      setDismissedRecentArtifactId((prev) => (prev === artifact.id ? null : prev));

      if (recentArtifactResumeState?.savedArtifactId === artifact.id) {
        setRecentArtifactResumeState(null);
        clearStoredArtifactResume(sessionUserId);
      }

      setArtifactPanel((prev) => {
        if (!prev || prev.savedArtifactId !== artifact.id) return prev;
        const nextPanel = {
          ...prev,
          savedArtifactId: null,
        };
        setArtifactBaselineSnapshot(serializeArtifactWorkspace(nextPanel));
        return nextPanel;
      });

      setArtifactSaveNotice(
        artifactPanel?.savedArtifactId === artifact.id
          ? "Artifact deleted. This workspace is now a draft."
          : "Artifact deleted."
      );
    },
    [
      artifactPanel?.savedArtifactId,
      clearStoredArtifactResume,
      onRequireLogin,
      recentArtifactResumeState?.savedArtifactId,
      sessionUserId,
    ]
  );

  const handleArtifactExportPdf = useCallback(async () => {
    const target = artifactPreviewRef.current;
    if (!target || !artifactPanel) {
      alert("Artifact preview is not ready yet.");
      return;
    }

    try {
      const canvas = await captureElementCanvas(target, "[data-artifact-export]");
      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const base64 = jpegDataUrl.split(",")[1];
      if (!base64) {
        alert("Artifact export failed. I could not prepare the PDF download.");
        return;
      }
      const jpegBytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const pdfBlob = buildSinglePagePdfFromJpeg(jpegBytes, canvas.width, canvas.height);
      const objectUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.download = `${sanitizeDownloadFilename(artifactPanel.title, "study-artifact")}.pdf`;
      link.href = objectUrl;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error("Artifact export failed:", error);
      alert("Artifact export failed. I could not prepare the PDF download.");
    }
  }, [artifactPanel, captureElementCanvas]);

  const reopenCreationNoticeArtifact = useCallback(() => {
    if (!artifactCreationNotice) return;
    openArtifactWorkspace(artifactCreationNotice, { promptOnReplace: false });
  }, [artifactCreationNotice, openArtifactWorkspace]);

  useEffect(() => {
    if (!artifactCreationNotice) return;
    const timeout = window.setTimeout(() => setArtifactCreationNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [artifactCreationNotice]);

  useEffect(() => {
    if (!artifactHasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [artifactHasUnsavedChanges]);

  useEffect(() => {
    if (!artifactPanel) return;
    try {
      const storageKey = getArtifactResumeStorageKey(sessionUserId);
      if (!storageKey) return;

      window.localStorage.setItem(storageKey, JSON.stringify(artifactPanel));
      window.localStorage.removeItem(LAST_ARTIFACT_PANEL_STORAGE_KEY);
    } catch {
      // Ignore storage persistence failures.
    }
  }, [artifactPanel, sessionUserId]);

  useEffect(() => {
    const previousUserId = previousSessionUserIdRef.current;
    const previousStorageKey = getArtifactResumeStorageKey(previousUserId);
    const nextStorageKey = getArtifactResumeStorageKey(sessionUserId);
    let cancelled = false;

    try {
      if (previousStorageKey && previousUserId !== sessionUserId) {
        window.localStorage.removeItem(previousStorageKey);
      }
      if (!sessionUserId || previousUserId !== sessionUserId) {
        window.localStorage.removeItem(LAST_ARTIFACT_PANEL_STORAGE_KEY);
      }
    } catch {
      // Ignore storage persistence failures.
    }

    if (!sessionUserId) {
      window.setTimeout(() => {
        if (cancelled) return;
        setRecentArtifactResumeState(null);
        setDismissedRecentArtifactId(null);
      }, 0);
      previousSessionUserIdRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    try {
      const nextResumeState = parseStoredArtifactPanel(
        (nextStorageKey && window.localStorage.getItem(nextStorageKey)) ||
          window.localStorage.getItem(LAST_ARTIFACT_PANEL_STORAGE_KEY)
      );
      window.setTimeout(() => {
        if (cancelled) return;
        setRecentArtifactResumeState(nextResumeState);
        setDismissedRecentArtifactId(null);
      }, 0);
      if (nextStorageKey) {
        window.localStorage.removeItem(LAST_ARTIFACT_PANEL_STORAGE_KEY);
      }
    } catch {
      window.setTimeout(() => {
        if (cancelled) return;
        setRecentArtifactResumeState(null);
        setDismissedRecentArtifactId(null);
      }, 0);
    }

    previousSessionUserIdRef.current = sessionUserId;
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  useEffect(() => {
    let cancelled = false;

    const syncArtifacts = async () => {
      if (!sessionUserId) {
        window.setTimeout(() => {
          if (!cancelled) {
            setSavedArtifacts([]);
          }
        }, 0);
        return;
      }

      await fetchStudyArtifacts(sessionUserId);
    };

    void syncArtifacts();

    return () => {
      cancelled = true;
    };
  }, [fetchStudyArtifacts, sessionUserId]);

  useEffect(() => {
    let cancelled = false;

    const loadPublicArtifacts = async () => {
      await fetchPublicArtifacts();
    };

    void loadPublicArtifacts();

    return () => {
      cancelled = true;
      if (cancelled) {
        // no-op cleanup keeps the effect asynchronous without changing behavior
      }
    }
  }, [fetchPublicArtifacts]);

  return {
    artifactPanel,
    recentArtifactResume,
    visibleRecentArtifactResume,
    artifactCreationNotice,
    artifactSaveNotice,
    savedArtifacts,
    publicArtifacts,
    artifactPreviewRef,
    artifactPreviewContent,
    artifactHasUnsavedChanges,
    recentArtifacts,
    setArtifactCreationNotice,
    openArtifactWorkspace,
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
  };
}
