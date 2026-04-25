export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectCourseFilter, inferCourseFromMathTopic } from "@/lib/courseFilters";

type RelatedLecturesRequest = {
  question?: string;
  topicLabel?: string;
  focusCourse?: string;
  activeCourse?: string;
  maxResults?: number;
};

type LectureSourceRow = {
  id: string;
  lecture_title: string;
  course: string;
  professor: string;
  video_url: string;
};

const STOP_WORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "with",
  "from",
  "that",
  "this",
  "into",
  "does",
  "mean",
  "explain",
  "should",
  "would",
  "could",
  "about",
  "there",
  "their",
  "because",
  "using",
  "used",
  "make",
  "help",
  "happen",
  "plain",
  "language",
  "rule",
  "answer",
  "solve",
  "show",
  "find",
  "question",
]);

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCourseAlias(value?: string) {
  const normalized = value?.trim();
  if (!normalized) return "";
  return detectCourseFilter(normalized) ?? inferCourseFromMathTopic(normalized) ?? normalized;
}

function courseMatches(course?: string, preferredCourse?: string) {
  if (!course || !preferredCourse) return false;
  return normalizeCourseAlias(course) === normalizeCourseAlias(preferredCourse);
}

function extractTopicKeywords(question: string) {
  const normalized = normalizeText(question);
  const base = Array.from(
    new Set(
      normalized
        .split(" ")
        .filter((word) => word.length >= 3)
        .filter((word) => !STOP_WORDS.has(word))
    )
  );

  const aliases: string[] = [];
  if (/\bchain rule\b/i.test(question)) aliases.push("chain", "composite", "derivative");
  if (/\bproduct rule\b/i.test(question)) aliases.push("product", "derivative");
  if (/\bquotient rule\b/i.test(question)) aliases.push("quotient", "derivative");
  if (/\blimit\b/i.test(question)) aliases.push("limits");
  if (/\bderivative|differentiate\b/i.test(question)) aliases.push("derivative");
  if (/\bintegral|integrate\b/i.test(question)) aliases.push("integration", "integral");
  if (/\bu[-\s]?sub(?:stitution)?\b/i.test(question)) aliases.push("usub", "substitution");
  if (/\bintegration by parts\b/i.test(question)) aliases.push("parts", "integration");
  if (/\bprobability\b/i.test(question)) aliases.push("probability");
  if (/\bconditional probability\b/i.test(question)) aliases.push("conditional", "probability");
  if (/\bseries|sequence\b/i.test(question)) aliases.push("series");
  if (/\bvector|vectors\b/i.test(question)) aliases.push("vectors");

  return Array.from(new Set([...base, ...aliases])).slice(0, 10);
}

function scoreLecture(row: LectureSourceRow, keywords: string[], preferredCourse?: string) {
  const normalizedTitle = normalizeText(row.lecture_title ?? "");
  const normalizedCourse = normalizeText(row.course ?? "");
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;
    if (normalizedTitle.includes(keyword)) score += keyword.length > 5 ? 5 : 3;
    if (normalizedCourse.includes(keyword)) score += 2;
  }

  if (courseMatches(row.course, preferredCourse)) {
    score += 8;
  } else if (preferredCourse && normalizeText(preferredCourse) === normalizedCourse) {
    score += 6;
  }

  return score;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RelatedLecturesRequest;
    const question = body.question?.trim() ?? "";
    const topicLabel = body.topicLabel?.trim() ?? "";
    const requestContext = [question, topicLabel].filter(Boolean).join(" ").trim();
    if (!requestContext) {
      return NextResponse.json({ lectures: [] });
    }

    const preferredCourse =
      detectCourseFilter(requestContext, body.focusCourse || body.activeCourse) ??
      inferCourseFromMathTopic(requestContext, body.focusCourse || body.activeCourse) ??
      body.focusCourse ??
      body.activeCourse ??
      "";

    const maxResults = Math.min(Math.max(body.maxResults ?? 4, 2), 4);
    const { data, error } = await supabaseAdmin
      .from("lecture_sources")
      .select("id, lecture_title, course, professor, video_url");
      
    const limitedData = Array.isArray(data) ? data.slice(0, 240) : [];

    if (error || !limitedData.length) {
      return NextResponse.json({ lectures: [] });
    }

    const keywords = extractTopicKeywords(requestContext);
    const ranked = (limitedData as LectureSourceRow[])
      .map((row) => ({
        ...row,
        score: scoreLecture(row, keywords, preferredCourse),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.lecture_title.localeCompare(b.lecture_title))
      .slice(0, maxResults)
      .map((row) => {
        const { score, ...rest } = row;
        void score;
        return rest;
      });

    return NextResponse.json({ lectures: ranked });
  } catch {
    return NextResponse.json({ lectures: [] });
  }
}
