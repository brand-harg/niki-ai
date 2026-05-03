"use client";

import type { Dispatch, SetStateAction } from "react";
import FocusModePanel from "@/components/focus/FocusModePanel";

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
                      Use lecture sources when available and teach more like a tutor.
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
                    {lectureMode ? "On" : "Off"}
                  </button>
                </div>
              )}

              <FocusModePanel
                variant="desktop"
                chatFocus={chatFocus}
                focusSummary={focusSummary}
                focusSuggestion={focusSuggestion}
                focusCourseLabel={focusCourseLabel}
                accentColor={accentColor}
                accentBorder={accentBorder}
                knowledgeBaseCourses={knowledgeBaseCourses}
                onCourseChange={(course) => setChatFocus((prev) => ({ ...prev, course }))}
                onTopicChange={(topic) => setChatFocus((prev) => ({ ...prev, topic }))}
                onClearTopic={() => setChatFocus((prev) => ({ ...prev, topic: "" }))}
                onApplySuggestion={() =>
                  setChatFocus((prev) => ({
                    ...prev,
                    topic: focusSuggestion ?? prev.topic,
                  }))
                }
              />
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
                    Use lecture sources when available and teach more like a tutor.
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
                  {lectureMode ? "On" : "Off"}
                </button>
              </div>
            )}

            <FocusModePanel
              variant="mobile"
              chatFocus={chatFocus}
              focusSummary={focusSummary}
              focusSuggestion={focusSuggestion}
              focusCourseLabel={focusCourseLabel}
              accentColor={accentColor}
              accentBorder={accentBorder}
              focusModeHeaderClass={focusModeHeaderClass}
              knowledgeBaseCourses={knowledgeBaseCourses}
              onCourseChange={(course) => {
                setChatFocus((prev) => ({ ...prev, course }));
                setMobileControlsExpanded(false);
              }}
              onTopicChange={(topic) => setChatFocus((prev) => ({ ...prev, topic }))}
              onClearTopic={() => {
                setChatFocus((prev) => ({ ...prev, topic: "" }));
                setMobileControlsExpanded(false);
              }}
              onApplySuggestion={() => {
                setChatFocus((prev) => ({
                  ...prev,
                  topic: focusSuggestion ?? prev.topic,
                }));
                setMobileControlsExpanded(false);
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
