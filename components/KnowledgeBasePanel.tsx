"use client";

import type { RefObject } from "react";
import type { SavedArtifact } from "@/lib/artifactWorkspace";
import type {
  KnowledgeBaseCourse,
  PinnedSyllabus,
  RecentKnowledgeContext,
  SourceHealthState,
} from "@/lib/knowledgeBasePanel";

type KnowledgeBasePanelProps = {
  accentColor: string;
  accentBorder: string;
  knowledgeBaseCourses: KnowledgeBaseCourse[];
  sessionUserId?: string | null;
  activeKnowledgeCourse: string | null;
  chatFocusCourse: string;
  activeLectureSetLabel: string;
  activeLectureSetShortLabel: string;
  activeLectureIndexedCount: number;
  sourceHealth: SourceHealthState;
  sourceHealthExpanded: boolean;
  sourceHealthCourseBreakdown: Array<{ course: string; count: number }>;
  knowledgeBaseStatusIndexedCount: number;
  pinnedSyllabus: PinnedSyllabus | null;
  isSyllabusPreviewOpen: boolean;
  attachedKnowledgeButtonLabel: string | null;
  recentKnowledgeContexts: RecentKnowledgeContext[];
  savedArtifacts: SavedArtifact[];
  publicArtifacts: SavedArtifact[];
  knowledgeBaseActivationCourse: string | null;
  syllabusUploadInputRef: RefObject<HTMLInputElement | null>;
  formatPinnedTimestamp: (value?: string | null) => string;
  onKnowledgeFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSetActiveLectureSet: () => void;
  onClearActiveLectureSet: () => void;
  onToggleSourceHealth: () => void;
  onApplyKnowledgeCourse: (courseContext: string) => void;
  onRequestSyllabusUpload: () => void;
  onPinAttachedSyllabus: () => void;
  onOpenSyllabusPreview: () => void;
  onCloseSyllabusPreview: () => void;
  onUnpinSyllabus: () => void;
  onOpenSavedArtifact: (artifact: SavedArtifact) => void;
  onOpenPublicArtifact: (artifact: SavedArtifact) => void;
  onLogin: () => void;
  onRestoreRecentContext: (context: RecentKnowledgeContext) => void;
  onSelectKnowledgeCourse: (courseContext: string) => void;
};

export default function KnowledgeBasePanel({
  accentColor,
  accentBorder,
  knowledgeBaseCourses,
  sessionUserId,
  activeKnowledgeCourse,
  chatFocusCourse,
  activeLectureSetLabel,
  activeLectureSetShortLabel,
  activeLectureIndexedCount,
  sourceHealth,
  sourceHealthExpanded,
  sourceHealthCourseBreakdown,
  knowledgeBaseStatusIndexedCount,
  pinnedSyllabus,
  isSyllabusPreviewOpen,
  attachedKnowledgeButtonLabel,
  recentKnowledgeContexts,
  savedArtifacts,
  publicArtifacts,
  knowledgeBaseActivationCourse,
  syllabusUploadInputRef,
  formatPinnedTimestamp,
  onKnowledgeFileInputChange,
  onSetActiveLectureSet,
  onClearActiveLectureSet,
  onToggleSourceHealth,
  onApplyKnowledgeCourse,
  onRequestSyllabusUpload,
  onPinAttachedSyllabus,
  onOpenSyllabusPreview,
  onCloseSyllabusPreview,
  onUnpinSyllabus,
  onOpenSavedArtifact,
  onOpenPublicArtifact,
  onLogin,
  onRestoreRecentContext,
  onSelectKnowledgeCourse,
}: KnowledgeBasePanelProps) {
  return (
    <>
      <div className="space-y-5 sm:space-y-4">
        <input
          ref={syllabusUploadInputRef}
          type="file"
          accept=".txt,.md,.csv,.ics,.json"
          onChange={(event) => void onKnowledgeFileInputChange(event)}
          className="hidden"
        />

        <div
          role={knowledgeBaseActivationCourse ? "button" : undefined}
          tabIndex={knowledgeBaseActivationCourse ? 0 : -1}
          onClick={() => {
            if (knowledgeBaseActivationCourse) onSetActiveLectureSet();
          }}
          onKeyDown={(event) => {
            if (!knowledgeBaseActivationCourse) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSetActiveLectureSet();
            }
          }}
          className={`w-full rounded-2xl border p-4 text-left transition-all outline-none ${
            activeKnowledgeCourse
              ? `${accentBorder} bg-white/[0.03] hover:bg-white/[0.05]`
              : knowledgeBaseActivationCourse
                ? `${accentBorder} bg-white/[0.02] opacity-95 hover:bg-white/[0.04]`
                : "border-white/10 bg-white/[0.02] opacity-90"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black ${accentColor} uppercase mb-1`}>
                Active Lecture Set
              </p>
              <p className="text-sm text-slate-100 font-bold">{activeLectureSetLabel}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                {activeKnowledgeCourse
                  ? "Use this set to guide chat responses and lecture retrieval."
                  : "Choose a course below to lock retrieval onto a lecture set, or leave it clear to let chat infer the course."}
              </p>
            </div>
            <div
              className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${
                activeKnowledgeCourse
                  ? `${accentBorder} bg-white/[0.04] ${accentColor}`
                  : "border-white/10 bg-white/[0.03] text-slate-500"
              }`}
            >
              {activeLectureSetShortLabel}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSetActiveLectureSet();
              }}
              disabled={!knowledgeBaseActivationCourse}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                knowledgeBaseActivationCourse
                  ? `${accentBorder} bg-white/[0.05] ${accentColor} hover:bg-white/[0.08]`
                  : "border-white/10 bg-white/[0.03] text-slate-500"
              }`}
            >
              Set Active
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClearActiveLectureSet();
              }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:border-white/20 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-expanded={sourceHealthExpanded}
          title="Using lecture data for responses"
          onClick={onToggleSourceHealth}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleSourceHealth();
            }
          }}
          className={`rounded-2xl border ${accentBorder} bg-white/[0.02] p-4 transition-all outline-none hover:bg-white/[0.04]`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black ${accentColor} uppercase mb-1`}>
                Source Health
              </p>
              <p className="text-sm font-bold text-slate-100">
                {knowledgeBaseStatusIndexedCount} lectures available
              </p>
              {activeKnowledgeCourse ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplyKnowledgeCourse(activeKnowledgeCourse);
                  }}
                  className={`mt-2 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-5 transition-all outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:bg-white/[0.06]`}
                >
                  {activeLectureIndexedCount} in {activeLectureSetLabel}
                </button>
              ) : (
                <p className="mt-2 text-[11px] leading-5 text-slate-500">{sourceHealth.detail}</p>
              )}
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                Using lecture data for responses
              </p>
            </div>
            <div className="mt-1 flex items-start gap-2">
              <div
                className={`flex items-center gap-2 rounded-full border px-2.5 py-1 ${
                  sourceHealth.label === "Healthy"
                    ? "border-emerald-500/20 bg-emerald-500/10"
                    : sourceHealth.label === "Warning"
                      ? "border-amber-500/20 bg-amber-500/10"
                      : "border-rose-500/20 bg-rose-500/10"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    sourceHealth.label === "Healthy"
                      ? "bg-emerald-400"
                      : sourceHealth.label === "Warning"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                  }`}
                />
                <span
                  className={`text-[9px] font-black uppercase tracking-widest ${
                    sourceHealth.label === "Healthy"
                      ? "text-emerald-300"
                      : sourceHealth.label === "Warning"
                        ? "text-amber-300"
                        : "text-rose-300"
                  }`}
                >
                  {sourceHealth.label}
                </span>
              </div>
              <span className="pt-1 text-slate-500" aria-hidden="true">
                <svg
                  className={`h-4 w-4 transition-transform ${sourceHealthExpanded ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 7 5 5 5-5" />
                </svg>
              </span>
            </div>
          </div>

          {sourceHealthExpanded && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  By course
                </p>
                {sourceHealthCourseBreakdown.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {sourceHealthCourseBreakdown.map((course) => {
                      const matchingCourse = knowledgeBaseCourses.find(
                        (entry) => entry.courseContext === course.course
                      );
                      const courseLabel = matchingCourse?.label ?? course.course;
                      const isActiveCourse =
                        course.course === activeKnowledgeCourse || course.course === chatFocusCourse;

                      return (
                        <button
                          key={course.course}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (matchingCourse) {
                              onApplyKnowledgeCourse(matchingCourse.courseContext);
                            }
                          }}
                          disabled={!matchingCourse}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-[11px] transition-all outline-none ${
                            isActiveCourse
                              ? `${accentBorder} bg-white/[0.05] ${accentColor}`
                              : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.04]"
                          } ${!matchingCourse ? "cursor-default opacity-80" : ""}`}
                        >
                          <span className={isActiveCourse ? "font-black" : ""}>{courseLabel}</span>
                          <span
                            className={`font-black uppercase tracking-widest ${
                              isActiveCourse ? accentColor : "text-slate-500"
                            }`}
                          >
                            {course.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    No indexed lecture breakdown is available yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`rounded-2xl border ${accentBorder} bg-white/[0.02] p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black ${accentColor} uppercase mb-1`}>
                Pinned Syllabus
              </p>
              {pinnedSyllabus ? (
                <>
                  <p className="text-sm font-bold text-slate-100">{pinnedSyllabus.name}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    Pinned {formatPinnedTimestamp(pinnedSyllabus.pinnedAt)}. Niki can quietly consider
                    this schedule context while answering.
                  </p>
                </>
              ) : (
                <p className="text-[11px] leading-5 text-slate-500">
                  Upload or pin a syllabus, schedule, or study file so chat can follow your real course
                  timeline without turning the panel into a file dump.
                </p>
              )}
            </div>
            {pinnedSyllabus && (
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                Active
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRequestSyllabusUpload}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.035] ${accentColor} hover:bg-white/[0.07]`}
            >
              {sessionUserId ? "Upload / Attach File" : "Log in to upload a syllabus"}
            </button>
            {attachedKnowledgeButtonLabel && (
              <button
                type="button"
                onClick={onPinAttachedSyllabus}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.035] ${accentColor} hover:bg-white/[0.07]`}
              >
                {attachedKnowledgeButtonLabel}
              </button>
            )}
            {pinnedSyllabus && (
              <button
                type="button"
                onClick={onOpenSyllabusPreview}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-white/20 hover:text-white"
              >
                Preview
              </button>
            )}
            {pinnedSyllabus && (
              <button
                type="button"
                onClick={onUnpinSyllabus}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:border-white/20 hover:text-white"
              >
                Unpin
              </button>
            )}
          </div>
        </div>

        <div className={`rounded-2xl border ${accentBorder} bg-white/[0.02] p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black ${accentColor} uppercase mb-1`}>
                Study Library
              </p>
              <p className="text-sm font-bold text-slate-100">
                {sessionUserId ? "Saved artifacts" : "Save later when you log in"}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                {sessionUserId
                  ? "Saved artifacts reopen in the panel so you can keep editing, exporting, or reviewing them."
                  : "You can still generate, edit, and export artifacts while logged out. Log in to save them for later."}
              </p>
            </div>
            {sessionUserId ? (
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                {savedArtifacts.length}
              </div>
            ) : null}
          </div>

          {sessionUserId ? (
            savedArtifacts.length > 0 ? (
              <div className="mt-3 space-y-2">
                {savedArtifacts.slice(0, 8).map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => onOpenSavedArtifact(artifact)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-100">
                          {artifact.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] leading-4 text-slate-500">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                              artifact.is_public
                                ? `${accentBorder} ${accentColor} bg-white/[0.04]`
                                : "border-white/10 bg-white/[0.03] text-slate-500"
                            }`}
                          >
                            {artifact.is_public ? "🌐 Public" : "🔒 Private"}
                          </span>
                          <span>
                            {artifact.course_tag ?? "Study artifact"}
                            {artifact.topic_tag ? ` · ${artifact.topic_tag}` : ""}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        {formatPinnedTimestamp(artifact.updated_at ?? artifact.created_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                Save an artifact from the panel and it will show up here with its title, timestamp,
                and course tag.
              </p>
            )
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] leading-5 text-slate-500">
                Log in to build a persistent study library. Your current artifact work still stays fully
                usable in-session.
              </p>
              <button
                type="button"
                onClick={onLogin}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.035] ${accentColor} hover:bg-white/[0.07]`}
              >
                Log In
              </button>
            </div>
          )}

          {publicArtifacts.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[10px] font-black ${accentColor} uppercase`}>
                    Public Discovery
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    Only artifacts explicitly marked public are discoverable here.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {publicArtifacts.length}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {publicArtifacts.slice(0, 5).map((artifact) => (
                  <button
                    key={`public-${artifact.id}`}
                    type="button"
                    onClick={() => onOpenPublicArtifact(artifact)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-100">
                          {artifact.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] leading-4 text-slate-500">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${accentBorder} ${accentColor} bg-white/[0.04]`}
                          >
                            🌐 Public
                          </span>
                          <span>
                            {artifact.course_tag ?? "Study artifact"}
                            {artifact.topic_tag ? ` · ${artifact.topic_tag}` : ""}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        {formatPinnedTimestamp(artifact.updated_at ?? artifact.created_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`rounded-2xl border ${accentBorder} bg-white/[0.02] p-4`}>
          <p className={`text-[10px] font-black ${accentColor} uppercase mb-3`}>Recent Context</p>
          {recentKnowledgeContexts.length > 0 ? (
            <div className="space-y-2">
              {recentKnowledgeContexts.map((context) => (
                <button
                  key={context.id}
                  type="button"
                  onClick={() => onRestoreRecentContext(context)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-100">
                    {knowledgeBaseCourses.find((course) => course.courseContext === context.course)
                      ?.label ?? context.course}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{context.topic}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-5 text-slate-500">
              No recent topic yet. Start a chat to build your study context.
            </p>
          )}
        </div>

        <div className={`rounded-2xl border ${accentBorder} bg-white/[0.02] p-4`}>
          <p className={`text-[10px] font-black ${accentColor} uppercase mb-3`}>Courses</p>
          <div className="flex flex-wrap gap-2">
            {knowledgeBaseCourses.map((course) => {
              const isActiveCourse =
                course.courseContext === activeKnowledgeCourse || course.courseContext === chatFocusCourse;
              return (
                <button
                  key={course.courseContext}
                  type="button"
                  onClick={() => onSelectKnowledgeCourse(course.courseContext)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${
                    isActiveCourse
                      ? `${accentBorder} bg-white/[0.06] ${accentColor} shadow-[0_0_0_1px_rgba(255,255,255,0.02)]`
                      : "border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:bg-white/[0.04] hover:text-slate-300"
                  }`}
                >
                  {course.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Organized course focus keeps retrieval tidy without turning the sidebar into a raw file pile.
          </p>
        </div>
      </div>

      {isSyllabusPreviewOpen && pinnedSyllabus && (
        <>
          <button
            type="button"
            aria-label="Close syllabus preview"
            onClick={onCloseSyllabusPreview}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
          />
          <div className="fixed inset-x-3 top-8 z-50 mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#090909]/98 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:inset-x-8">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                  Pinned Syllabus
                </p>
                <h2 className="mt-2 truncate text-lg font-extrabold tracking-tight text-white">
                  {pinnedSyllabus.name}
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Attached {formatPinnedTimestamp(pinnedSyllabus.pinnedAt)} for retrieval-aware study help.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseSyllabusPreview}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
                {pinnedSyllabus.content}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
