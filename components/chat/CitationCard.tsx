"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  cleanEvidenceText,
  confidenceFromCitations,
  dedupeCitations,
  formatTimestamp,
  getCitationEvidenceMeta,
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
  type ChatDisplayCitation,
  type ChatDisplayRetrievalConfidence,
} from "@/lib/chatDisplay";

type CitationCardProps = {
  citations: ChatDisplayCitation[];
  confidence?: ChatDisplayRetrievalConfidence;
  accentColor: string;
  knowledgeBaseCourse?: string;
  requestedCourse?: string;
  knowledgeBaseMismatch?: boolean;
};

export default function CitationCard({
  citations,
  confidence,
  accentColor,
  knowledgeBaseCourse,
  requestedCourse,
  knowledgeBaseMismatch,
}: CitationCardProps) {
  const isGreen = accentColor === "green";
  const isAmber = accentColor === "amber";
  const accentText = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const accentBorder = isGreen ? "border-green-500/20" : isAmber ? "border-amber-500/20" : "border-cyan-500/20";
  const accentBg = isGreen ? "bg-green-500/5" : isAmber ? "bg-amber-500/5" : "bg-cyan-500/5";
  const unique = useMemo(() => dedupeCitations(citations).slice(0, 4), [citations]);
  const [activeClip, setActiveClip] = useState<ChatDisplayCitation | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const shownConfidence = confidence ?? confidenceFromCitations(unique);
  const activeLectureSet = knowledgeBaseCourse?.trim() || "";
  const requestedCourseLabel = requestedCourse?.trim() || "";
  const lowRelevance = !!knowledgeBaseMismatch || shownConfidence === "low";
  const lectureSupportTone =
    unique.length > 0 && !knowledgeBaseMismatch && shownConfidence === "high"
      ? "strong"
      : "partial";
  const displayedCitations = useMemo(() => {
    const narrowed =
      lectureSupportTone === "partial"
        ? unique.filter((citation) => {
            const hasTranscriptEvidence = cleanEvidenceText(citation.excerpt).length > 0;
            const hasTopicEvidence = cleanEvidenceText(citation.sectionHint).length > 0;
            return (
              hasTranscriptEvidence ||
              hasTopicEvidence ||
              (typeof citation.similarity === "number" && citation.similarity >= 0.55)
            );
          })
        : unique;

    const base = narrowed.length > 0 ? narrowed : unique;
    return lectureSupportTone === "partial" ? base.slice(0, 2) : base.slice(0, 4);
  }, [lectureSupportTone, unique]);
  const confidenceLabel =
    lowRelevance
      ? "Low relevance"
      : shownConfidence === "high"
      ? "High confidence"
      : shownConfidence === "medium"
        ? "Medium confidence"
          : "No confidence score";

  if (!displayedCitations.length) return null;

  const activeEmbedUrl = getYouTubeEmbedUrl(activeClip?.timestampUrl, activeClip?.timestampStartSeconds);

  return (
    <>
    <div className={`mt-4 rounded-2xl border ${accentBorder} ${accentBg} p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_45px_rgba(0,0,0,0.18)]`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[9px] font-black uppercase tracking-widest ${accentText}`}>
            Lecture Source
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
              {lectureSupportTone === "strong"
              ? "This answer is based on lecture material"
              : "Partially supported by lecture material"}
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
            View source
            </button>
          {shownConfidence && shownConfidence !== "none" && (
            <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
              {confidenceLabel}
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {displayedCitations.map((c, i) => {
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
                  Lecture Source details
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Review the lecture material behind this answer. Exact transcript matches are shown when available, and broader matches are labeled clearly.
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
                {displayedCitations.map((citation, index) => {
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
}
