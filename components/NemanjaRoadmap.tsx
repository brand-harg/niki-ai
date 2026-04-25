"use client";

import { useEffect, useMemo, useState } from "react";
import { inferCourseFromMathTopic } from "@/lib/courseFilters";

type RoadmapCourse = {
  id: string;
  label: string;
  group: string;
  courseContext: string;
  topicLabel: string;
  topicPrompt: string;
  topicTokens: string[];
  lessonIntent: string;
  shortcut: string;
};

type RelatedLecture = {
  id: string;
  lecture_title: string;
  course: string;
  professor: string;
  video_url: string;
};

const ROADMAP_COURSES: RoadmapCourse[] = [
  {
    id: "elementary-algebra",
    label: "Elementary Algebra",
    group: "Foundations",
    courseContext: "Elementary Algebra",
    topicLabel: "Factoring and linear equations",
    topicPrompt: "factoring and solving linear equations",
    topicTokens: ["factoring", "equations", "linear"],
    lessonIntent: "Foundations for equations, factoring, and symbolic fluency.",
    shortcut: "Look for the simplest algebra move that keeps structure visible.",
  },
  {
    id: "precalc-1",
    label: "PreCalc 1",
    group: "Foundations",
    courseContext: "PreCalc1",
    topicLabel: "Functions and graphs",
    topicPrompt: "functions and graphs",
    topicTokens: ["functions", "graphs", "inverse"],
    lessonIntent: "Functions, graphs, and algebraic patterns that bridge into calculus.",
    shortcut: "Track how the function behaves before chasing computation.",
  },
  {
    id: "calc-1",
    label: "Calc 1",
    group: "Core Calculus",
    courseContext: "Calculus 1",
    topicLabel: "Limits and derivative rules",
    topicPrompt: "limits and derivative rules",
    topicTokens: ["limits", "derivative", "product", "chain"],
    lessonIntent: "Limits and derivatives as the first real change-modeling toolkit.",
    shortcut: "Name the derivative rule first, then simplify cleanly.",
  },
  {
    id: "calc-2",
    label: "Calc 2",
    group: "Core Calculus",
    courseContext: "Calculus 2",
    topicLabel: "Integration techniques and series",
    topicPrompt: "integration techniques and series",
    topicTokens: ["integration", "integral", "series", "parts", "usub"],
    lessonIntent: "Integration, accumulation, and infinite processes.",
    shortcut: "Choose the integration method before expanding the algebra.",
  },
  {
    id: "calc-3",
    label: "Calc 3",
    group: "Core Calculus",
    courseContext: "Calculus 3",
    topicLabel: "Vectors and partial derivatives",
    topicPrompt: "vectors and partial derivatives",
    topicTokens: ["vectors", "partial", "gradient", "double"],
    lessonIntent: "Multivariable geometry, vectors, and higher-dimensional calculus.",
    shortcut: "Keep track of coordinates and geometric meaning together.",
  },
  {
    id: "differential-equations",
    label: "Differential Equations",
    group: "Advanced / Applied",
    courseContext: "Differential Equations",
    topicLabel: "Linear first-order equations and systems",
    topicPrompt: "linear first-order equations and systems",
    topicTokens: ["linear", "first", "order", "systems", "laplace"],
    lessonIntent: "Modeling change with equations that describe entire systems.",
    shortcut: "Identify the equation type before committing to a method.",
  },
  {
    id: "statistics",
    label: "Statistics",
    group: "Advanced / Applied",
    courseContext: "Statistics",
    topicLabel: "Probability basics and conditional probability",
    topicPrompt: "probability basics and conditional probability",
    topicTokens: ["probability", "conditional", "confidence", "normal"],
    lessonIntent: "Reasoning with uncertainty, data, and inference.",
    shortcut: "State what the probability or statistic means before calculating it.",
  },
];

type NemanjaRoadmapProps = {
  className?: string;
  onOpenTopicInChat?: (payload: {
    course: string;
    topic: string;
    prompt: string;
  }) => void;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function countTokenHits(title: string, tokens: string[]) {
  const normalizedTitle = normalizeText(title);
  return tokens.reduce((count, token) => {
    return normalizedTitle.includes(token) ? count + 1 : count;
  }, 0);
}

function formatCourseCoverageLabel(course: string, courseCounts: Record<string, number>) {
  const count = courseCounts[course] ?? courseCounts[inferCourseFromMathTopic(course) ?? ""] ?? 0;
  return count > 0 ? `${count} lectures available` : "Coverage still building";
}

export default function NemanjaRoadmap({
  className = "",
  onOpenTopicInChat,
}: NemanjaRoadmapProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(ROADMAP_COURSES[0]?.id ?? "");
  const [relatedLectures, setRelatedLectures] = useState<RelatedLecture[]>([]);
  const [courseCounts, setCourseCounts] = useState<Record<string, number>>({});
  const [isLoadingLectures, setIsLoadingLectures] = useState(false);

  const selectedCourse = useMemo(
    () =>
      ROADMAP_COURSES.find((course) => course.id === selectedCourseId) ?? ROADMAP_COURSES[0] ?? null,
    [selectedCourseId]
  );

  const lectureInsights = useMemo(() => {
    if (!selectedCourse) return [];
    return relatedLectures.map((lecture) => {
      const tokenHits = countTokenHits(lecture.lecture_title, selectedCourse.topicTokens);
      const sameCourse =
        normalizeText(lecture.course) === normalizeText(selectedCourse.courseContext);
      const isStrongMatch = sameCourse && tokenHits >= 1;
      return {
        ...lecture,
        tokenHits,
        sameCourse,
        isStrongMatch,
      };
    });
  }, [relatedLectures, selectedCourse]);

  const directLectureMatches = useMemo(
    () => lectureInsights.filter((lecture) => lecture.isStrongMatch).slice(0, 3),
    [lectureInsights]
  );

  const visibleLectures = useMemo(() => {
    const fallbackLectures = lectureInsights.slice(0, 2);
    return directLectureMatches.length > 0 ? directLectureMatches : fallbackLectures;
  }, [directLectureMatches, lectureInsights]);

  const hasDirectLectureMatch = directLectureMatches.length > 0;

  const sameCourseLectureCount = useMemo(() => {
    if (!selectedCourse) return 0;
    return lectureInsights.filter((lecture) => lecture.sameCourse).length;
  }, [lectureInsights, selectedCourse]);

  const hasStableCoverage = useMemo(() => {
    if (!selectedCourse) return false;
    return (courseCounts[selectedCourse.courseContext] ?? 0) >= 20;
  }, [courseCounts, selectedCourse]);

  const isVerified = hasDirectLectureMatch || (hasStableCoverage && sameCourseLectureCount >= 1);
  const verificationLabel = hasDirectLectureMatch
    ? "Strong lecture match found for this node."
    : hasStableCoverage && sameCourseLectureCount >= 1
      ? "Stable course coverage with relevant lecture support."
      : "No verification badge for this topic yet.";
  const lectureContextLabel = hasDirectLectureMatch ? "Lecture Source Context" : "Related Lectures";
  const lectureContextCopy = hasDirectLectureMatch
    ? "Direct lecture matches for this study step."
    : "Related lectures you may find helpful. These are suggestions, not answer sources.";
  const nextStepPrompt = hasDirectLectureMatch
    ? `Help me study ${selectedCourse.topicLabel} in ${selectedCourse.label} using the lecture material.`
    : `Help me start learning ${selectedCourse.topicLabel} in ${selectedCourse.label}.`;
  const nextStepLabel = hasDirectLectureMatch ? "Open this topic in chat" : "Start learning this topic";
  const nextStepSupportCopy = hasDirectLectureMatch
    ? "Ask about this topic in chat."
    : "Ask a question about this topic.";

  useEffect(() => {
    let cancelled = false;

    const loadCourseCoverage = async () => {
      try {
        const response = await fetch("/api/knowledge-base/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          courseCounts?: Array<{ course: string; count: number }>;
        };
        if (cancelled) return;
        const nextCounts = Object.fromEntries(
          (payload.courseCounts ?? []).map((entry) => [entry.course, entry.count])
        );
        setCourseCounts(nextCounts);
      } catch {
        if (!cancelled) {
          setCourseCounts({});
        }
      }
    };

    void loadCourseCoverage();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRelatedLectures = async () => {
      if (!selectedCourse) return;

      setIsLoadingLectures(true);
      try {
        const response = await fetch("/api/lectures/related", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: selectedCourse.topicPrompt,
            focusCourse: selectedCourse.courseContext,
            activeCourse: selectedCourse.courseContext,
            maxResults: 4,
          }),
        });

        if (!response.ok) {
          if (!cancelled) setRelatedLectures([]);
          return;
        }

        const payload = (await response.json()) as { lectures?: RelatedLecture[] };
        if (!cancelled) {
          setRelatedLectures(Array.isArray(payload.lectures) ? payload.lectures : []);
        }
      } catch {
        if (!cancelled) {
          setRelatedLectures([]);
        }
      } finally {
        if (!cancelled) setIsLoadingLectures(false);
      }
    };

    void loadRelatedLectures();
    return () => {
      cancelled = true;
    };
  }, [selectedCourse]);

  if (!selectedCourse) return null;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className}`.trim()}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
            Nemanja Roadmap
          </p>
          <div className="mt-3 space-y-2">
            {ROADMAP_COURSES.map((course, index) => {
              const isActive = course.id === selectedCourse.id;
              const previousCourse = ROADMAP_COURSES[index - 1];
              const showGroupLabel = !previousCourse || previousCourse.group !== course.group;
              return (
                <div key={course.id}>
                  {showGroupLabel && (
                    <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                      {course.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      isActive
                        ? "border-cyan-500/20 bg-cyan-500/8 text-white"
                        : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                    style={{ paddingLeft: `${0.9 + index * 0.14}rem` }}
                  >
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                      {index === 0 ? "•" : "→"}
                    </span>
                    <div className="min-w-0">
                      <span className="block text-sm font-bold">{course.label}</span>
                      <span className="block text-[10px] text-slate-500">{course.topicLabel}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {formatCourseCoverageLabel(course.courseContext, courseCounts)}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
            Course Detail
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-white">{selectedCourse.label}</h3>
            {isVerified && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
                Verified by NikiAI
              </span>
            )}
          </div>

          <div className="mt-3 space-y-2.5 text-sm text-slate-300">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Topic Focus
              </p>
              <p className="mt-0.5 leading-6 text-slate-300">{selectedCourse.topicLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Lesson Intent
              </p>
              <p className="mt-0.5 leading-6">{selectedCourse.lessonIntent}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Shortcut
              </p>
              <p className="mt-0.5 leading-6">{selectedCourse.shortcut}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {lectureContextLabel}
              </p>
              {isLoadingLectures ? (
                <p className="mt-0.5 leading-6 text-slate-400">Finding related lectures...</p>
              ) : visibleLectures.length > 0 ? (
                <div className="mt-1.5 space-y-2">
                  <p className="text-[11px] leading-5 text-slate-400">{lectureContextCopy}</p>
                  {visibleLectures.map((lecture) => (
                    <a
                      key={lecture.id}
                      href={lecture.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition hover:border-white/20 hover:bg-white/[0.05]"
                    >
                      <p className="text-sm font-bold text-slate-100">{lecture.lecture_title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        {lecture.course}
                        {lecture.professor ? ` · ${lecture.professor}` : ""}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 leading-6 text-slate-400">
                  No lecture coverage found yet for this topic.
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Verification Status
              </p>
              <p className="mt-0.5 leading-6 text-slate-400">{verificationLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Next Step
              </p>
              <p className="mt-0.5 leading-6 text-slate-400">{nextStepSupportCopy}</p>
              <button
                type="button"
                onClick={() =>
                  onOpenTopicInChat?.({
                    course: selectedCourse.courseContext,
                    topic: selectedCourse.topicLabel,
                    prompt: nextStepPrompt,
                  })
                }
                className="mt-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/14 hover:text-cyan-200"
              >
                {nextStepLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
