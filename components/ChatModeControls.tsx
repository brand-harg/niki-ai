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
  return (
    <>
      <div className="hidden sm:block">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
          <div className="justify-self-end">
            <div
              aria-hidden="true"
              className="pointer-events-none select-none rounded-full border border-transparent px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest opacity-0 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[9px]"
            >
              Teaching: OFF
            </div>
          </div>

          <div className="flex max-w-[300px] items-center rounded-full border border-white/10 bg-[#0b0b0b]/95 p-1 shadow-2xl backdrop-blur sm:max-w-[340px] sm:rounded-xl w-auto justify-self-center">
            <button
              onClick={() => switchNikiMode(false)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none sm:rounded-lg sm:px-4 sm:py-2 sm:text-[9px] ${
                !isNikiMode ? "bg-white/10 text-white" : "text-slate-600 hover:text-white"
              }`}
            >
              Pure Logic
            </button>
            <button
              onClick={() => switchNikiMode(true)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none sm:rounded-lg sm:px-4 sm:py-2 sm:text-[9px] ${
                isNikiMode ? `bg-white/5 ${accentColor}` : "text-slate-600 hover:text-white"
              }`}
            >
              Nemanja Mode
            </button>
          </div>

          <div className="justify-self-start">
            {isNikiMode ? (
              <button
                type="button"
                onClick={() => setLectureMode((prev) => !prev)}
                className={`rounded-full border px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none sm:rounded-xl sm:px-3 sm:py-2 sm:text-[9px] ${
                  lectureMode
                    ? `${accentBorder} bg-white/[0.06] ${accentColor}`
                    : "border-white/10 bg-[#0b0b0b]/90 text-slate-600 hover:text-slate-300"
                }`}
              >
                {lectureMode ? "Teaching: ON" : "Teaching: OFF"}
              </button>
            ) : (
              <div
                aria-hidden="true"
                className="pointer-events-none select-none rounded-full border border-transparent px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest opacity-0 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[9px]"
              >
                Teaching: OFF
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-[12px] items-center justify-start sm:justify-center">
          <p
            className={`text-[10px] font-bold tracking-wide transition-opacity ${
              isNikiMode && lectureMode ? `${accentColor} opacity-90` : "opacity-0"
            }`}
            aria-live="polite"
          >
            {isNikiMode && lectureMode
              ? `Teaching Mode Active${chatFocus.topic.trim() ? ` · Focus: ${focusCourseLabel} — ${chatFocus.topic.trim()}` : ""}`
              : "Teaching Mode Inactive"}
          </p>
        </div>

        <div className={focusModeHeaderClass}>
          <button
            type="button"
            onClick={toggleFocusMode}
            className="flex w-full items-center justify-between gap-3 text-left outline-none"
            aria-expanded={focusModeExpanded === null ? undefined : focusModeExpanded}
          >
            <div className="min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                Focus Mode
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500 sm:mt-1">
                {focusSummary}
              </p>
              <p className="mt-1 text-[10px] text-slate-600">
                Control how chat interprets your question
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
                ? "mt-3 block"
                : focusModeExpanded === false
                  ? "hidden"
                  : "mt-3 hidden sm:block"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="sm:min-w-[8rem]">
                <p className="text-[11px] text-slate-500">
                  Short follow-ups can inherit this topic when the prompt stays vague.
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
                  className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-white/20 hover:text-slate-300"
                >
                  Clear
                </button>
              </div>
            </div>
            {focusSuggestion && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
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

      <div className="sm:hidden">
        <button
          type="button"
          onClick={toggleMobileControls}
          className="flex w-full items-center justify-between gap-3 rounded-[0.95rem] border border-white/10 bg-white/[0.03] px-3 py-2 text-left outline-none transition-all hover:bg-white/[0.05]"
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
          <div className="mt-2 space-y-2 border-b border-white/8 pb-2">
            <div className="flex items-center rounded-full border border-white/10 bg-[#0b0b0b]/95 p-1 shadow-2xl backdrop-blur">
              <button
                onClick={() => switchNikiMode(false)}
                className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none ${
                  !isNikiMode ? "bg-white/10 text-white" : "text-slate-600 hover:text-white"
                }`}
              >
                Pure Logic
              </button>
              <button
                onClick={() => switchNikiMode(true)}
                className={`flex-1 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none ${
                  isNikiMode ? `bg-white/5 ${accentColor}` : "text-slate-600 hover:text-white"
                }`}
              >
                Nemanja Mode
              </button>
            </div>

            {isNikiMode && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setLectureMode((prev) => !prev);
                    setMobileControlsExpanded(false);
                  }}
                  className={`rounded-full border px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all outline-none ${
                    lectureMode
                      ? `${accentBorder} bg-white/[0.06] ${accentColor}`
                      : "border-white/10 bg-[#0b0b0b]/90 text-slate-600 hover:text-slate-300"
                  }`}
                >
                  {lectureMode ? "Teaching: ON" : "Teaching: OFF"}
                </button>
              </div>
            )}

            <div className={`${focusModeHeaderClass} rounded-2xl border-white/8 px-3 py-3`}>
              <div className="min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
                  Focus Mode
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{focusSummary}</p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Control how chat interprets your question
                </p>
              </div>

              <div className="mt-3 block">
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
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
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
