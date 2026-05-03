"use client";

type KnowledgeBaseCourseOption = {
  label: string;
  courseContext: string;
  shortLabel: string;
};

type ChatFocusStateLike = {
  course: string;
  topic: string;
};

type FocusModePanelProps = {
  variant: "desktop" | "mobile";
  chatFocus: ChatFocusStateLike;
  focusSummary: string;
  focusSuggestion: string | null;
  focusCourseLabel: string;
  accentColor: string;
  accentBorder: string;
  focusModeHeaderClass?: string;
  knowledgeBaseCourses: KnowledgeBaseCourseOption[];
  onCourseChange: (course: string) => void;
  onTopicChange: (topic: string) => void;
  onClearTopic: () => void;
  onApplySuggestion: () => void;
};

export default function FocusModePanel({
  variant,
  chatFocus,
  focusSummary,
  focusSuggestion,
  focusCourseLabel,
  accentColor,
  accentBorder,
  focusModeHeaderClass = "",
  knowledgeBaseCourses,
  onCourseChange,
  onTopicChange,
  onClearTopic,
  onApplySuggestion,
}: FocusModePanelProps) {
  const isMobile = variant === "mobile";
  const courseInputId = isMobile ? "chat-focus-course-mobile" : "chat-focus-course";
  const topicInputId = isMobile ? "chat-focus-topic-mobile" : "chat-focus-topic";
  const gridClassName = isMobile
    ? "grid gap-2"
    : "grid flex-1 gap-2 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto]";
  const topicPlaceholder = isMobile
    ? "Current topic or section"
    : "Current topic or section, like 7.3 or integration by parts";
  const clearButtonClassName = isMobile
    ? "rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-white/20 hover:text-slate-300"
    : "rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-white/20 hover:text-slate-300";

  const controls = (
    <>
      <div className={isMobile ? "min-w-0" : "mb-1.5 min-w-0"}>
        <p className={`text-[9px] font-black uppercase tracking-widest ${accentColor}`}>
          Focus Mode
        </p>
        {isMobile && (
          <p className="mt-0.5 truncate text-[11px] text-slate-500/85">{focusSummary}</p>
        )}
        <p className={isMobile ? "mt-1 text-[10px] text-slate-600/80" : "mt-0.5 text-[10px] text-slate-600/80"}>
          Adds course and topic context to your next message.
        </p>
      </div>

      <div className={isMobile ? "mt-2.5 block" : undefined}>
        <div className={gridClassName}>
          <label className="sr-only" htmlFor={courseInputId}>
            Current focus course
          </label>
          <select
            id={courseInputId}
            value={chatFocus.course}
            onChange={(e) => onCourseChange(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-bold text-slate-200 outline-none transition focus:border-white/25"
          >
            <option value="" className="bg-[#0d0d0d] text-slate-200">
              No course selected
            </option>
            {knowledgeBaseCourses.map((course) => (
              <option
                key={course.courseContext}
                value={course.courseContext}
                className="bg-[#0d0d0d] text-slate-200"
              >
                {course.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor={topicInputId}>
            Current topic or section
          </label>
          <input
            id={topicInputId}
            type="text"
            value={chatFocus.topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder={topicPlaceholder}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-white/25"
          />
          <button
            type="button"
            onClick={onClearTopic}
            className={clearButtonClassName}
          >
            Clear
          </button>
        </div>
        {focusSuggestion && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500/85">
            <span>Try:</span>
            <button
              type="button"
              onClick={onApplySuggestion}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:bg-white/[0.06]`}
            >
              {focusCourseLabel} — {focusSuggestion}
            </button>
          </div>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className={`${focusModeHeaderClass} rounded-2xl border-white/6 bg-white/[0.01] px-3 py-2.5`}>
        {controls}
      </div>
    );
  }

  return <div>{controls}</div>;
}
