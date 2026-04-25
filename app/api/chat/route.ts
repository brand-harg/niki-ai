export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectCourseFilter, inferCourseFromMathTopic } from "@/lib/courseFilters";
import { normalizeModelMathOutput, sanitizeMathContent } from "@/lib/mathFormatting";
import {
  buildLectureContextSystemMessage,
  buildModeReminderSystemMessage,
  buildSystemPrompt,
  buildUserMessageContent,
  isPracticeRequest,
  type Difficulty,
} from "@/lib/chatPrompts";
import {
  buildCitationLectureReply,
  buildLectureRecoveryReply,
  buildLectureCountReply,
  buildLectureTopicPrompt,
  dedupeCitations,
  getLectureCourseCounts,
  getLecturesByCourse,
  isCalc1LectureListIntent,
  isLectureCountIntent,
  isLectureListIntent,
  isVideoLookupIntent,
  isUsableVideoUrl,
} from "@/lib/ragHelpers";
import {
  buildDeterministicMathReply,
  detectSimpleMathIntent,
  incompleteProceduralMathRequest,
  missingExpressionReply,
  polishDeterministicMathPresentation,
} from "@/lib/deterministicMath";

type ChatRequest = {
  message?: string;
  isNikiMode?: boolean;
  userName?: string;
  userId?: string;
  chatId?: string;
  trainConsent?: boolean;
  usageLogsConsent?: boolean;
  aboutUserContext?: string;
  responseStyleContext?: string;
  history?: { role: string; content: string }[];
  base64Image?: string;
  imageMediaType?: string;
  textFileContent?: string;
  textFileName?: string;
  pinnedSyllabusContent?: string;
  pinnedSyllabusName?: string;
  knowledgeCourseContext?: string;
  focusCourseContext?: string;
  focusTopicContext?: string;
  lectureMode?: boolean;
  difficulty?: Difficulty;
  practiceMode?: boolean;
  calendarContext?: string;

  ragContext?: string[];
  ragStyleSnippets?: { text: string; personaTag?: string }[];
  ragCitations?: {
    lectureTitle?: string;
    professor?: string;
    course?: string;
    timestampStartSeconds?: number;
    timestampUrl?: string | null;
    similarity?: number;
    excerpt?: string;
    sectionHint?: string;
  }[];
};

type InternalRagResponse = {
  context?: string[];
  styleSnippets?: { text: string; personaTag?: string }[];
  citations?: {
    lectureTitle?: string;
    professor?: string;
    course?: string;
    timestampStartSeconds?: number;
    timestampUrl?: string | null;
    similarity?: number;
    excerpt?: string;
    sectionHint?: string;
  }[];
};

const INTERNAL_RAG_TIMEOUT_MS = 12_000;

const UI_GREETING_TEXTS = new Set([
  "What do you need help with?",
  "What are we solving today?",
  "Send the math, code, or technical problem.",
  "What do you want to work through?",
  "Give me the problem and I’ll keep it clean.",
  "What needs fixing, proving, solving, or explaining?",
  "Do you need help with kalk?",
  "All right, what are we working on?",
  "Bring me the problem. We will make it behave.",
  "What do we need to figure out today?",
  "Kalk, algebra, stats, code. What is the situation?",
]);

function isUiGreeting(content?: string): boolean {
  return UI_GREETING_TEXTS.has(content?.trim() ?? "");
}

function maskBackendUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value.replace(/\/\/([^/@]+)@/, "//***@");
  }
}

function ollamaErrorReply(baseUrl: string, status?: number): string {
  const statusText = status ? ` Ollama returned HTTP ${status}.` : "";
  return [
    "System Error: Could not reach the local model backend.",
    statusText.trim(),
    `Configured backend: ${maskBackendUrl(baseUrl)}.`,
    "Open /api/ollama/health on this same deployed site to test connectivity.",
    "For Vercel, OLLAMA_API_URL must be your current public ngrok HTTPS URL, not localhost.",
    "Also confirm Ollama is running, the model is installed, and the ngrok tunnel points to port 11434.",
  ]
    .filter(Boolean)
    .join(" ");
}

function wantsStepByStep(message: string): boolean {
  return /(step[-\s]?by[-\s]?step|show every step|all steps|detailed steps|walk me through|show work)/i.test(
    message
  );
}

function wantsDeeperExplanation(message: string): boolean {
  return /(i do(n't| not) understand|explain more|how did you get|why|break it down|teach me|more detail|i('| a)?m lost)/i.test(
    message
  );
}

function isTeachFirstMathRequest(
  message: string,
  intent: ReturnType<typeof detectSimpleMathIntent>
): boolean {
  if (!intent) return false;
  return /\b(teach|explain|walk me through|help me understand)\b/i.test(message);
}

function buildTeachFirstMathSystemMessage(intent: NonNullable<ReturnType<typeof detectSimpleMathIntent>>): string {
  const methodLabel =
    intent === "derivative"
      ? "derivative method"
      : intent === "integral"
        ? "integration method"
        : intent === "limit"
          ? "limit method"
          : intent === "solve"
            ? "solving method"
            : `${intent} method`;

  return [
    "Teach-first math request:",
    `- The user asked to learn the ${methodLabel}, not just to submit a single expression.`,
    "- Do not ask for a custom input first.",
    "- First explain the concept, show the core formula or rule, and give one clean worked example.",
    "- Only after the explanation, invite the user to send their own problem if they want one solved next.",
  ].join("\n");
}

function wantsThoughtTrace(message: string): boolean {
  return /(thought trace|reasoning trace|show reasoning|show thought process)/i.test(message);
}

function isLectureSummaryRequest(message: string): boolean {
  return /(summarize the lecture|teach me the lecture|lecture me on|do a lecture on|lecture on|give me a lecture on|can we do a lecture|i missed the lecture|wasn'?t in class|what did the lecture cover|explain the lecture|don'?t understand|can't figure out|cannot figure out|help me understand)/i.test(
    message
  );
}

function isExplicitKnowledgeBaseRequest(message: string): boolean {
  return (
    /\b(source|sources|citation|citations|cite|cited|evidence|transcript|clip|clips|timestamp|timestamps|video|videos|watch|grounded|grounding|lecture connection)\b/i.test(
      message
    ) ||
    /where did (?:that|this) come from/i.test(message) ||
    /show (?:me )?(?:the )?(?:source|sources|citations|evidence)/i.test(message) ||
    /peek evidence/i.test(message) ||
    isLectureSummaryRequest(message) ||
    isLectureListIntent(message) ||
    isLectureCountIntent(message) ||
    isVideoLookupIntent(message)
  );
}

function hasSpecificUnsupportedLectureDomain(message: string): boolean {
  if (!/\blectures?\b/i.test(message)) return false;
  if (/(what|which|list|show|all|how many)\b[\s\S]{0,50}\blectures?\b/i.test(message)) {
    return false;
  }

  const remainingTerms = message
    .toLowerCase()
    .replace(/\blectures?\b/g, " ")
    .replace(/\b(calculus|calc|math|course|class|videos?|youtube|available|have|got)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return remainingTerms.length >= 2;
}

function buildBroadLectureTopicClarification(message: string): string | null {
  const topic = message.toLowerCase().replace(/[?.!,;:]+$/g, "").trim();
  const options: Record<string, string[]> = {
    integration: ["basic antiderivatives", "u-substitution", "integration by parts", "area/accumulation", "applications like disk, washer, or shell method"],
    integrals: ["basic antiderivatives", "u-substitution", "integration by parts", "definite integrals", "applications like area or volume"],
    derivative: ["definition as slope/change", "power/product/quotient rules", "chain rule", "implicit differentiation", "applications like related rates or optimization"],
    derivatives: ["definition as slope/change", "power/product/quotient rules", "chain rule", "implicit differentiation", "applications like related rates or optimization"],
    limits: ["intro limits", "algebraic techniques", "one-sided limits", "limits at infinity", "continuity"],
    series: ["infinite series basics", "comparison tests", "alternating series", "ratio/root tests", "power series or Taylor series"],
    vectors: ["vectors in 2D/3D", "dot product", "cross product", "lines and planes", "gradient or directional derivatives"],
  };

  const choices = options[topic];
  if (!choices) return null;

  return [
    `Which part of ${topic} do you want lecture help with?`,
    "",
    ...choices.map((choice) => `- ${choice}`),
    "",
    "Pick one and I will connect it to the matching lecture clips.",
  ].join("\n");
}

function isLikelyMathQuestion(message: string): boolean {
  return /(\barithmetic\b|\boperations?\b|\bfractions?\b|\bdecimals?\b|\bpercent(?:age)?s?\b|\bsales tax\b|\bdiscount\b|\bfinal price\b|\bvolume\b|\barea\b|\bradius\b|\bheight\b|\bcylinder\b|\broot\b|\broots\b|\bintegral\b|\bintegrate\b|\bantiderivative\b|\bderivative\b|\bdifferentiate\b|\bdy\/dx\b|\bd\/dx\b|\bsolve\b|\bevaluate\b|\bsimplify\b|\bisolate\b|\blimit\b|\bmatrix\b|\bmatrices\b|\bprobability\b|\bstatistic\b|\bmean\b|\bmedian\b|\bmode\b|\bvariance\b|\bstandard deviation\b|\bz[-\s]?score\b|\bp[-\s]?value\b|\bnormal distribution\b|\bbinomial\b|\btrig\b|\bsin\b|\bcos\b|\btan\b|\bsec\b|\bcsc\b|\bcot\b|\bidentity\b|\bproof\b|\bequation\b|\binequality\b|\bfunction\b|\bdomain\b|\brange\b|\basymptote\b|\bgraph\b|\bintercepts?\b|\bvertex\b|\bslope\b|\btangent\b|\bconcavity\b|\binflection\b|\bcritical point\b|\boptimization\b|\brelated rates\b|\bimplicit\b|\bvector\b|\bdot product\b|\bcross product\b|\bgradient\b|\bdeterminant\b|\beigen\b|\bdistribution\b|\bfactor\b|\bfactoring\b|\bpolynomial\b|\bsynthetic division\b|\blong division\b|\bcomplete the square\b|\bquadratic\b|\brational expression\b|\bexponent\b|\blogarithm\b|\bseries\b|\bsequence\b|\bsummation\b|\bsum\b|\bconverge\b|\bdiverge\b|\bratio test\b|\bcomparison test\b|\btaylor\b|\bmaclaurin\b|\bdifferential equation\b|\brow reduce\b|\brow reduction\b|\bgaussian elimination\b|\bscientific notation\b|\bcomplex\b|\ba\s*\+\s*bi\b|\bln\b|\blog\b|\bsqrt\b|\bpi\b|\bdo\s+\d*\s*[a-z]\b|\d+\s*[a-z]\b|[a-z]\^\d|[\dxy]\s*[\+\-\*\/\^]\s*[\dxy]|\\int|\\frac|\\sum|\\lim|\$)/i.test(
    message
  );
}

function isLongFormNonDeterministicRequest(message: string): boolean {
  const asksForLongForm =
    /\b(explain|compare|contrast|summarize|teach|walk me through|break down|why|how|write|draft|brainstorm|analyze|argue|evaluate|recommend|plan|outline)\b/i.test(
      message
    ) ||
    /\b(in detail|deep dive|long answer|essay|paragraphs?|thorough|comprehensive)\b/i.test(
      message
    );
  const asksForExactShort =
    /\b(just the answer|one sentence|briefly|quick answer|yes or no|true or false)\b/i.test(
      message
    );

  return asksForLongForm && !asksForExactShort && message.length >= 18;
}

function sanitizeHistoryForModel(content: string): string {
  return content
    .replace(/^Current response mode:[\s\S]*?\n\nUser request:\n/i, "")
    .replace(/\\boxed\s*\{([^}]*)\}/g, "$1")
    .replace(/\\\[/g, "$$$$")
    .replace(/\\\]/g, "$$$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\${3,}/g, "$$$$")
    .replace(/^\s*\$\$\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function buildMemoryBoundarySystemMessage(): string {
  return [
    "MEMORY BOUNDARY:",
    "- Conversation history is working memory only.",
    "- Use it to resolve intent, follow-ups, corrections, and current topic.",
    "- Do not cite, quote, summarize, or treat prior chat turns as external evidence unless the user explicitly asks to revisit earlier work.",
    "- Never present chat history as a lecture source, citation, or grounded fact.",
  ].join("\n");
}

function detectRecentCourseFromHistory(history: { role: string; content: string }[]): string | undefined {
  for (const item of [...history].reverse().slice(0, 8)) {
    if (isUiGreeting(item.content)) continue;
    const course = detectCourseFilter(item.content);
    if (course) return course;
  }
  return undefined;
}

function normalizeFocusTopic(value?: string): string | undefined {
  const topic = value?.trim();
  return topic ? topic : undefined;
}

function detectRecentMathIntentFromHistory(
  history: { role: string; content: string }[]
): ReturnType<typeof detectSimpleMathIntent> {
  for (const item of [...history].reverse().slice(0, 10)) {
    const content = item.content?.trim() ?? "";
    if (!content || isUiGreeting(content) || isInternalModeReminder(content)) continue;

    const directIntent = detectSimpleMathIntent(content);
    if (directIntent) return directIntent;

    if (/^#{0,3}\s*\*{0,2}Derivative\b/i.test(content)) return "derivative";
    if (/^#{0,3}\s*\*{0,2}Integral\b/i.test(content)) return "integral";
    if (/^#{0,3}\s*\*{0,2}Limit\b/i.test(content)) return "limit";
    if (/^#{0,3}\s*\*{0,2}Factoring\b/i.test(content)) return "factor";
    if (/^#{0,3}\s*\*{0,2}Simplifying\b/i.test(content)) return "simplify";
  }

  return null;
}

function extractBareMathFollowupExpression(message: string): string | null {
  const source = message
    .trim()
    .replace(/[?.!,;:]+$/g, "")
    .replace(/^please\s+/i, "")
    .replace(/^can\s+you\s+/i, "")
    .replace(/^could\s+you\s+/i, "")
    .replace(/^(?:do|try|use|run|work|solve|evaluate|calculate|compute)\s+(?:it|this|that)\s+(?:on|for|with)\s+/i, "")
    .replace(/^(?:do|try|use|run|work|solve|evaluate|calculate|compute)\s+(?:the\s+)?/i, "")
    .trim();

  if (!source || source.length > 90) return null;
  if (/\b(lecture|lectures|explain|teach|why|how|what|where|when|who|list|show me all)\b/i.test(source)) {
    return null;
  }
  if (detectSimpleMathIntent(source)) return null;

  const hasMathClue =
    /\\[a-z]+|\b(?:ln|log|sqrt|sin|cos|tan|sec|csc|cot|pi|theta)\b/i.test(source) ||
    /^(?:ln|log|sqrt|sin|cos|tan|sec|csc|cot)\s*\(?[-+0-9a-z^*/.]+\)?$/i.test(source) ||
    /[0-9xyzt]\s*[\^+\-*/=()]/i.test(source) ||
    /[\^+\-*/=()]\s*[0-9xyzt]/i.test(source) ||
    /^[a-z]\d*[a-z]?$/i.test(source) ||
    /^\d+[a-z](?:\^\d+)?$/i.test(source);

  return hasMathClue ? source : null;
}

type CourseSectionLookup = {
  course: string;
  section: string;
};

type CourseTopicShorthand = {
  course: string;
  topic: string;
};

const COURSE_ALIAS_PATTERN =
  String.raw`(?:pre\s*calc(?:\s*1)?|precalc(?:\s*1)?|precalculus(?:\s*1)?|calc\s*[123]|calculus\s*(?:[123]|i{1,3})|diff(?:erential)?\s*eq(?:uations?)?|stats?|statistics|elem(?:entary)?\s*alg(?:ebra)?|elementary\s*algebra)`;

function detectCourseSectionLookup(message: string): CourseSectionLookup | null {
  const match = message.match(
    new RegExp(
      String.raw`\b(${COURSE_ALIAS_PATTERN})\s+(?:section\s+|sec\s+|chapter\s+|ch\s+|lecture\s+)?(\d{1,2}\.\d{1,2})\b`,
      "i"
    )
  );

  const course = match?.[1] ? detectCourseFilter(match[1]) : undefined;
  const section = match?.[2];
  return course && section ? { course, section } : null;
}

function isBareCourseOnlyMessage(message: string, course?: string): boolean {
  if (!course) return false;
  const compact = message
    .toLowerCase()
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\bpre\s*calc(?:\s*1)?\b|\bprecalc(?:\s*1)?\b|\bprecalculus(?:\s*1)?\b/g, "")
    .replace(/\bcalc\s*[123]\b|\bcalculus\s*(?:[123]|i{1,3})\b/g, "")
    .replace(/\bdiff(?:erential)?\s*eq(?:uations?)?\b/g, "")
    .replace(/\bstats?\b|\bstatistics\b/g, "")
    .replace(/\belem(?:entary)?\s*alg(?:ebra)?\b|\belementary\s*algebra\b/g, "")
    .trim();
  return compact.length === 0;
}

function normalizeCourseTopic(topic: string): string {
  return topic
    .replace(/\bibp\b/gi, "integration by parts")
    .replace(/\bast\b/gi, "alternating series test")
    .replace(/\busub\b|\bu-sub\b/gi, "u substitution")
    .replace(/\bsep(?:arable)?\b/gi, "separable equations")
    .replace(/\blin(?:ear)?\s+eq(?:uations?)?\b/gi, "linear equations")
    .replace(/\s+/g, " ")
    .trim();
}

const SEARCH_TOPIC_STOPWORDS = new Set([
  "lecture",
  "lectures",
  "class",
  "course",
  "section",
  "chapter",
  "intro",
  "introduction",
  "more",
  "part",
  "parts",
  "calc",
  "calculus",
  "precalc",
  "precalculus",
  "diffeq",
  "diff",
  "equations",
  "equation",
  "elementary",
  "algebra",
  "statistics",
  "stats",
  "functions",
]);

function topicSearchTokens(value: string): string[] {
  return Array.from(
    new Set(
      normalizeCourseTopic(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => token.length >= 3)
        .filter((token) => !SEARCH_TOPIC_STOPWORDS.has(token))
    )
  );
}

function titleScoreForTopic(title: string | null | undefined, topic: string): number {
  const normalizedTitle = normalizeCourseTopic(title ?? "").toLowerCase();
  let score = textScoreForTopic(normalizedTitle, topic);
  if (score > 0 && /\b\d+\.\d+\b/.test(normalizedTitle)) score += 6;
  return score;
}

function textScoreForTopic(text: string | null | undefined, topic: string): number {
  const normalizedTitle = normalizeCourseTopic(text ?? "").toLowerCase();
  const normalizedTopic = normalizeCourseTopic(topic).toLowerCase();
  const tokens = topicSearchTokens(topic);

  let score = 0;
  if (!normalizedTitle) return score;

  if (normalizedTopic && normalizedTitle.includes(normalizedTopic)) score += 120;
  if (normalizedTopic && normalizedTitle.replace(/\s+/g, "").includes(normalizedTopic.replace(/\s+/g, ""))) score += 30;

  const tokenHits = tokens.filter((token) => new RegExp(String.raw`\b${token}\b`, "i").test(normalizedTitle));
  score += tokenHits.length * 24;

  if (tokens.length > 1 && tokenHits.length === tokens.length) score += 40;
  return score;
}

function dedupeLectureSearchRows<T extends {
  lectureTitle?: string;
  course?: string;
  professor?: string;
  watchUrl?: string | null;
  score: number;
  topicEvidence: number;
}>(rows: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const key = [
      row.lectureTitle ?? "",
      row.course ?? "",
      row.professor ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function buildCourseTopicClarification(lookup: CourseTopicShorthand): string | null {
  const topic = lookup.topic.toLowerCase();
  const options: Record<string, string[]> = {
    functions: ["function notation", "graphs and transformations", "domain and range", "inverse functions"],
    equations: ["linear equations", "systems of equations", "quadratic equations", "factoring methods"],
    series: ["alternating series", "ratio test", "comparison tests", "power series"],
  };

  const matchedKey = Object.keys(options).find((key) => new RegExp(String.raw`\b${key}\b`, "i").test(topic));
  if (!matchedKey) return null;

  return [
    `Which part of ${lookup.course} ${lookup.topic} do you want?`,
    "",
    ...options[matchedKey].map((option) => `- ${option}`),
  ].join("\n");
}

function detectCourseTopicShorthand(message: string): CourseTopicShorthand | null {
  const compact = message.trim().replace(/[?.!,;:]+$/g, "");
  if (compact.length > 90 || /\b(?:what|which|list|show|all|how many)\b/i.test(compact)) {
    return null;
  }
  if (detectCourseSectionLookup(compact)) return null;

  const match = compact.match(new RegExp(String.raw`\b(${COURSE_ALIAS_PATTERN})\b\s*(.*)$`, "i"));
  const course = match?.[1] ? detectCourseFilter(match[1]) : undefined;
  const topic = normalizeCourseTopic(match?.[2] ?? "");
  if (!course || !topic || topic.length < 2) return null;

  return { course, topic };
}

async function buildCourseTopicSearchReply(input: {
  lookup: CourseTopicShorthand;
  citations: {
    lectureTitle?: string;
    professor?: string;
    course?: string;
    timestampStartSeconds?: number;
    timestampUrl?: string | null;
    similarity?: number;
    excerpt?: string;
    sectionHint?: string;
  }[];
}): Promise<string | null> {
  const lectures = await getLecturesByCourse(input.lookup.course);
  const titleMatches = dedupeLectureSearchRows(
    lectures
      .map((lecture) => ({
        lectureTitle: lecture.lecture_title ?? "Unknown lecture",
        course: lecture.course ?? input.lookup.course,
        professor: lecture.professor ?? "Unknown professor",
        watchUrl: isUsableVideoUrl(lecture.video_url) ? lecture.video_url : null,
        score: titleScoreForTopic(lecture.lecture_title, input.lookup.topic),
        topicEvidence: titleScoreForTopic(lecture.lecture_title, input.lookup.topic),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
  );

  const citationMatches = dedupeLectureSearchRows(
    input.citations
      .map((citation) => ({
        lectureTitle: citation.lectureTitle ?? "Unknown lecture",
        course: citation.course ?? input.lookup.course,
        professor: citation.professor ?? "Unknown professor",
        watchUrl: isUsableVideoUrl(citation.timestampUrl) ? citation.timestampUrl : null,
        topicEvidence: textScoreForTopic(
          [citation.lectureTitle ?? "", citation.excerpt ?? "", citation.sectionHint ?? ""].join(" "),
          input.lookup.topic
        ),
        score:
          Math.round((citation.similarity ?? 0) * 100) +
          textScoreForTopic(
            [citation.lectureTitle ?? "", citation.excerpt ?? "", citation.sectionHint ?? ""].join(" "),
            input.lookup.topic
          ),
      }))
      .filter((row) => row.score >= 70)
      .sort((a, b) => b.score - a.score)
  );

  const candidates = dedupeLectureSearchRows([...titleMatches, ...citationMatches])
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (candidates.length === 0) {
    return buildCourseTopicClarification(input.lookup);
  }

  const [best, second] = candidates;
  const confidentBest =
    best.topicEvidence >= 80 &&
    (
      best.score >= 120 ||
      (best.score >= 95 && (!second || best.score - second.score >= 18)) ||
      (best.score >= 72 && (!second || best.score - second.score >= 24))
    );

  if (confidentBest) {
    return [
      `Best match for ${input.lookup.course} ${input.lookup.topic}:`,
      "",
      `1. ${best.lectureTitle}`,
      `${best.course} · ${best.professor}`,
      best.watchUrl ? `Watch: ${best.watchUrl}` : "Watch: link unavailable",
    ].join("\n");
  }

  const narrowed = candidates.slice(0, 3);
  return [
    `I found a few likely ${input.lookup.course} matches for ${input.lookup.topic}. Which one do you want?`,
    "",
    ...narrowed.map((match, index) => {
      const watch = match.watchUrl ? `\nWatch: ${match.watchUrl}` : "";
      return `${index + 1}. ${match.lectureTitle}\n${match.course} · ${match.professor}${watch}`;
    }),
  ].join("\n\n");
}

function sectionTitleMatches(title: string | null | undefined, section: string): boolean {
  const [whole, part] = section.split(".");
  if (!whole || !part) return false;
  return new RegExp(String.raw`(^|[^0-9])${whole}\s*\.\s*${part}([^0-9]|$)`).test(title ?? "");
}

async function buildCourseSectionLookupReply(lookup: CourseSectionLookup): Promise<string> {
  const lectures = await getLecturesByCourse(lookup.course);
  const matches = lectures.filter((lecture) => sectionTitleMatches(lecture.lecture_title, lookup.section));

  if (matches.length === 1) {
    const lecture = matches[0];
    const watch = isUsableVideoUrl(lecture.video_url) ? lecture.video_url : "link unavailable";
    return [
      `I found the likely ${lookup.course} section ${lookup.section} lecture.`,
      "",
      `1. ${lecture.lecture_title ?? "Unknown lecture"}`,
      `${lecture.course ?? lookup.course} · ${lecture.professor ?? "Unknown professor"}`,
      `Watch: ${watch}`,
    ].join("\n");
  }

  if (matches.length > 1) {
    return [
      `I found a few possible ${lookup.course} section ${lookup.section} matches. Which one do you want?`,
      "",
      ...matches.slice(0, 4).map((lecture, index) => {
        const watch = isUsableVideoUrl(lecture.video_url) ? `\nWatch: ${lecture.video_url}` : "";
        return `${index + 1}. ${lecture.lecture_title ?? "Unknown lecture"}\n${lecture.course ?? lookup.course} · ${lecture.professor ?? "Unknown professor"}${watch}`;
      }),
    ].join("\n\n");
  }

  return [
    `I recognize ${lookup.course} section ${lookup.section}, but I do not have a reliable exact lecture match for that section.`,
    "",
    `Send the section topic, or ask for a nearby ${lookup.course} section, and I will narrow it instead of dumping the whole lecture list.`,
  ].join("\n");
}

function buildMathIntentClarification(message: string): string | null {
  const compact = message.trim().replace(/[?.!,;:]+$/g, "");
  if (!compact || compact.length > 120) return null;
  if (detectSimpleMathIntent(compact) || detectCourseFilter(compact) || detectCourseSectionLookup(compact)) {
    return null;
  }
  if (/\b(lecture|lectures|study|quiz|test|exam|notes|explain|why|how|what|when|where|who)\b/i.test(compact)) {
    return null;
  }

  const mathOnly = /^[0-9a-zA-Z\s+\-*/^=().,\\]+$/.test(compact);
  const hasMathShape =
    /\b(?:ln|log|sqrt|sin|cos|tan|sec|csc|cot|pi|theta)\b/i.test(compact) ||
    /[a-z]\s*\^\s*\d|\d\s*[a-z]|[a-z]\s*[+\-*/=]\s*[0-9a-z]|[0-9)]\s*[+\-*/=]\s*[a-z(]/i.test(compact) ||
    /[+\-*/^=()]/.test(compact);

  if (!mathOnly || !hasMathShape) return null;

  if (compact.includes("=")) {
    return `Do you want to solve, graph, simplify, or rearrange ${compact}?`;
  }

  return `Do you want to solve, factor, simplify, or graph ${compact}?`;
}

function isShortAcademicFollowup(message: string): boolean {
  return /^(do another one|another one|explain that again|why\??|harder example|easier example|what about this(?: one)?\??|same thing|one more|show another|try another|another example|again)$/i.test(
    message.trim()
  );
}

function isStudyHelpIntent(message: string, calendarContext: string): boolean {
  return (
    /\b(help me study|study for|review for|practice for|quiz|test|exam|midterm|final|need notes|make notes|study guide|review sheet)\b/i.test(
      message
    ) ||
    (!!calendarContext && /\b(tomorrow|wednesday|thursday|friday|monday|tuesday|saturday|sunday|upcoming|soon)\b/i.test(message))
  );
}

function hasSpecificStudyTopic(message: string): boolean {
  const compact = message.trim();
  if (!compact) return false;
  if (detectCourseSectionLookup(compact) || detectCourseTopicShorthand(compact)) return true;
  if (isLikelyMathQuestion(compact)) return true;

  return /\b(chain rule|u-substitution|integration by parts|ibp|power series|alternating series|ast|limits?|derivatives?|integrals?|matrices?|eigenvalues?|row reduction|cross product|gradient|probability|normal distribution|z[-\s]?test|linked list|mitosis|dna|cell cycle)\b/i.test(
    compact
  );
}

function buildStudyHelpClarification(input: {
  message: string;
  detectedCourse?: string;
  studyIntent: boolean;
  focusTopic?: string;
}): string | null {
  const { message, detectedCourse, studyIntent, focusTopic } = input;
  if (!studyIntent || hasSpecificStudyTopic(message)) return null;

  const mentionsAssessment = /\b(quiz|test|exam|midterm|final)\b/i.test(message);
  if (detectedCourse) {
    if (focusTopic) {
      return `I can use your current focus on ${focusTopic} for ${detectedCourse}. If your quiz or test is on something else, tell me the exact chapter, section, or topic.`;
    }
    const assessment = mentionsAssessment ? "quiz or test" : "study block";
    return `What is your ${detectedCourse} ${assessment} on? Send the chapter, section, or topic and I will turn it into a focused study plan.`;
  }

  if (mentionsAssessment || /\bstudy\b/i.test(message)) {
    return "What course or topic is it on? Send the class, chapter, or concept and I will narrow the study help right away.";
  }

  return null;
}

function buildIntentResolutionSystemMessage(input: {
  mathInput: boolean;
  studyIntent: boolean;
  shortFollowup: boolean;
  courseSectionLookup: CourseSectionLookup | null;
  courseTopicShorthand: CourseTopicShorthand | null;
  focusCourse?: string;
  focusTopic?: string;
}): string {
  const lines = [
    "Intent resolution rules:",
    "- If the user's intent is strongly implied, act on it directly.",
    "- If only a few meanings are plausible, ask one targeted clarifying question with the likely options.",
    "- If the missing piece makes the request unsafe to answer, ask for that missing piece specifically.",
    "- Do not dump broad lecture lists or ask vague clarification questions when a narrower route is available.",
  ];

  if (input.mathInput) {
    lines.push("- For math inputs, resolve clear requests like factor, derivative, integrate, simplify, expand, solve, or limit directly. If the operation is unclear, ask a specific math clarification with the likely operations.");
  }

  if (input.shortFollowup) {
    lines.push("- This is a short follow-up. Use recent context and the previous math operation/topic when it is unambiguous.");
  }

  if (input.focusCourse || input.focusTopic) {
    lines.push("- Focus Mode is available as a fallback. Use it only when the user stays vague or is clearly continuing the current topic. Explicit user requests always override it.");
  }

  if (input.courseSectionLookup) {
    lines.push(
      `- The user likely means a ${input.courseSectionLookup.course} section lookup for ${input.courseSectionLookup.section}. Treat it as a course/section lookup first, not a broad lecture inventory.`
    );
  }

  if (input.studyIntent) {
    lines.push("- This is likely study-help intent. Offer concise study help. If the course is known but the exact unit/topic is missing, ask one targeted question about what the quiz, test, or study block covers instead of giving a broad survey.");
  }

  if (input.courseTopicShorthand) {
    lines.push(
      `- The user likely means a ${input.courseTopicShorthand.course} topic lookup for "${input.courseTopicShorthand.topic}". Prefer the most relevant result or a small narrowed set.`
    );
  }

  return lines.join("\n");
}

function buildShortFollowupContextSystemMessage(input: {
  history: { role: string; content: string }[];
  recentMathIntent: ReturnType<typeof detectSimpleMathIntent>;
  recentCourse?: string;
  focusCourse?: string;
  focusTopic?: string;
}): string {
  const recentEntries = [...input.history]
    .reverse()
    .filter((item) => {
      const content = item.content?.trim() ?? "";
      return !!content && !isUiGreeting(content) && !isInternalModeReminder(content);
    })
    .slice(0, 4)
    .reverse();

  const lastUser = [...recentEntries].reverse().find((item) => item.role === "user")?.content?.trim();
  const lastAssistant = [...recentEntries]
    .reverse()
    .find((item) => item.role === "assistant" || item.role === "ai")
    ?.content?.trim();

  const lines = [
    "Short follow-up context:",
    "- Treat this as a continuation of the recent conversation.",
    "- If the last topic is clear, stay on that topic and do not ask a vague clarification question.",
    "- For requests like 'do another one', 'harder example', or 'explain that again', reuse the same operation or concept unless the history is too weak.",
  ];

  if (input.recentMathIntent) {
    lines.push(`- Most recent math operation: ${input.recentMathIntent}.`);
  }

  if (input.recentCourse) {
    lines.push(`- Most recent course context: ${input.recentCourse}.`);
  }

  if (input.focusCourse) {
    lines.push(`- Focus Mode course fallback: ${input.focusCourse}.`);
  }

  if (input.focusTopic) {
    lines.push(`- Focus Mode topic fallback: ${input.focusTopic}.`);
  }

  if (lastUser) {
    lines.push(`- Previous user request: ${lastUser.slice(0, 220)}.`);
  }

  if (lastAssistant) {
    lines.push(`- Previous assistant response: ${lastAssistant.slice(0, 220)}.`);
  }

  return lines.join("\n");
}

function buildFocusModeSystemMessage(input: {
  focusCourse?: string;
  focusTopic?: string;
}): string {
  const focusParts = [input.focusCourse, input.focusTopic].filter(Boolean);
  if (!focusParts.length) return "";

  const summary = focusParts.join(" - ");
  const lines = [
    "Focus Mode guidance:",
    `- The current focus is ${summary}.`,
    "- Treat this as the active study lane for examples, explanations, and follow-up framing when it fits the user's request.",
    "- If the user stays broad or vague, scope the response toward this focus instead of drifting into a different topic.",
    "- If the user asks for something outside this focus, do not refuse or block the answer. Answer briefly and then gently steer back to the active focus or invite them to switch focus.",
    "- When the user's request is on a different topic, explicitly name both the requested topic and the current focus so the steering is visible.",
    "- For off-focus teaching requests, keep the off-focus answer short and then reconnect to the active focus.",
    "- Keep the steering short and natural, not repetitive or defensive.",
  ];

  return lines.join("\n");
}

function detectFocusMismatch(message: string, focusTopic?: string): { requestedTopic: string; focusTopic: string } | null {
  const normalizedMessage = message.toLowerCase();
  const currentFocus = focusTopic?.trim() ?? "";
  if (!currentFocus) return null;
  const normalizedFocus = currentFocus.toLowerCase();

  const topicSignals = [
    { label: "derivatives", pattern: /\b(derivative|derivatives|differentiate|product rule|chain rule|quotient rule|power rule|implicit differentiation)\b/i },
    { label: "integrals", pattern: /\b(integral|integrals|integrate|antiderivative|u-sub|substitution|integration by parts|partial fractions)\b/i },
    { label: "limits", pattern: /\b(limit|limits|lim)\b/i },
    { label: "series", pattern: /\b(series|sequence|sequences|ratio test|alternating series|power series|taylor)\b/i },
    { label: "matrices", pattern: /\b(matrix|matrices|determinant|eigenvalue|row reduction)\b/i },
    { label: "statistics", pattern: /\b(statistics|stats|probability|z-score|distribution|mean|variance)\b/i },
  ];

  const requested = topicSignals.find((topic) => topic.pattern.test(normalizedMessage));
  if (!requested) return null;
  if (normalizedFocus.includes(requested.label) || requested.label.includes(normalizedFocus)) return null;

  return { requestedTopic: requested.label, focusTopic: currentFocus };
}

function buildFocusMismatchSystemMessage(input: { requestedTopic: string; focusTopic: string }): string {
  return [
    "Focus Mode mismatch:",
    `- The user is asking about ${input.requestedTopic}, but the active focus is ${input.focusTopic}.`,
    "- Do not refuse the answer.",
    "- In the first one or two sentences, explicitly mention both the requested topic and the active focus.",
    `- Give a short helpful answer to ${input.requestedTopic}, then reconnect the user to ${input.focusTopic} or invite them to switch focus.`,
    `- Use direct wording such as: "I can help with ${input.requestedTopic}, and your current focus is ${input.focusTopic}."`,
    "- Make the redirect explicit and visible before the ending, not just as a final throwaway sentence.",
    "- Keep the off-focus answer brief so the active focus still shapes the response.",
  ].join("\n");
}

type CorrectionIntent = {
  correctedCourse?: string;
  correctedMathIntent?: ReturnType<typeof detectSimpleMathIntent>;
  correctedTopic?: string;
  acknowledgement: string;
};

function detectCorrectionIntent(message: string): CorrectionIntent | null {
  const compact = message.trim().replace(/[?.!,;:]+$/g, "");
  if (!compact) return null;

  const prefixedCourseMatch = compact.match(
    /^(?:that'?s|that is|it'?s|it is|no do|do|switch to|actually|this is)\s+(.+)$/i
  );
  const explicitNegationMatch = compact.match(/^(?:this is|it'?s|it is)\s+(.+?)\s+not\s+(.+)$/i);
  const correctedCourse =
    detectCourseFilter(explicitNegationMatch?.[1] ?? "") ??
    detectCourseFilter(prefixedCourseMatch?.[1] ?? "");

  if (correctedCourse && /\b(that'?s|that is|it'?s|it is|no do|switch to|actually|this is)\b/i.test(compact)) {
    return {
      correctedCourse,
      acknowledgement: `Got it — switching to ${correctedCourse}.`,
    };
  }

  const correctionMathMatch = compact.match(
    /^(?:i meant|no do|actually do|do|make it|switch to)\s+(.+)$/i
  );
  const correctionMathSource = correctionMathMatch?.[1] ?? compact;
  const correctedMathIntent =
    detectSimpleMathIntent(correctionMathSource) ??
    (/^\s*integration\b/i.test(correctionMathSource)
      ? "integral"
      : /^\s*differentiation\b/i.test(correctionMathSource)
        ? "derivative"
        : /^\s*factoring\b/i.test(correctionMathSource)
          ? "factor"
          : /^\s*simplification\b/i.test(correctionMathSource)
            ? "simplify"
            : /^\s*expansion\b/i.test(correctionMathSource)
              ? "expand"
              : /^\s*solving\b/i.test(correctionMathSource)
                ? "solve"
                : /^\s*limits?\b/i.test(correctionMathSource)
                  ? "limit"
                  : null);
  if (
    correctedMathIntent &&
    /\b(i meant|no do|actually|switch to|wrong topic)\b/i.test(compact)
  ) {
    return {
      correctedMathIntent,
      correctedTopic: correctionMathMatch?.[1]?.trim(),
      acknowledgement: `Got it — switching to ${correctedMathIntent}.`,
    };
  }

  if (/^wrong topic$/i.test(compact)) {
    return {
      acknowledgement: "Got it — switching topics.",
    };
  }

  return null;
}

function dropLatestAssistantMessage(history: { role: string; content: string }[]): { role: string; content: string }[] {
  const copy = [...history];
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    const role = copy[index]?.role;
    if (role === "assistant" || role === "ai") {
      copy.splice(index, 1);
      break;
    }
  }
  return copy;
}

function getRecentSubstantiveUserMessage(history: { role: string; content: string }[]): string | null {
  for (const item of [...history].reverse()) {
    if (item.role !== "user") continue;
    const content = item.content?.trim() ?? "";
    if (!content || isUiGreeting(content) || isInternalModeReminder(content)) continue;
    return content;
  }
  return null;
}

function detectRecentStudyIntentFromHistory(history: { role: string; content: string }[]): boolean {
  return [...history].reverse().some((item) => {
    if (item.role !== "user") return false;
    const content = item.content?.trim() ?? "";
    return !!content && isStudyHelpIntent(content, "");
  });
}

function extractRecentMathExpressionFromHistory(
  history: { role: string; content: string }[]
): string | null {
  const recentUserMessage = getRecentSubstantiveUserMessage(history);
  if (!recentUserMessage) return null;

  const compact = recentUserMessage.replace(/[?.!,;:]+$/g, "").trim();
  const directPatterns = [
    /\b(?:derivative|differentiate|integral|integrate|antiderivative|factor(?:ize)?|expand|simplify|solve)\s+(?:of|for|on)?\s*(.+)$/i,
    /\b(?:find|compute|calculate|show|do)\s+(?:the\s+)?(?:derivative|integral|antiderivative|factored form|expanded form)\s+(?:of|for|on)\s+(.+)$/i,
    /\b(?:limit)\s+(?:of)?\s*(.+)$/i,
  ];

  for (const pattern of directPatterns) {
    const match = compact.match(pattern);
    const expression = match?.[1]?.trim();
    if (expression) return expression;
  }

  return extractBareMathFollowupExpression(compact);
}

function buildCorrectionSystemMessage(input: {
  correctionIntent: CorrectionIntent;
  recentUserMessage: string | null;
}): string {
  const lines = [
    "Correction handling rules:",
    "- The latest user message is a correction to your previous assumption, not a brand-new topic.",
    `- Briefly acknowledge the correction with exactly one short sentence: "${input.correctionIntent.acknowledgement}"`,
    "- Discard the previous wrong setup completely.",
    "- Answer fresh using the corrected course, topic, or operation.",
    "- Do not over-apologize and do not repeat the mistaken setup.",
  ];

  if (input.correctionIntent.correctedCourse) {
    lines.push(`- Corrected course: ${input.correctionIntent.correctedCourse}.`);
  }

  if (input.correctionIntent.correctedMathIntent) {
    lines.push(`- Corrected math operation: ${input.correctionIntent.correctedMathIntent}.`);
  }

  if (input.recentUserMessage) {
    lines.push(`- Most recent substantive user request before the correction: ${input.recentUserMessage.slice(0, 220)}.`);
  }

  return lines.join("\n");
}

function buildContextualMathMessage(intent: ReturnType<typeof detectSimpleMathIntent>, expression: string): string | null {
  if (!intent) return null;
  if (intent === "limit") return null;

  const prefix =
    intent === "derivative"
      ? "derivative of"
      : intent === "integral"
        ? "integral of"
        : intent === "factor"
          ? "factor"
          : intent === "expand"
            ? "expand"
            : intent === "simplify"
              ? "simplify"
              : intent === "solve"
                ? "solve"
                : null;

  return prefix ? `${prefix} ${expression}` : null;
}

function contextualLimitFollowupReply(expression: string): string {
  return [
    `I can evaluate a limit for ${expression}, but I need the approach value.`,
    "",
    `Send it like: limit of ${expression} as x approaches 0.`,
  ].join("\n");
}

function ambiguousMathFollowupReply(expression: string): string {
  return [
    `What do you want me to do with ${expression}?`,
    "",
    "I can differentiate it, integrate it, simplify it, factor it, solve it, or evaluate a limit if you give me the approach value.",
  ].join("\n");
}

function isInternalModeReminder(content?: string): boolean {
  return /^Current response mode:/i.test(content?.trim() ?? "");
}

function isCodingQuestion(message: string, textFileName?: string, textFileContent?: string): boolean {
  if (textFileName && /\.(ts|tsx|js|jsx|py|java|cpp|c|cs|go|rs|php|rb|swift|kt|sql|html|css|json|yaml|yml|md)$/i.test(textFileName)) {
    return true;
  }

  if (textFileContent && /(?:function|const|let|var|class|def |import |export |return |if\s*\(|for\s*\(|while\s*\(|SELECT |INSERT |UPDATE |CREATE TABLE)/.test(textFileContent)) {
    return true;
  }

  return /(\bcode\b|\bprogram\b|\bdebug\b|\berror\b|\btypescript\b|\bjavascript\b|\bpython\b|\bjava\b|\breact\b|\bnext\.js\b|\bsql\b|\balgorithm\b|\bfunction\b|\bclass\b|\bcomponent\b|\bapi\b|\broute\b|\bstack trace\b|\bcompiler\b|\bsyntax\b)/i.test(
    message
  );
}

function extractJsonObjects(input: string): {
  objects: string[];
  remainder: string;
} {
  const objects: string[] = [];

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let startIndex = -1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      if (depth === 0) startIndex = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        objects.push(input.slice(startIndex, i + 1));
        startIndex = -1;
      }
    }
  }

  if (depth > 0 && startIndex !== -1) {
    return { objects, remainder: input.slice(startIndex) };
  }

  return { objects, remainder: "" };
}

function normalizeBufferedModelOutput(content: string): string {
  return String(content || "")
    .replace(/^Current response mode:[^\n]*(?:\n|$)/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCalendarContext(content?: string): string {
  return String(content ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join("\n");
}

function buildCalendarContextSystemMessage(calendarContext: string): string {
  return [
    "Upcoming calendar events from the user's saved calendar:",
    calendarContext,
    "",
    "Calendar behavior rules:",
    "- Use this only when it is relevant to the current request.",
    "- If an event title includes test, exam, quiz, midterm, or final, naturally offer concise study help or prioritization.",
    "- Do not repeatedly mention calendar events and do not invent dates, courses, or assignments.",
  ].join("\n");
}

function normalizeCourseKey(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildKnowledgeBaseTransparencySystemMessage(input: {
  activeCourse?: string;
  requestedCourse?: string;
  mismatch: boolean;
  hasSources: boolean;
}): string {
  if (!input.activeCourse) return "";

  const lines = [
    "Knowledge Base transparency:",
    `- Active lecture set: ${input.activeCourse}.`,
  ];

  if (input.mismatch && input.requestedCourse) {
    lines.push(
      `- The current question appears to be about ${input.requestedCourse}, which does not match the active lecture set.`,
      "- Say that mismatch plainly in the answer.",
      `- Use direct wording such as: "Active lecture set: ${input.activeCourse}. This question looks like ${input.requestedCourse}, so the current lecture sources are low relevance unless the lecture set is switched."`,
      "- If any lecture sources are attached, frame them as low relevance rather than direct support for the question."
    );
  } else if (input.hasSources) {
    lines.push(
      "- If the retrieved lecture sources are weak, say they are low relevance instead of overstating the match."
    );
  } else {
    lines.push(
      "- If no grounded lecture source matches the question from the active lecture set, say that plainly and continue with a self-contained answer."
    );
  }

  lines.push(
    "- Never fabricate relevance, direct transcript support, or course alignment."
  );

  return lines.join("\n");
}

function buildKnowledgeBaseReplyPrefix(input: {
  activeCourse?: string;
  requestedCourse?: string;
  mismatch: boolean;
  hasSources: boolean;
}): string {
  if (!input.activeCourse) return "";

  if (input.mismatch && input.requestedCourse) {
    return `Knowledge Base: Active lecture set is ${input.activeCourse}. This question looks like ${input.requestedCourse}, so any attached lecture sources from the current set are low relevance unless you switch the lecture set.`;
  }

  if (!input.hasSources) {
    return `Knowledge Base: Active lecture set is ${input.activeCourse}. No grounded lecture source matched this question from the current set, so I will answer directly.`;
  }

  return `Knowledge Base: Active lecture set is ${input.activeCourse}.`;
}

function getLectureSupportLevel(
  citations: Array<{ similarity?: number }>
): "strong" | "partial" | "none" {
  if (!citations.length) return "none";

  const bestSimilarity = Math.max(
    0,
    ...citations
      .map((citation) => citation.similarity)
      .filter((score): score is number => typeof score === "number")
  );

  return bestSimilarity >= 0.82 ? "strong" : "partial";
}

function ensureLectureConnectionSection(input: {
  content: string;
  lectureMode: boolean;
  citations: Array<{ similarity?: number }>;
}): string {
  if (!input.lectureMode) return input.content;

  const trimmed = input.content.trim();
  if (!trimmed) return trimmed;
  const supportLevel = getLectureSupportLevel(input.citations);
  const noSourceBlock =
    "**Lecture Source**\nNo direct lecture source found for this topic\nAnswered using general math knowledge.";
  const lectureConnectionPattern =
    /(?:^|\n)(\*\*Lecture (?:Connection|Source)\*\*|#{1,6}\s*Lecture (?:Connection|Source)|Lecture (?:Connection|Source):)\s*[\s\S]*?(?=\n(?:\*\*[^*\n]+\*\*|#{1,6}\s+|## Final Answer\b)|$)/i;

  if (supportLevel === "none") {
    if (lectureConnectionPattern.test(trimmed)) {
      return trimmed.replace(lectureConnectionPattern, (_match, heading: string) => {
        if (/lecture (connection|source):/i.test(heading)) {
          return `\nNo direct lecture source found for this topic\nAnswered using general math knowledge.`;
        }
        return `\n${noSourceBlock}`;
      }).trim();
    }

    const finalAnswerMatch = trimmed.match(/\n## Final Answer\b/i);
    if (!finalAnswerMatch || finalAnswerMatch.index === undefined) {
      return `${trimmed}\n\n${noSourceBlock}`;
    }

    const beforeFinal = trimmed.slice(0, finalAnswerMatch.index).trimEnd();
    const finalAnswerAndAfter = trimmed.slice(finalAnswerMatch.index).trimStart();
    return `${beforeFinal}\n\n${noSourceBlock}\n\n${finalAnswerAndAfter}`;
  }

  if (/\*\*Lecture (Connection|Source)\*\*|(^|\n)Lecture (Connection|Source):/i.test(trimmed)) {
    return trimmed;
  }

  const lectureConnectionBlock =
    supportLevel === "strong"
      ? [
          "**Lecture Source**",
          "Using lecture sources for this answer.",
          "This answer is based on lecture material",
        ]
      : supportLevel === "partial"
        ? [
            "**Lecture Source**",
            "Using lecture sources for this answer.",
            "Partially supported by lecture material",
          ]
        : [
            "**Lecture Source**",
            "No direct lecture source found for this topic",
            "Answered using general math knowledge.",
          ];

  const finalAnswerMatch = trimmed.match(/\n## Final Answer\b/i);
  if (!finalAnswerMatch || finalAnswerMatch.index === undefined) {
    return `${trimmed}\n\n${lectureConnectionBlock.join("\n")}`;
  }

  const beforeFinal = trimmed.slice(0, finalAnswerMatch.index).trimEnd();
  const finalAnswerAndAfter = trimmed.slice(finalAnswerMatch.index).trimStart();
  return `${beforeFinal}\n\n${lectureConnectionBlock.join("\n")}\n\n${finalAnswerAndAfter}`;
}

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json();

    const message = body.message?.trim() || "";
    const history = body.history || [];
    const isNikiMode = body.isNikiMode ?? false;
    const userName = body.userName?.trim() || "User";
    const userId = body.userId?.trim() || "";
    const base64Image = body.base64Image;
    const imageMediaType = body.imageMediaType;
    const textFileContent = body.textFileContent;
    const textFileName = body.textFileName;
    const aboutUserContext = body.aboutUserContext?.trim() || "";
    const responseStyleContext = body.responseStyleContext?.trim() || "";
    const pinnedSyllabusContent = body.pinnedSyllabusContent;
    const pinnedSyllabusName = body.pinnedSyllabusName;
    const knowledgeCourseContext = body.knowledgeCourseContext;
    const focusCourseContext = body.focusCourseContext;
    const focusTopicContext = normalizeFocusTopic(body.focusTopicContext);
    const lectureMode = body.lectureMode ?? false;
    const difficulty = body.difficulty ?? "exam";
    const practiceMode = body.practiceMode ?? false;
    const calendarContext = normalizeCalendarContext(body.calendarContext);
    const trainConsent = body.trainConsent === true;
    const usageLogsConsent = body.usageLogsConsent;

    let ragContext = body.ragContext ?? [];
    let ragStyleSnippets = body.ragStyleSnippets ?? [];
    let ragCitations = dedupeCitations(body.ragCitations ?? []);
    const hasKnowledgeBasePayload =
      ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0;

    const hasImage = !!base64Image;
    const hasTextFile = !!textFileContent;
    const isDevLog = process.env.NODE_ENV !== "production";
    const historyWithoutCurrent =
      history.length > 0 &&
        history[history.length - 1]?.role === "user" &&
        history[history.length - 1]?.content?.trim() === message
        ? history.slice(0, -1)
        : history;
    const correctionIntent = detectCorrectionIntent(message);
    const effectiveHistory = correctionIntent
      ? dropLatestAssistantMessage(historyWithoutCurrent)
      : historyWithoutCurrent;

    const trainingPrompt =
      message ||
      (textFileName
        ? `[Attached file: ${textFileName}]`
        : hasImage
          ? "[Image request]"
          : hasTextFile
            ? "[Text file request]"
            : "[No prompt provided]");

    const sanitizeTrainingLogText = (value: string) =>
      value
        .replace(/((?:password|passcode|passwd)\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]")
        .replace(/((?:access_token|refresh_token|id_token)\s*[:=]\s*)([^\s&]+)/gi, "$1[REDACTED]")
        .replace(/(authorization\s*:\s*bearer\s+)([a-z0-9._-]+)/gi, "$1[REDACTED]")
        .replace(/(bearer\s+)([a-z0-9._-]{20,})/gi, "$1[REDACTED]")
        .replace(/([?&](?:access_token|refresh_token|id_token)=)([^&\s]+)/gi, "$1[REDACTED]");

    // This training log is intentionally separate from normal chats/messages history.
    // Chats/messages keep powering the product. This log only records consented
    // quality-improvement samples when the user explicitly enables train_on_data.
    const maybeLogTrainingInteraction = async (assistantResponse: string) => {
      if (!trainConsent) return;
      if (!assistantResponse.trim()) return;

      try {
        const sanitizedPrompt = sanitizeTrainingLogText(trainingPrompt);
        const sanitizedResponse = sanitizeTrainingLogText(assistantResponse);
        const { error } = await supabaseAdmin.from("training_interactions").insert({
          user_id: userId || null,
          prompt: sanitizedPrompt,
          response: sanitizedResponse,
          user_prompt: sanitizedPrompt,
          assistant_response: sanitizedResponse,
          mode: isNikiMode ? "nemanja" : "pure",
          teaching_mode: lectureMode,
        });

        if (error && process.env.NODE_ENV !== "production") {
          console.warn("Training log insert failed:", error);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Training log insert error:", error);
        }
      }
    };

    // This usage log is also separate from normal chats/messages history.
    // It records coarse product telemetry only when share_usage_data is enabled.
    // No prompt text, response text, auth secrets, or file contents belong here.
    const maybeLogUsageInteraction = async () => {
      if (!effectiveUsageLogsConsent) return;

      try {
        const resolvedCourse =
          requestedKnowledgeCourse ??
          focusCourseContext ??
          knowledgeCourseContext ??
          null;
        const { error } = await supabaseAdmin.from("usage_interactions").insert({
          user_id: userId || null,
          mode: isNikiMode ? "nemanja" : "pure",
          teaching_mode: lectureMode,
          requested_course: requestedKnowledgeCourse ?? null,
          active_course: knowledgeCourseContext ?? null,
          focus_course: focusCourseContext ?? null,
          focus_topic: focusTopicContext || null,
          course: resolvedCourse,
        });

        if (error && process.env.NODE_ENV !== "production") {
          console.warn("Usage log insert failed:", error);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Usage log insert error:", error);
        }
      }
    };

    const buildLoggedTextResponse = async (content: string, init?: ResponseInit) => {
      await maybeLogTrainingInteraction(content);
      await maybeLogUsageInteraction();
      return new Response(
        content,
        init ?? {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        }
      );
    };

    if (!message && !hasImage && !hasTextFile) {
      return NextResponse.json(
        { reply: "Please enter a message or attach a file." },
        { status: 400 }
      );
    }

    if (isDevLog) {
      console.log("\n=============================");
      console.log(`🧠 User asked: "${message || "[file only]"}"`);
      console.log(`📎 Image: ${hasImage} | Text file: ${hasTextFile}`);
      if (hasImage && imageMediaType) console.log(`🖼️ Image type: ${imageMediaType}`);
      console.log("🌊 STREAMING ONLINE: Connecting to Ollama...");
    }

    const profile = userId
      ? (
        await supabase
          .from("profiles")
          .select("about_user, response_style, share_usage_data")
          .eq("id", userId)
          .maybeSingle()
      ).data
      : null;

    const effectiveUsageLogsConsent =
      usageLogsConsent === true ||
      (usageLogsConsent === undefined && profile?.share_usage_data === true);

    const personalContext = [
      aboutUserContext
        ? `User context: ${aboutUserContext}`
        : profile?.about_user
          ? `User context: ${profile.about_user}`
          : "",
      calendarContext
        ? `Calendar context available: The user has upcoming saved events. Use the dedicated calendar system message for exact event details.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const styleInstructions = responseStyleContext
      ? `Response style: ${responseStyleContext}`
      : profile?.response_style
        ? `Response style: ${profile.response_style}`
      : "";

    const detectedCourse = detectCourseFilter(message);
    const inferredMathCourse = inferCourseFromMathTopic(message);
    const courseSectionLookup = detectCourseSectionLookup(message);
    const courseTopicShorthand = detectCourseTopicShorthand(message);
    const requestedKnowledgeCourse =
      courseSectionLookup?.course ??
      courseTopicShorthand?.course ??
      detectedCourse ??
      inferredMathCourse;
    const explicitKnowledgeBaseRequest =
      isExplicitKnowledgeBaseRequest(message) || !!courseSectionLookup || !!courseTopicShorthand;
    const knowledgeBaseActive = hasKnowledgeBasePayload || explicitKnowledgeBaseRequest;
    const knowledgeBaseCourseMismatch =
      knowledgeBaseActive &&
      !!knowledgeCourseContext &&
      !!requestedKnowledgeCourse &&
      normalizeCourseKey(knowledgeCourseContext) !== normalizeCourseKey(requestedKnowledgeCourse);
    const bareCourseOnlyMessage = isBareCourseOnlyMessage(message, detectedCourse);
    const recentCourseFromHistory = detectRecentCourseFromHistory(effectiveHistory);
    const focusCourseFallback = !detectedCourse && !courseSectionLookup && !courseTopicShorthand
      ? focusCourseContext
      : undefined;
    const courseForLectureList = detectedCourse ?? recentCourseFromHistory ?? focusCourseFallback;
    const latestAssistantForLectureTopic = [...history]
      .reverse()
      .find((msg) => msg.role === "ai" || msg.role === "assistant")?.content ?? "";
    const wantsLectureRecovery = lectureMode && isLectureSummaryRequest(message);
    const isLectureTopicFollowup =
      !!courseForLectureList &&
      message.trim().length <= 80 &&
      !wantsLectureRecovery &&
      /(What topic or course do you want lectures for|Tell me a course or topic|I can list lectures by topic\/course)/i.test(
        latestAssistantForLectureTopic
      );
    const isDetectedCourseLectureIntent =
      (!!detectedCourse && !wantsLectureRecovery && /(list|lectures|all|show)/i.test(message)) ||
      isLectureTopicFollowup ||
      (!!detectedCourse && !wantsLectureRecovery && bareCourseOnlyMessage);
    const isRecentCourseLectureFollowup =
      !detectedCourse &&
      !!recentCourseFromHistory &&
      isLectureListIntent(message) &&
      !wantsLectureRecovery &&
      /\b(all|show|list|those|them|that course|the lectures?)\b/i.test(message);

    if (
      knowledgeBaseActive &&
      hasSpecificUnsupportedLectureDomain(message) &&
      !wantsLectureRecovery &&
      !detectedCourse &&
      !inferredMathCourse
    ) {
      return await buildLoggedTextResponse(
        [
          "I don't have lecture retrieval context for that specific topic or course.",
          "",
          "I will not invent lecture names or YouTube links. Ask for a real indexed course or topic like Calculus 1, Calculus 2, Calculus 3, PreCalc1, Statistics, Differential Equations, or Elementary Algebra.",
        ].join("\n"),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        }
      );
    }

    if (lectureMode && !wantsLectureRecovery) {
      const broadTopicReply = buildBroadLectureTopicClarification(message);
      if (broadTopicReply) {
        return await buildLoggedTextResponse(broadTopicReply, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    if (courseSectionLookup && !wantsLectureRecovery) {
      const reply = await buildCourseSectionLookupReply(courseSectionLookup);
      return await buildLoggedTextResponse(reply, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (isLectureCountIntent(message)) {
      const counts = await getLectureCourseCounts();
      return await buildLoggedTextResponse(buildLectureCountReply(counts), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (
      isLectureListIntent(message) &&
      !wantsLectureRecovery &&
      !courseForLectureList &&
      !isCalc1LectureListIntent(message)
    ) {
      return await buildLoggedTextResponse(buildLectureTopicPrompt([]), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (
      (!wantsLectureRecovery && isCalc1LectureListIntent(message)) ||
      isDetectedCourseLectureIntent ||
      isRecentCourseLectureFollowup
    ) {
      const courseFilter = courseForLectureList ?? "Calculus 1";
      const lectures = await getLecturesByCourse(courseFilter);

      if (!lectures.length) {
        return await buildLoggedTextResponse(`I don't have any ${courseFilter} lectures in the database.`, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      const reply = lectures
        .map((lecture, i) => {
          const title = lecture.lecture_title ?? "Unknown lecture";
          const course = lecture.course ?? "Unknown course";
          const professor = lecture.professor ?? "Unknown professor";
          const watch = isUsableVideoUrl(lecture.video_url)
            ? `\nWatch: ${lecture.video_url}`
            : "\nWatch: link unavailable";
          return `${i + 1}. ${title}\n${course} · ${professor}${watch}`;
        })
        .join("\n\n");

      return await buildLoggedTextResponse(reply, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (
      knowledgeBaseActive &&
      (isLectureSummaryRequest(message) || isVideoLookupIntent(message)) &&
      ragContext.length === 0 &&
      ragCitations.length === 0
    ) {
      if (isVideoLookupIntent(message)) {
        const knownVideoReply = buildCitationLectureReply(message, []);
        if (knownVideoReply && !/don't have any matching lecture metadata/i.test(knownVideoReply)) {
          return await buildLoggedTextResponse(knownVideoReply, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        }
      }

      const ragController = new AbortController();
      const ragTimeout = setTimeout(() => ragController.abort(), INTERNAL_RAG_TIMEOUT_MS);

      try {
        const ragRes = await fetch(new URL("/api/rag/query", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ragController.signal,
          body: JSON.stringify({
            question: message,
            lectureMode: true,
            courseFilter: knowledgeCourseContext ?? inferCourseFromMathTopic(message),
            minSimilarity: 0.2,
            maxChunks: 8,
            maxStyleSnippets: isNikiMode ? 6 : 3,
          }),
        });

        if (ragRes.ok) {
          const ragJson = (await ragRes.json()) as InternalRagResponse;
          ragContext = ragJson.context ?? [];
          ragStyleSnippets = ragJson.styleSnippets ?? [];
          ragCitations = dedupeCitations(ragJson.citations ?? []);
        } else if (isDevLog) {
          console.log("Lecture recovery RAG fallback failed:", ragRes.status, await ragRes.text());
        }
      } catch (error) {
        if (isDevLog) console.log("Lecture recovery RAG fallback error:", error);
      } finally {
        clearTimeout(ragTimeout);
      }
    }

    if (
      knowledgeBaseActive &&
      courseTopicShorthand &&
      ragContext.length === 0 &&
      ragCitations.length === 0
    ) {
      const ragController = new AbortController();
      const ragTimeout = setTimeout(() => ragController.abort(), INTERNAL_RAG_TIMEOUT_MS);

      try {
        const ragRes = await fetch(new URL("/api/rag/query", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ragController.signal,
          body: JSON.stringify({
            question: `${courseTopicShorthand.topic} ${courseTopicShorthand.course}`,
            lectureMode: true,
            courseFilter: courseTopicShorthand.course,
            minSimilarity: 0.2,
            maxChunks: 8,
            maxStyleSnippets: isNikiMode ? 6 : 3,
          }),
        });

        if (ragRes.ok) {
          const ragJson = (await ragRes.json()) as InternalRagResponse;
          ragContext = ragJson.context ?? [];
          ragStyleSnippets = ragJson.styleSnippets ?? [];
          ragCitations = dedupeCitations(ragJson.citations ?? []);
        } else if (isDevLog) {
          console.log("Course-topic shorthand RAG fallback failed:", ragRes.status, await ragRes.text());
        }
      } catch (error) {
        if (isDevLog) console.log("Course-topic shorthand RAG fallback error:", error);
      } finally {
        clearTimeout(ragTimeout);
      }
    }

    if (knowledgeBaseActive) {
      if (courseTopicShorthand && !wantsLectureRecovery) {
        const courseTopicSearchReply = await buildCourseTopicSearchReply({
          lookup: courseTopicShorthand,
          citations: ragCitations,
        });
        if (courseTopicSearchReply) {
          return await buildLoggedTextResponse(courseTopicSearchReply, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        }
      }

      const lectureRecoveryReply = buildLectureRecoveryReply({
        message,
        ragContext,
        citations: ragCitations,
      });
      if (lectureRecoveryReply) {
        return await buildLoggedTextResponse(sanitizeMathContent(lectureRecoveryReply), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      const directLectureReply = buildCitationLectureReply(message, ragCitations);
      if (directLectureReply) {
        return await buildLoggedTextResponse(directLectureReply, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      if (
        isLectureSummaryRequest(message) &&
        ragContext.length === 0 &&
        ragCitations.length === 0
      ) {
        return await buildLoggedTextResponse(
          [
            "I do not have lecture retrieval context for that specific lecture.",
            "",
            "Give me a real course, topic, or lecture title from the indexed lectures and I can reconstruct it from the transcript instead of inventing details.",
          ].join("\n"),
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          }
        );
      }
    }

    if (!hasImage && !hasTextFile) {
      const proceduralMathIntent = detectSimpleMathIntent(message);
      const teachFirstMathRequest = isTeachFirstMathRequest(message, proceduralMathIntent);
      const correctionMathIntent = correctionIntent?.correctedMathIntent ?? null;
      const correctionMathExpression = correctionMathIntent
        ? extractRecentMathExpressionFromHistory(effectiveHistory)
        : null;
      const recentStudyIntent = correctionIntent
        ? detectRecentStudyIntentFromHistory(effectiveHistory)
        : false;
      if (
        proceduralMathIntent &&
        !teachFirstMathRequest &&
        incompleteProceduralMathRequest(message, proceduralMathIntent)
      ) {
        return await buildLoggedTextResponse(missingExpressionReply(proceduralMathIntent, message), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      const deterministicMathReply = buildDeterministicMathReply({
        message,
        isProfessorMode: isNikiMode,
        lectureMode,
        hasLectureContext: ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0,
      });

      if (deterministicMathReply) {
        const polishedDeterministicMathReply = polishDeterministicMathPresentation(
          deterministicMathReply
        );
        const knowledgeBasePrefix = knowledgeBaseActive
          ? buildKnowledgeBaseReplyPrefix({
            activeCourse: knowledgeCourseContext,
            requestedCourse: requestedKnowledgeCourse,
            mismatch: !!knowledgeBaseCourseMismatch,
            hasSources: ragCitations.length > 0,
          })
          : "";
        const reply = knowledgeBasePrefix
          ? `${knowledgeBasePrefix}\n\n${polishedDeterministicMathReply}`
          : polishedDeterministicMathReply;
        const lectureSafeReply = ensureLectureConnectionSection({
          content: reply,
          lectureMode,
          citations: ragCitations,
        });

        return await buildLoggedTextResponse(normalizeModelMathOutput(lectureSafeReply), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      if (correctionIntent && !correctionIntent.correctedCourse && !correctionMathIntent) {
        return await buildLoggedTextResponse(`${correctionIntent.acknowledgement}\n\nWhat topic should I switch to?`, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      if (correctionIntent?.correctedCourse && recentStudyIntent) {
        return await buildLoggedTextResponse(
          `${correctionIntent.acknowledgement}\n\nWhat is your ${correctionIntent.correctedCourse} study block on? Send the chapter, section, or topic and I will narrow it right away.`,
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          }
        );
      }

      if (correctionMathIntent) {
        const correctionAcknowledgement = correctionIntent?.acknowledgement ?? "Got it.";
        if (!correctionMathExpression) {
          return await buildLoggedTextResponse(
            `${correctionAcknowledgement}\n\nSend the expression and I will do it with ${correctionMathIntent}.`,
            {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
              },
            }
          );
        }

        if (correctionMathIntent === "limit") {
          return await buildLoggedTextResponse(
            `${correctionAcknowledgement}\n\n${contextualLimitFollowupReply(correctionMathExpression)}`,
            {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
              },
            }
          );
        }

        const correctedMathMessage = buildContextualMathMessage(
          correctionMathIntent,
          correctionMathExpression
        );
        if (correctedMathMessage) {
          const correctedMathReply = buildDeterministicMathReply({
            message: correctedMathMessage,
            isProfessorMode: isNikiMode,
            lectureMode,
            hasLectureContext:
              ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0,
          });

          if (correctedMathReply) {
            const polishedCorrectedMathReply = polishDeterministicMathPresentation(
              correctedMathReply
            );
            const correctedLectureSafeReply = ensureLectureConnectionSection({
              content: `${correctionAcknowledgement}\n\n${polishedCorrectedMathReply}`,
              lectureMode,
              citations: ragCitations,
            });
            return await buildLoggedTextResponse(
              normalizeModelMathOutput(correctedLectureSafeReply),
              {
                headers: {
                  "Content-Type": "text/plain; charset=utf-8",
                  "Cache-Control": "no-cache",
                },
              }
            );
          }
        }
      }

      const bareMathFollowupExpression = extractBareMathFollowupExpression(message);
      if (!proceduralMathIntent && bareMathFollowupExpression) {
        const recentMathIntent = detectRecentMathIntentFromHistory(effectiveHistory);
        if (recentMathIntent === "limit") {
          return await buildLoggedTextResponse(contextualLimitFollowupReply(bareMathFollowupExpression), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        }

        const contextualMathMessage = buildContextualMathMessage(
          recentMathIntent,
          bareMathFollowupExpression
        );

        if (contextualMathMessage) {
          const contextualMathReply = buildDeterministicMathReply({
            message: contextualMathMessage,
            isProfessorMode: isNikiMode,
            lectureMode,
            hasLectureContext:
              ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0,
          });

          if (contextualMathReply) {
            const polishedContextualMathReply = polishDeterministicMathPresentation(
              contextualMathReply
            );
            const contextualLectureSafeReply = ensureLectureConnectionSection({
              content: polishedContextualMathReply,
              lectureMode,
              citations: ragCitations,
            });
            return await buildLoggedTextResponse(normalizeModelMathOutput(contextualLectureSafeReply), {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
              },
            });
          }
        }

        return await buildLoggedTextResponse(ambiguousMathFollowupReply(bareMathFollowupExpression), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      const mathIntentClarification = buildMathIntentClarification(message);
      if (mathIntentClarification) {
        return await buildLoggedTextResponse(mathIntentClarification, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    const formattedHistory = effectiveHistory
      .filter(
        (msg) =>
          msg.content?.trim() &&
          !isUiGreeting(msg.content) &&
          !isInternalModeReminder(msg.content)
      )
      .slice(-8)
      .map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: sanitizeHistoryForModel(msg.content),
      }));

    const latestAssistantMessage = [...effectiveHistory]
      .reverse()
      .find(
        (msg) =>
          msg.role === "ai" &&
          typeof msg.content === "string" &&
          msg.content.trim().length > 0
      )?.content;

    const includeThoughtTrace = wantsThoughtTrace(message);
    const studyIntent = isStudyHelpIntent(message, calendarContext);
    const shortFollowup = isShortAcademicFollowup(message);
    const mathInput = isLikelyMathQuestion(message);
    const recentMathIntentForFollowup = shortFollowup
      ? detectRecentMathIntentFromHistory(effectiveHistory)
      : null;
    const studyHelpClarification = buildStudyHelpClarification({
      message,
      detectedCourse: detectedCourse ?? recentCourseFromHistory ?? focusCourseFallback,
      studyIntent,
      focusTopic: !hasSpecificStudyTopic(message) ? focusTopicContext : undefined,
    });
    const forceStructuredMath =
      isLikelyMathQuestion(message) ||
      wantsStepByStep(message) ||
      wantsDeeperExplanation(message);
    const longFormNonDeterministic =
      !forceStructuredMath &&
      (isLongFormNonDeterministicRequest(message) || studyIntent || shortFollowup || !!courseTopicShorthand);

    const isCoding =
      isCodingQuestion(message, textFileName, textFileContent) ||
      /```/.test(message) ||
      /route|api|supabase|ollama/i.test(message);

    const systemPrompt = buildSystemPrompt({
      isProfessorMode: isNikiMode,
      userName,
      includeThoughtTrace,
      personalContext,
      styleInstructions,
      lectureMode,
      forceStructuredMath,
      longFormNonDeterministic,
      isCoding,
      difficulty,
      practiceMode,
    });

    const lectureContextSystemContent =
      knowledgeBaseActive &&
        (ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0)
        ? buildLectureContextSystemMessage({
          ragContext,
          ragStyleSnippets,
          ragCitations,
        })
        : "";

    const userMessageContent = buildUserMessageContent({
      message,
      textFileContent,
      textFileName,
      pinnedSyllabusContent,
      pinnedSyllabusName,
      knowledgeCourseContext,
      knowledgeBaseEnabled: knowledgeBaseActive,
      latestAssistantMessage,
      practiceMode: practiceMode || isPracticeRequest(message) || isLectureSummaryRequest(message),
    });
    const modeReminderSystemContent = buildModeReminderSystemMessage({
      isProfessorMode: isNikiMode,
      lectureMode,
      hasLectureContext: !!lectureContextSystemContent,
      knowledgeBaseActive,
      longFormNonDeterministic,
    });
    const intentResolutionSystemContent =
      mathInput || studyIntent || shortFollowup || !!courseSectionLookup || !!courseTopicShorthand
        ? buildIntentResolutionSystemMessage({
          mathInput,
          studyIntent,
          shortFollowup,
          courseSectionLookup,
          courseTopicShorthand,
          focusCourse: focusCourseFallback,
          focusTopic: focusTopicContext,
        })
        : "";
    const shortFollowupContextSystemContent = shortFollowup
      ? buildShortFollowupContextSystemMessage({
        history: effectiveHistory,
        recentMathIntent: recentMathIntentForFollowup,
        recentCourse: recentCourseFromHistory,
        focusCourse: focusCourseFallback,
        focusTopic: focusTopicContext,
      })
      : "";
    const correctionSystemContent = correctionIntent
      ? buildCorrectionSystemMessage({
        correctionIntent,
        recentUserMessage: getRecentSubstantiveUserMessage(effectiveHistory),
      })
      : "";
    const proceduralMathIntent = !hasImage && !hasTextFile ? detectSimpleMathIntent(message) : null;
    const teachFirstMathSystemContent = isTeachFirstMathRequest(message, proceduralMathIntent)
      ? buildTeachFirstMathSystemMessage(proceduralMathIntent as NonNullable<ReturnType<typeof detectSimpleMathIntent>>)
      : "";
    const knowledgeBaseTransparencySystemContent = knowledgeBaseActive
      ? buildKnowledgeBaseTransparencySystemMessage({
        activeCourse: knowledgeCourseContext,
        requestedCourse: requestedKnowledgeCourse,
        mismatch: !!knowledgeBaseCourseMismatch,
        hasSources: ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0,
      })
      : "";
    const focusMismatch = detectFocusMismatch(message, focusTopicContext);
    const focusModeSystemContent = buildFocusModeSystemMessage({
      focusCourse: focusCourseFallback,
      focusTopic: focusTopicContext,
    });
    const focusMismatchSystemContent = focusMismatch
      ? buildFocusMismatchSystemMessage(focusMismatch)
      : "";

    if (studyHelpClarification) {
      return await buildLoggedTextResponse(studyHelpClarification, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const userMessage: Record<string, unknown> = {
      role: "user",
      content: userMessageContent || "Please respond to the user's request.",
    };

    if (hasImage) {
      userMessage.images = [base64Image];
    }

    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      { role: "system" as const, content: modeReminderSystemContent },
      { role: "system" as const, content: buildMemoryBoundarySystemMessage() },
      ...(intentResolutionSystemContent
        ? [{ role: "system" as const, content: intentResolutionSystemContent }]
        : []),
      ...(correctionSystemContent
        ? [{ role: "system" as const, content: correctionSystemContent }]
        : []),
      ...(teachFirstMathSystemContent
        ? [{ role: "system" as const, content: teachFirstMathSystemContent }]
        : []),
      ...(knowledgeBaseTransparencySystemContent
        ? [{ role: "system" as const, content: knowledgeBaseTransparencySystemContent }]
        : []),
      ...(shortFollowupContextSystemContent
        ? [{ role: "system" as const, content: shortFollowupContextSystemContent }]
        : []),
      ...(focusModeSystemContent
        ? [{ role: "system" as const, content: focusModeSystemContent }]
        : []),
      ...(focusMismatchSystemContent
        ? [{ role: "system" as const, content: focusMismatchSystemContent }]
        : []),
      ...(calendarContext
        ? [{ role: "system" as const, content: buildCalendarContextSystemMessage(calendarContext) }]
        : []),
      ...(lectureContextSystemContent
        ? [{ role: "system" as const, content: lectureContextSystemContent }]
        : lectureMode
          ? [
            {
              role: "system" as const,
              content:
                knowledgeBaseActive
                  ? "Lecture mode is enabled, but no lecture retrieval context is available. Keep the answer self-contained, include a short Lecture Source fallback near the end, and do not invent lecture-specific details."
                  : "Lecture mode is enabled without active Knowledge Base retrieval. Keep the answer self-contained, include a short Lecture Source fallback near the end, and do not invent lecture-specific details or citations.",
            },
          ]
          : []),
      ...formattedHistory,
      userMessage,
    ];

    const model = hasImage ? "llava:latest" : "qwen2.5:7b";

    if (isDevLog) {
      console.log(`🤖 Routing to model: ${model}`);
      console.log("FINAL MESSAGES", JSON.stringify(ollamaMessages, null, 2));
    }

    const ollamaBaseUrl =
      process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434";

    const shouldBufferForRepair =
      (lectureMode && !hasImage) ||
      (forceStructuredMath && !hasImage) ||
      (longFormNonDeterministic && !hasImage);
    const modelTemperature = forceStructuredMath ? 0 : longFormNonDeterministic ? 0.35 : 0.15;
    const modelNumPredict = longFormNonDeterministic ? 2600 : hasImage ? 1200 : 1800;

    if (shouldBufferForRepair) {
      const stableMathResponse = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          model,
          stream: false,
          keep_alive: "2h",
          options: {
            num_predict: modelNumPredict,
            temperature: modelTemperature,
          },
          messages: ollamaMessages,
        }),
      });

      if (!stableMathResponse.ok) {
        const responseText = await stableMathResponse.text().catch(() => "");
        if (isDevLog) {
          console.log(
            "❌ Ollama stable math request failed:",
            stableMathResponse.status,
            stableMathResponse.statusText,
            responseText
          );
        }

        return NextResponse.json(
          {
            reply: ollamaErrorReply(ollamaBaseUrl, stableMathResponse.status),
          },
          { status: 502 }
        );
      }

      const stableJson = await stableMathResponse.json().catch(() => null);
      const stableContent = String(stableJson?.message?.content ?? "");
      const lectureSafeStableContent = ensureLectureConnectionSection({
        content: stableContent,
        lectureMode,
        citations: ragCitations,
      });
      const stableOutput = forceStructuredMath || lectureMode
        ? normalizeModelMathOutput(lectureSafeStableContent)
        : sanitizeMathContent(normalizeBufferedModelOutput(lectureSafeStableContent));

      return await buildLoggedTextResponse(stableOutput, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const ollamaResponse = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: "2h",
        options: {
          num_predict: modelNumPredict,
          temperature: modelTemperature,
        },
        messages: ollamaMessages,
      }),
    });

    if (!ollamaResponse.ok) {
      const responseText = await ollamaResponse.text().catch(() => "");
      if (isDevLog) {
        console.log(
          "❌ Ollama request failed:",
          ollamaResponse.status,
          ollamaResponse.statusText,
          responseText
        );
      }

      return NextResponse.json(
        {
          reply: ollamaErrorReply(ollamaBaseUrl, ollamaResponse.status),
        },
        { status: 502 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";
        let closed = false;
        let streamedContent = "";
        let completed = false;

        const safeClose = () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        };

        const processObjects = (objects: string[]) => {
          for (const obj of objects) {
            try {
              const parsed = JSON.parse(obj);
              if (parsed.message?.content) {
                const chunk = String(parsed.message.content);
                streamedContent += chunk;
                controller.enqueue(encoder.encode(chunk));
              }
              if (parsed.done) {
                completed = true;
                return true;
              }
            } catch {
              // ignore malformed partial objects
            }
          }
          return false;
        };

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              if (buffer.trim()) {
                const { objects } = extractJsonObjects(buffer);
                processObjects(objects);
              }
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const { objects, remainder } = extractJsonObjects(buffer);
            buffer = remainder;

            const isDone = processObjects(objects);
            if (isDone) {
              safeClose();
              return;
            }
          }
        } catch (err) {
          if (isDevLog) console.log("❌ Stream error:", err);
        } finally {
          reader.releaseLock();
          if (completed) {
            await maybeLogTrainingInteraction(streamedContent);
            await maybeLogUsageInteraction();
          }
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ reply: "System Error: Model timed out." });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("❌ Fatal error:", error);
    }

    return NextResponse.json(
      {
        reply: ollamaErrorReply(process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434"),
      },
      { status: 500 }
    );
  }
}
