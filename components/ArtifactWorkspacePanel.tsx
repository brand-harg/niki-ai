"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { type ArtifactKind, type ArtifactPanelState, type SavedArtifact } from "@/lib/artifactWorkspace";

type ArtifactWorkspacePanelProps = {
  artifactPanel: ArtifactPanelState | null;
  artifactSaveNotice: string | null;
  artifactHasUnsavedChanges: boolean;
  artifactPreviewContent: string;
  recentArtifacts: SavedArtifact[];
  savedArtifactsCount: number;
  sessionUserId?: string | null;
  accentColor: string;
  accentBorder: string;
  artifactMarkdownComponents: Components;
  artifactPreviewRef: React.RefObject<HTMLDivElement | null>;
  artifactKindLabel: (kind: ArtifactKind) => string;
  formatPinnedTimestamp: (value?: string | null) => string;
  onClose: () => void;
  onVisibilityToggle: () => void;
  onSave: () => void;
  onRefresh: () => void;
  onExportPdf: () => void;
  onOpenSavedArtifact: (artifact: SavedArtifact) => void;
  onDeleteSavedArtifact: (artifact: SavedArtifact) => void;
  onContentChange: (content: string) => void;
};

export default function ArtifactWorkspacePanel({
  artifactPanel,
  artifactSaveNotice,
  artifactHasUnsavedChanges,
  artifactPreviewContent,
  recentArtifacts,
  savedArtifactsCount,
  sessionUserId,
  accentColor,
  accentBorder,
  artifactMarkdownComponents,
  artifactPreviewRef,
  artifactKindLabel,
  formatPinnedTimestamp,
  onClose,
  onVisibilityToggle,
  onSave,
  onRefresh,
  onExportPdf,
  onOpenSavedArtifact,
  onDeleteSavedArtifact,
  onContentChange,
}: ArtifactWorkspacePanelProps) {
  if (!artifactPanel) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close artifact panel"
        onClick={onClose}
        data-print-hide
        className="fixed inset-0 z-40 animate-in fade-in duration-200 bg-black/60 backdrop-blur-[2px]"
      />
      <aside
        data-artifact-panel-shell
        className="fixed inset-y-0 right-0 z-50 flex w-full animate-in slide-in-from-right-6 fade-in duration-300 sm:min-w-[420px] sm:w-[min(92vw,48rem)] lg:w-[min(56vw,52rem)] lg:max-w-[52rem] flex-col border-l border-white/10 bg-[#090909]/98 shadow-[-24px_0_80px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
              📘 Study Artifact
            </p>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight text-white">
              {artifactPanel.title}
            </h2>
            <p className="mt-2 text-[11px] text-slate-500">
              Structured notes generated from your request
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <span className={`rounded-full border px-2.5 py-1 ${accentBorder} bg-white/[0.04] ${accentColor}`}>
                {artifactKindLabel(artifactPanel.kind)}
              </span>
              {(artifactPanel.courseTag || artifactPanel.topicTag) && (
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-400">
                  {[artifactPanel.courseTag, artifactPanel.topicTag].filter(Boolean).join(" · ")}
                </span>
              )}
              {artifactPanel.isPublic !== null && artifactPanel.isPublic !== undefined && (
                <span className={`rounded-full border px-2.5 py-1 ${artifactPanel.isPublic ? `${accentBorder} bg-white/[0.04] ${accentColor}` : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
                  {artifactPanel.isPublic ? "🌐 Public" : "🔒 Private"}
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-400">
                {artifactPanel.sourceAttached
                  ? `${artifactPanel.sourceCourse ?? "Lecture source"} · ${artifactPanel.sourceConfidence === "high"
                    ? "high confidence"
                    : artifactPanel.sourceConfidence === "medium"
                      ? "medium confidence"
                      : artifactPanel.sourceConfidence === "low"
                        ? "low confidence"
                        : "source attached"}`
                  : "No lecture source attached"}
              </span>
              {artifactHasUnsavedChanges ? (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-amber-300">
                  Unsaved changes
                </span>
              ) : sessionUserId ? (
                artifactPanel.savedArtifactId ? (
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                    Saved
                  </span>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-400">
                    Draft
                  </span>
                )
              ) : null}
            </div>
          </div>
          <div data-print-hide className="flex items-center gap-2">
            {sessionUserId && (
              <button
                type="button"
                onClick={onVisibilityToggle}
                className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${artifactPanel.isPublic ? `${accentBorder} bg-white/[0.05] ${accentColor} hover:bg-white/[0.08]` : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-white"}`}
              >
                {artifactPanel.isPublic ? "Make Private" : "Make Public"}
              </button>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={!!sessionUserId && !!artifactPanel.savedArtifactId && !artifactHasUnsavedChanges}
              className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${accentBorder} bg-white/[0.05] ${accentColor} hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {!sessionUserId
                ? "Save to Study Library"
                : artifactPanel.savedArtifactId
                  ? "Save Changes"
                  : "Save to Study Library"}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onExportPdf}
              className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${accentBorder} bg-white/[0.05] ${accentColor} hover:bg-white/[0.08]`}
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
        {artifactSaveNotice && (
          <div data-print-hide className="border-b border-white/10 px-4 py-2 sm:px-5">
            <p className="text-[11px] text-slate-400">{artifactSaveNotice}</p>
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-4 py-4 sm:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] sm:px-5">
          <section data-print-hide className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Editable Content
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Update notes, examples, or summaries here. The preview updates in place.
              </p>
              <p className="mt-2 text-[10px] text-slate-600">
                Try lightweight section markers like <code className="rounded bg-white/[0.04] px-1 py-0.5 text-[0.95em] text-slate-400">&lt;!-- Definition --&gt;</code> and <code className="rounded bg-white/[0.04] px-1 py-0.5 text-[0.95em] text-slate-400">&lt;!-- Rules --&gt;</code>.
              </p>
            </div>
            {sessionUserId && recentArtifacts.length > 0 && (
              <div className="border-b border-white/10 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Recent Artifacts
                  </p>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    {savedArtifactsCount} saved
                  </span>
                </div>
                <div className="space-y-2">
                  {recentArtifacts.map((artifact) => (
                    <div
                      key={`panel-${artifact.id}`}
                      className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 transition hover:border-white/20 hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => onOpenSavedArtifact(artifact)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-100">
                            {artifact.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] leading-4 text-slate-500">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${artifact.is_public ? `${accentBorder} ${accentColor} bg-white/[0.04]` : "border-white/10 bg-white/[0.03] text-slate-500"}`}>
                              {artifact.is_public ? "🌐 Public" : "🔒 Private"}
                            </span>
                            <span>{artifactKindLabel((artifact.kind as ArtifactKind | null) ?? "notes")}</span>
                            <span>{artifact.course_tag ?? "No course"}</span>
                          </div>
                        </button>
                        <div className="flex shrink-0 items-start gap-2">
                          <span className="pt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                            {formatPinnedTimestamp(artifact.updated_at ?? artifact.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteSavedArtifact(artifact)}
                            className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 transition hover:border-rose-500/30 hover:text-rose-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <textarea
              value={artifactPanel.content}
              onChange={(event) => onContentChange(event.target.value)}
              className="min-h-[18rem] flex-1 resize-none bg-transparent px-4 py-4 text-sm leading-7 text-slate-100 outline-none placeholder:text-slate-600"
              placeholder={`Edit notes, formulas, or structure...

<!-- Definition -->

<!-- Rules -->

<!-- Example -->`}
            />
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d]/95">
            <div className="border-b border-white/10 px-4 py-3">
              <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                Preview
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Structured sections and LaTeX render here with the same math pipeline as chat.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div
                ref={artifactPreviewRef}
                data-artifact-export
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.22)]"
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${accentBorder} bg-white/[0.04] ${accentColor}`}>
                    {artifactPanel.kind}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Live Preview
                  </span>
                </div>
                <div className="prose prose-invert prose-base sm:prose-lg max-w-none prose-p:my-4 prose-li:my-2 prose-ul:my-4 prose-ol:my-4 prose-headings:my-4 [&_.katex-display]:my-5 [&_.katex-display]:overflow-x-auto [&_hr]:border-white/10">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={artifactMarkdownComponents}
                  >
                    {artifactPreviewContent}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </section>
        </div>
        <style jsx global>{`
          @media print {
            body.niki-artifact-print-mode {
              background: #ffffff !important;
            }

            body.niki-artifact-print-mode * {
              visibility: hidden !important;
            }

            body.niki-artifact-print-mode [data-artifact-panel-shell],
            body.niki-artifact-print-mode [data-artifact-panel-shell] * {
              visibility: visible !important;
            }

            body.niki-artifact-print-mode [data-print-hide] {
              display: none !important;
            }

            body.niki-artifact-print-mode [data-artifact-panel-shell] {
              position: static !important;
              inset: auto !important;
              width: 100% !important;
              max-width: none !important;
              min-width: 0 !important;
              height: auto !important;
              border: none !important;
              background: #ffffff !important;
              box-shadow: none !important;
              backdrop-filter: none !important;
              color: #0f172a !important;
              overflow: visible !important;
              animation: none !important;
            }

            body.niki-artifact-print-mode [data-artifact-panel-shell] > div {
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
            }

            body.niki-artifact-print-mode [data-artifact-panel-shell] .grid {
              display: block !important;
            }

            body.niki-artifact-print-mode [data-artifact-panel-shell] section,
            body.niki-artifact-print-mode [data-artifact-panel-shell] .min-h-0,
            body.niki-artifact-print-mode [data-artifact-panel-shell] .flex-1,
            body.niki-artifact-print-mode [data-artifact-panel-shell] .overflow-hidden,
            body.niki-artifact-print-mode [data-artifact-panel-shell] .overflow-y-auto {
              min-height: 0 !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
            }

            body.niki-artifact-print-mode [data-artifact-export] {
              border: none !important;
              background: #ffffff !important;
              box-shadow: none !important;
              color: #0f172a !important;
              display: block !important;
              width: 100% !important;
              max-width: 7.5in !important;
              margin: 0 auto !important;
              page-break-inside: auto !important;
              break-inside: auto !important;
            }

            body.niki-artifact-print-mode [data-artifact-export] *,
            body.niki-artifact-print-mode [data-artifact-export] p,
            body.niki-artifact-print-mode [data-artifact-export] li,
            body.niki-artifact-print-mode [data-artifact-export] h1,
            body.niki-artifact-print-mode [data-artifact-export] h2,
            body.niki-artifact-print-mode [data-artifact-export] h3,
            body.niki-artifact-print-mode [data-artifact-export] h4,
            body.niki-artifact-print-mode [data-artifact-export] strong,
            body.niki-artifact-print-mode [data-artifact-export] span {
              color: #0f172a !important;
              text-shadow: none !important;
              box-shadow: none !important;
              filter: none !important;
              backdrop-filter: none !important;
            }

            body.niki-artifact-print-mode [data-artifact-export] hr {
              border-color: #cbd5e1 !important;
            }

            body.niki-artifact-print-mode [data-artifact-export] .katex,
            body.niki-artifact-print-mode [data-artifact-export] .katex * {
              color: #020617 !important;
            }

            body.niki-artifact-print-mode [data-artifact-export] .katex-display,
            body.niki-artifact-print-mode [data-artifact-export] pre,
            body.niki-artifact-print-mode [data-artifact-export] blockquote,
            body.niki-artifact-print-mode [data-artifact-export] table,
            body.niki-artifact-print-mode [data-artifact-export] ul,
            body.niki-artifact-print-mode [data-artifact-export] ol {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            body.niki-artifact-print-mode [data-artifact-export] .rounded-full,
            body.niki-artifact-print-mode [data-artifact-export] .rounded-2xl {
              border-color: #cbd5e1 !important;
              background: transparent !important;
            }

            @page {
              size: auto;
              margin: 0.55in;
            }
          }
        `}</style>
      </aside>
    </>
  );
}
