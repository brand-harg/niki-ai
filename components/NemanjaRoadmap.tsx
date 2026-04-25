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
  topics: RoadmapTopic[];
};

type RoadmapTopic = {
  id: string;
  label: string;
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
    topics: [
      {
        id: "elementary-algebra-linear-equations",
        label: "Linear equations",
        topicPrompt: "solving linear equations",
        topicTokens: ["linear", "equations", "solve"],
        lessonIntent: "Build fluency with balancing equations and isolating variables cleanly.",
        shortcut: "Undo operations in reverse order and keep both sides balanced.",
      },
      {
        id: "elementary-algebra-factoring",
        label: "Factoring basics",
        topicPrompt: "factoring expressions and trinomials",
        topicTokens: ["factoring", "trinomial", "gcf"],
        lessonIntent: "Learn to break expressions into simpler pieces you can reuse later.",
        shortcut: "Pull out the greatest common factor before trying anything fancy.",
      },
      {
        id: "elementary-algebra-inequalities",
        label: "Inequalities",
        topicPrompt: "solving inequalities",
        topicTokens: ["inequalities", "solve", "interval"],
        lessonIntent: "Track solution sets carefully and describe them with intervals when helpful.",
        shortcut: "If you multiply or divide by a negative, flip the inequality sign.",
      },
    ],
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
    topics: [
      {
        id: "precalc-1-functions",
        label: "Functions",
        topicPrompt: "function notation and evaluating functions",
        topicTokens: ["functions", "notation", "evaluate"],
        lessonIntent: "Treat functions like input-output machines and build comfort reading notation.",
        shortcut: "Plug the input in carefully before simplifying.",
      },
      {
        id: "precalc-1-graphs",
        label: "Graphs and transformations",
        topicPrompt: "graphs and transformations",
        topicTokens: ["graphs", "transformations", "shift"],
        lessonIntent: "See how algebra changes the picture of a graph.",
        shortcut: "Start from the parent graph, then track shifts, flips, and stretches one at a time.",
      },
      {
        id: "precalc-1-inverse",
        label: "Inverse functions",
        topicPrompt: "inverse functions",
        topicTokens: ["inverse", "functions", "one to one"],
        lessonIntent: "Understand when a function can be reversed and what that means graphically.",
        shortcut: "Swap x and y, then solve for y.",
      },
      {
        id: "precalc-1-exponentials",
        label: "Exponential and logarithmic models",
        topicPrompt: "exponential and logarithmic functions",
        topicTokens: ["exponential", "logarithmic", "logs"],
        lessonIntent: "Connect growth, decay, and inverse relationships before calculus starts.",
        shortcut: "Exponentials grow by repeated multiplication; logs undo that growth.",
      },
    ],
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
    topics: [
      {
        id: "calc-1-limits",
        label: "Limits",
        topicPrompt: "limits and continuity",
        topicTokens: ["limits", "continuity", "approaches"],
        lessonIntent: "Use limits to describe what a function is doing near a point.",
        shortcut: "Check direct substitution first before reaching for algebra tricks.",
      },
      {
        id: "calc-1-derivative-rules",
        label: "Derivative rules",
        topicPrompt: "derivative rules",
        topicTokens: ["derivative", "power", "rules"],
        lessonIntent: "Build a reliable set of rules for differentiating standard functions.",
        shortcut: "Call the rule before you use it.",
      },
      {
        id: "calc-1-product-chain",
        label: "Product and chain rule",
        topicPrompt: "product rule and chain rule",
        topicTokens: ["product", "chain", "rule"],
        lessonIntent: "Handle multiplied or nested functions without losing structure.",
        shortcut: "Split the function into pieces before differentiating.",
      },
      {
        id: "calc-1-applications",
        label: "Applications of derivatives",
        topicPrompt: "applications of derivatives",
        topicTokens: ["applications", "optimization", "tangent"],
        lessonIntent: "Turn derivative skills into slope, tangent, and optimization reasoning.",
        shortcut: "Translate the word problem into a function before optimizing it.",
      },
    ],
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
    topics: [
      {
        id: "calc-2-integration-techniques",
        label: "Integration techniques",
        topicPrompt: "integration techniques",
        topicTokens: ["integration", "techniques", "usub"],
        lessonIntent: "Recognize the structure of an integral before choosing a method.",
        shortcut: "Match the integrand to the method instead of forcing expansion.",
      },
      {
        id: "calc-2-parts",
        label: "Integration by parts",
        topicPrompt: "integration by parts",
        topicTokens: ["integration", "parts", "by parts"],
        lessonIntent: "Break harder products into a cleaner second integral.",
        shortcut: "Choose u to simplify when you differentiate it.",
      },
      {
        id: "calc-2-partial-fractions",
        label: "Partial fractions",
        topicPrompt: "partial fractions",
        topicTokens: ["partial", "fractions", "decomposition"],
        lessonIntent: "Rewrite rational functions into simpler pieces you can integrate.",
        shortcut: "Factor the denominator completely before decomposing.",
      },
      {
        id: "calc-2-improper-integrals",
        label: "Improper integrals",
        topicPrompt: "improper integrals",
        topicTokens: ["improper", "integrals", "infinite"],
        lessonIntent: "Handle infinite bounds and discontinuities by rewriting them as limits.",
        shortcut: "The limit is part of the problem, not an afterthought.",
      },
      {
        id: "calc-2-series",
        label: "Series",
        topicPrompt: "series and convergence tests",
        topicTokens: ["series", "convergence", "test"],
        lessonIntent: "Decide whether an infinite sum behaves or blows up.",
        shortcut: "Identify the series type before picking a convergence test.",
      },
    ],
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
    topics: [
      {
        id: "calc-3-vectors",
        label: "Vectors",
        topicPrompt: "vectors and vector operations",
        topicTokens: ["vectors", "dot", "cross"],
        lessonIntent: "Build geometric intuition for direction, magnitude, and vector operations.",
        shortcut: "Interpret the vector geometrically before computing.",
      },
      {
        id: "calc-3-partials",
        label: "Partial derivatives",
        topicPrompt: "partial derivatives",
        topicTokens: ["partial", "derivatives", "multivariable"],
        lessonIntent: "Differentiate one variable at a time while freezing the others.",
        shortcut: "Treat the other variables like constants.",
      },
      {
        id: "calc-3-gradient",
        label: "Gradient and tangent planes",
        topicPrompt: "gradient and tangent planes",
        topicTokens: ["gradient", "tangent", "plane"],
        lessonIntent: "Connect derivatives to direction, slope, and linear approximation in 3D.",
        shortcut: "The gradient points in the direction of fastest increase.",
      },
      {
        id: "calc-3-multiple-integrals",
        label: "Multiple integrals",
        topicPrompt: "double and triple integrals",
        topicTokens: ["double", "triple", "integrals"],
        lessonIntent: "Accumulate quantities over regions instead of just intervals.",
        shortcut: "Sketch the region first so the bounds make sense.",
      },
    ],
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
    topics: [
      {
        id: "diffeq-first-order",
        label: "First-order linear equations",
        topicPrompt: "first-order linear differential equations",
        topicTokens: ["first", "order", "linear"],
        lessonIntent: "Recognize standard linear form and solve with the right setup.",
        shortcut: "Put it in standard form before hunting for the integrating factor.",
      },
      {
        id: "diffeq-separable",
        label: "Separable equations",
        topicPrompt: "separable differential equations",
        topicTokens: ["separable", "differential", "equations"],
        lessonIntent: "Split variables cleanly so integration can do the heavy lifting.",
        shortcut: "Separate first, integrate second.",
      },
      {
        id: "diffeq-systems",
        label: "Systems of differential equations",
        topicPrompt: "systems of differential equations",
        topicTokens: ["systems", "eigenvalues", "matrix"],
        lessonIntent: "Track how multiple changing quantities interact at once.",
        shortcut: "Look for structure in the matrix before computing everything.",
      },
      {
        id: "diffeq-laplace",
        label: "Laplace transforms",
        topicPrompt: "Laplace transforms",
        topicTokens: ["laplace", "transforms", "initial value"],
        lessonIntent: "Turn differential equations into algebra problems in the transform domain.",
        shortcut: "Keep the transform rules and initial conditions side by side.",
      },
    ],
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
    topics: [
      {
        id: "statistics-probability",
        label: "Probability basics",
        topicPrompt: "probability basics",
        topicTokens: ["probability", "sample", "events"],
        lessonIntent: "Translate situations into outcomes, events, and probabilities.",
        shortcut: "Define the event in words before plugging into a formula.",
      },
      {
        id: "statistics-conditional",
        label: "Conditional probability",
        topicPrompt: "conditional probability",
        topicTokens: ["conditional", "probability", "given"],
        lessonIntent: "Update probabilities when new information changes the sample space.",
        shortcut: "Read the condition after the bar as the new universe.",
      },
      {
        id: "statistics-normal",
        label: "Normal distributions",
        topicPrompt: "normal distributions and z scores",
        topicTokens: ["normal", "distribution", "z"],
        lessonIntent: "Standardize data and reason about values relative to the mean.",
        shortcut: "Z-scores tell you how many standard deviations away you are.",
      },
      {
        id: "statistics-confidence",
        label: "Confidence intervals",
        topicPrompt: "confidence intervals",
        topicTokens: ["confidence", "interval", "margin"],
        lessonIntent: "Estimate unknown quantities with a range and a confidence level.",
        shortcut: "Center ± margin of error is the clean mental model.",
      },
    ],
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
  const initialCourse = ROADMAP_COURSES[0] ?? null;
  const [selectedCourseId, setSelectedCourseId] = useState<string>(initialCourse?.id ?? "");
  const [selectedTopicId, setSelectedTopicId] = useState<string>(initialCourse?.topics[0]?.id ?? "");
  const [expandedCourseId, setExpandedCourseId] = useState<string>(initialCourse?.id ?? "");
  const [relatedLectures, setRelatedLectures] = useState<RelatedLecture[]>([]);
  const [courseCounts, setCourseCounts] = useState<Record<string, number>>({});
  const [isLoadingLectures, setIsLoadingLectures] = useState(false);

  const selectedCourse = useMemo(
    () =>
      ROADMAP_COURSES.find((course) => course.id === selectedCourseId) ?? ROADMAP_COURSES[0] ?? null,
    [selectedCourseId]
  );
  const selectedTopic = useMemo(
    () => selectedCourse?.topics.find((topic) => topic.id === selectedTopicId) ?? null,
    [selectedCourse, selectedTopicId]
  );
  const activeTopic = selectedTopic ?? {
    id: `${selectedCourse?.id ?? "course"}-overview`,
    label: selectedCourse?.topicLabel ?? "",
    topicPrompt: selectedCourse?.topicPrompt ?? "",
    topicTokens: selectedCourse?.topicTokens ?? [],
    lessonIntent: selectedCourse?.lessonIntent ?? "",
    shortcut: selectedCourse?.shortcut ?? "",
  };

  const lectureInsights = useMemo(() => {
    if (!selectedCourse) return [];
    return relatedLectures.map((lecture) => {
      const tokenHits = countTokenHits(lecture.lecture_title, activeTopic.topicTokens);
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
  }, [activeTopic.topicTokens, relatedLectures, selectedCourse]);

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
    ? `Help me study ${activeTopic.label} in ${selectedCourse.label} using the lecture material.`
    : `Help me start learning ${activeTopic.label} in ${selectedCourse.label}.`;
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
            question: activeTopic.topicPrompt,
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
  }, [activeTopic.topicPrompt, selectedCourse]);

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
              const isExpanded = course.id === expandedCourseId;
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
                    onClick={() => {
                      setExpandedCourseId((prev) => (prev === course.id ? "" : course.id));
                      setSelectedCourseId(course.id);
                      setSelectedTopicId("");
                    }}
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
                    <span className="ml-auto text-xs text-slate-500">
                      {isExpanded ? "−" : "+"}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="mt-1.5 space-y-1 pl-8">
                      {course.topics.map((topic) => {
                        const isTopicActive =
                          selectedCourse.id === course.id && selectedTopicId === topic.id;
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() => {
                              setSelectedCourseId(course.id);
                              setSelectedTopicId(topic.id);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                              isTopicActive
                                ? "border-cyan-500/20 bg-cyan-500/10 text-white"
                                : "border-white/8 bg-white/[0.015] text-slate-400 hover:border-white/15 hover:bg-white/[0.03] hover:text-slate-200"
                            }`}
                          >
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              •
                            </span>
                            <span className="min-w-0 truncate">{topic.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
            Topic Detail
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-white">{selectedCourse.label}</h3>
            <span className="text-sm font-semibold text-slate-400">{activeTopic.label}</span>
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
              <p className="mt-0.5 leading-6 text-slate-300">{activeTopic.label}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Lesson Intent
              </p>
              <p className="mt-0.5 leading-6">{activeTopic.lessonIntent}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Shortcut
              </p>
              <p className="mt-0.5 leading-6">{activeTopic.shortcut}</p>
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
                    topic: activeTopic.label,
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
