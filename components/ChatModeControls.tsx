"use client";

import type { Dispatch, SetStateAction } from "react";

type KnowledgeBaseCourseOption = {
  label: string;
  courseContext: string;
  shortLabel: string;
};

type ChatFocusStateLike = {
  course: string;
  topic: string;
};

type ChatModeControlsProps = {
  isNikiMode: boolean;
  lectureMode: boolean;
  chatFocus: ChatFocusStateLike;
  focusSummary: string;
  focusSuggestion: string | null;
  focusCourseLabel: string;
  focusModeExpanded: boolean | null;
  mobileControlsExpanded: boolean;
  mobileControlsSummary: string;
  accentColor: string;
  accentBorder: string;
  focusModeHeaderClass: string;
  knowledgeBaseCourses: KnowledgeBaseCourseOption[];
  switchNikiMode: (mode: boolean) => void;
  setLectureMode: Dispatch<SetStateAction<boolean>>;
  setChatFocus: Dispatch<SetStateAction<ChatFocusStateLike>>;
  setMobileControlsExpanded: Dispatch<SetStateAction<boolean>>;
  toggleFocusMode: () => void;
  toggleMobileControls: () => void;
};

export default function ChatModeControls({
  isNikiMode,
  lectureMode,
  chatFocus,
  focusSummary,
  focusSuggestion,
  focusCourseLabel,
  focusModeExpanded,
  mobileControlsExpanded,
  mobileControlsSummary,
  accentColor,
  accentBorder,
  focusModeHeaderClass,
  knowledgeBaseCourses,
  switchNikiMode,
  setLectureMode,
  setChatFocus,
  setMobileControlsExpanded,
  toggleFocusMode,
  toggleMobileControls,
}: ChatModeControlsProps) {
  const trimmedTopic = chatFocus.topic.trim();
  const studyControlsSummary = [
    isNikiMode ? (lectureMode ? "Lecture Mode On" : "Lecture Mode Off") : null,
    chatFocus.course ? focusSummary : trimmedTopic ? trimmedTopic : "No course selected",
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <>
      <div className="hidden sm:block">
        <div className="flex items-center justify-center">
          <div className="flex max-w-[300px] w-auto items-center rounded-full border border-white/6 bg-[#0b0b0b]/88 p-1 shadow-[0_12px_28px_rgba(0,0,0,0.16)] backdrop-blur sm:max-w-[340px] sm:rounded-xl">
            <button
              onClick={() => switchNikiMode(false)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none sm:rounded-lg sm:px-4 sm:py-2 sm:text-[9px] ${
                !isNikiMode ? "bg-white/10 text-white" : "text-slate-500 hover:text-white"
              }`}
            >
              Pure Logic
            </button>
            <button
              onClick={() => switchNikiMode(true)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none sm:rounded-lg sm:px-4 sm:py-2 sm:text-[9px] ${
                isNikiMode ? `bg-white/5 ${accentColor}` : "text-slate-500 hover:text-white"
              }`}
            >
              Nemanja Mode
            </button>
          </div>
        </div>

        <div className={`mt-1.5 ${focusModeHeaderClass}`}>
          <button
            type="button"
            onClick={toggleFocusMode}
            className="flex w-full items-center justify-between gap-3 text-left outline-none"
            aria-expanded={focusModeExpanded === null ? undefined : focusModeExpanded}
          >
            <div className="min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                Study Controls
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500/85 sm:mt-1">
                {studyControlsSummary}
              </p>
            </div>
            <svg
              className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${
                focusModeExpanded === true
                  ? "rotate-180"
                  : focusModeExpanded === null
                    ? "sm:rotate-180"
                    : ""
              }`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 7 5 5 5-5" />
            </svg>
          </button>

          <div
            className={`${
              focusModeExpanded === true
                ? "mt-2.5 block"
                : focusModeExpanded === false
                  ? "hidden"
                  : "hidden"
            }`}
          >
            <div className="space-y-2.5 rounded-2xl border border-white/6 bg-white/[0.012] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]">
              {isNikiMode && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/[0.015] px-3 py-2">
                  <div className="min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${accentColor}`}>
                      Lecture Mode
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600/80">
                      Use lecture-aware teaching when it helps.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLectureMode((prev) => !prev)}
                    className={`rounded-full border px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none sm:rounded-xl sm:px-3 sm:py-2 sm:text-[9px] ${
                      lectureMode
                        ? `${accentBorder} bg-white/[0.06] ${accentColor}`
                        : "border-white/10 bg-[#0b0b0b]/90 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {lectureMode ? "Teaching: ON" : "Teaching: OFF"}
                  </button>
                </div>
              )}

              <div>
                <div className="mb-1.5 min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-widest ${accentColor}`}>
                    Focus Mode
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-600/80">
                    Control how chat interprets your question
                  </p>
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto]">
                <label className="sr-only" htmlFor="chat-focus-course">
                  Current focus course
                </label>
                <select
                  id="chat-focus-course"
                  value={chatFocus.course}
                  onChange={(e) => setChatFocus((prev) => ({ ...prev, course: e.target.value }))}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-bold text-slate-200 outline-none transition focus:border-white/25"
                >
                  <option value="" className="bg-[#0d0d0d] text-slate-200">
                    No subject selected
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
                <label className="sr-only" htmlFor="chat-focus-topic">
                  Current topic or section
                </label>
                <input
                  id="chat-focus-topic"
                  type="text"
                  value={chatFocus.topic}
                  onChange={(e) => setChatFocus((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder="Current topic or section, like 7.3 or integration by parts"
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-white/25"
                />
                <button
                  type="button"
                    onClick={() => setChatFocus((prev) => ({ ...prev, topic: "" }))}
                    className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-white/20 hover:text-slate-300"
                  >
                    Clear
                  </button>
              </div>
                {focusSuggestion && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500/85">
                    <span>Suggested:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setChatFocus((prev) => ({
                          ...prev,
                          topic: focusSuggestion,
                        }))
                      }
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:bg-white/[0.06]`}
                    >
                      {focusCourseLabel} — {focusSuggestion}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sm:hidden">
        <button
          type="button"
          onClick={toggleMobileControls}
          className="flex w-full items-center justify-between gap-3 rounded-[0.95rem] border border-white/6 bg-white/[0.02] px-3 py-2 text-left outline-none transition-all hover:bg-white/[0.038]"
          aria-expanded={mobileControlsExpanded}
        >
          <p className="min-w-0 truncate text-[11px] font-bold text-slate-300">
            {mobileControlsSummary}
          </p>
          <svg
            className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${
              mobileControlsExpanded ? "rotate-180" : ""
            }`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 7 5 5 5-5" />
          </svg>
        </button>

        {mobileControlsExpanded && (
          <div className="mt-1.5 space-y-1.5 rounded-2xl border border-white/6 bg-white/[0.012] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]">
            <div className="px-1">
              <p className={`text-[9px] font-black uppercase tracking-widest ${accentColor}`}>
                Study Controls
              </p>
            </div>
            <div className="flex items-center rounded-full border border-white/6 bg-[#0b0b0b]/88 p-1 shadow-[0_10px_24px_rgba(0,0,0,0.16)] backdrop-blur">
              <button
                onClick={() => switchNikiMode(false)}
                className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none ${
                  !isNikiMode ? "bg-white/10 text-white" : "text-slate-500 hover:text-white"
                }`}
              >
                Pure Logic
              </button>
              <button
                onClick={() => switchNikiMode(true)}
                className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none ${
                  isNikiMode ? `bg-white/5 ${accentColor}` : "text-slate-500 hover:text-white"
                }`}
              >
                Nemanja Mode
              </button>
            </div>

            {isNikiMode && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/[0.015] px-3 py-2">
                <div className="min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-widest ${accentColor}`}>
                    Lecture Mode
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-600/80">
                    Use lecture-aware teaching when it helps.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLectureMode((prev) => !prev);
                    setMobileControlsExpanded(false);
                  }}
                  className={`rounded-full border px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none ${
                    lectureMode
                      ? `${accentBorder} bg-white/[0.06] ${accentColor}`
                      : "border-white/10 bg-[#0b0b0b]/90 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {lectureMode ? "Teaching: ON" : "Teaching: OFF"}
                </button>
              </div>
            )}

            <div className={`${focusModeHeaderClass} rounded-2xl border-white/6 bg-white/[0.01] px-3 py-2.5`}>
              <div className="min-w-0">
                <p className={`text-[9px] font-black uppercase tracking-widest ${accentColor}`}>
                  Focus Mode
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500/85">{focusSummary}</p>
                <p className="mt-1 text-[10px] text-slate-600/80">
                  Control how chat interprets your question
                </p>
              </div>

              <div className="mt-2.5 block">
                <div className="grid gap-2">
                  <label className="sr-only" htmlFor="chat-focus-course-mobile">
                    Current focus course
                  </label>
                  <select
                    id="chat-focus-course-mobile"
                    value={chatFocus.course}
                    onChange={(e) => {
                      setChatFocus((prev) => ({ ...prev, course: e.target.value }));
                      setMobileControlsExpanded(false);
                    }}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-bold text-slate-200 outline-none transition focus:border-white/25"
                  >
                    <option value="" className="bg-[#0d0d0d] text-slate-200">
                      No subject selected
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
                  <label className="sr-only" htmlFor="chat-focus-topic-mobile">
                    Current topic or section
                  </label>
                  <input
                    id="chat-focus-topic-mobile"
                    type="text"
                    value={chatFocus.topic}
                    onChange={(e) => setChatFocus((prev) => ({ ...prev, topic: e.target.value }))}
                    placeholder="Current topic or section"
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-white/25"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setChatFocus((prev) => ({ ...prev, topic: "" }));
                      setMobileControlsExpanded(false);
                    }}
                    className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-white/20 hover:text-slate-300"
                  >
                    Clear
                  </button>
                </div>
                {focusSuggestion && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500/85">
                    <span>Suggested:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setChatFocus((prev) => ({
                          ...prev,
                          topic: focusSuggestion,
                        }));
                        setMobileControlsExpanded(false);
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-all outline-none ${accentBorder} bg-white/[0.03] ${accentColor} hover:bg-white/[0.06]`}
                    >
                      {focusCourseLabel} — {focusSuggestion}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
