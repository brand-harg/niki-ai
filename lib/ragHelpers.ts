import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LectureCitation = {
  lectureTitle?: string;
  professor?: string;
  course?: string;
  timestampStartSeconds?: number;
  timestampUrl?: string | null;
  similarity?: number;
};

type LectureSourceRow = {
  lecture_title: string | null;
  course: string | null;
  professor: string | null;
  video_url: string | null;
};

function isLectureListIntent(message: string): boolean {
  return (
    /\b(?:what|which|list|show|all)\b[\s\S]{0,50}\blectures?\b/i.test(message) ||
    /\blectures?\b[\s\S]{0,40}\b(?:have|got|available|list|show)\b/i.test(message)
  );
}

function isLectureCountIntent(message: string): boolean {
  return /\bhow\s+many\b[\s\S]{0,50}\blectures?\b/i.test(message) ||
    /\bcount\b[\s\S]{0,40}\blectures?\b/i.test(message);
}

function isVideoLookupIntent(message: string): boolean {
  return /(what is the youtube video|what's the youtube video|youtube video|video link|what is the video|what's the video)/i.test(
    message
  );
}

function isCalc1LectureListIntent(message: string): boolean {
  return /(calc 1|calculus 1)/i.test(message) && /(list|lectures|all)/i.test(message);
}

function formatSeconds(seconds?: number): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "unknown time";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function isUsableVideoUrl(url?: string | null): url is string {
  if (!url) return false;
  if (/UNKNOWN/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

function dedupeCitations(citations: LectureCitation[]): LectureCitation[] {
  const seen = new Set<string>();
  const out: LectureCitation[] = [];

  for (const cite of citations) {
    const key = [
      cite.lectureTitle ?? "",
      cite.course ?? "",
      cite.professor ?? "",
      cite.timestampStartSeconds ?? "",
      cite.timestampUrl ?? "",
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      out.push(cite);
    }
  }

  return out;
}

function uniqueLectures(citations: LectureCitation[]): LectureCitation[] {
  const seen = new Set<string>();
  const out: LectureCitation[] = [];

  for (const cite of citations) {
    const key = [cite.lectureTitle ?? "", cite.course ?? "", cite.professor ?? ""].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cite);
    }
  }

  return out;
}

function lectureSortValue(title?: string | null): number {
  const text = title ?? "";
  const matches = [...text.matchAll(/\b(\d+)(?:\.(\d+))?/g)];
  if (!matches.length) return Number.MAX_SAFE_INTEGER;
  const section =
    matches.length > 1 && Number(matches[0]?.[1] ?? 0) <= 3
      ? matches[1]
      : matches[0];
  const whole = Number(section?.[1] ?? 0);
  const part = Number(section?.[2] ?? 0);
  return whole * 100 + part;
}

async function getLecturesByCourse(courseFilter: string): Promise<LectureSourceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("lecture_sources")
    .select("lecture_title, course, professor, video_url")
    .ilike("course", `%${courseFilter}%`)
    .order("lecture_title", { ascending: true });

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const deduped: LectureSourceRow[] = [];

  for (const row of (data ?? []) as LectureSourceRow[]) {
    const key = [
      row.lecture_title ?? "",
      row.course ?? "",
      row.professor ?? "",
      row.video_url ?? "",
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  return deduped.sort((a, b) => {
    const sectionDiff = lectureSortValue(a.lecture_title) - lectureSortValue(b.lecture_title);
    if (sectionDiff !== 0) return sectionDiff;
    return (a.lecture_title ?? "").localeCompare(b.lecture_title ?? "");
  });
}

async function getAvailableLectureCourses(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("lecture_sources")
    .select("course")
    .order("course", { ascending: true });

  if (error) throw new Error(error.message);

  return Array.from(
    new Set(
      ((data ?? []) as Array<Pick<LectureSourceRow, "course">>)
        .map((row) => row.course?.trim())
        .filter((course): course is string => !!course)
    )
  );
}

async function getLectureCourseCounts(): Promise<Array<{ course: string; count: number }>> {
  const { data, error } = await supabaseAdmin
    .from("lecture_sources")
    .select("lecture_title, course, professor, video_url")
    .order("course", { ascending: true });

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const row of (data ?? []) as LectureSourceRow[]) {
    const course = row.course?.trim() || "Unknown course";
    const key = [
      row.lecture_title ?? "",
      course,
      row.professor ?? "",
      row.video_url ?? "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(course, (counts.get(course) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([course, count]) => ({ course, count }))
    .sort((a, b) => a.course.localeCompare(b.course));
}

function buildLectureCountReply(counts: Array<{ course: string; count: number }>): string {
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  const lines = counts.map((row) => `- ${row.course}: ${row.count}`);

  return [
    `I currently have ${total} unique lectures indexed.`,
    "",
    "**By course:**",
    ...lines,
    "",
    "Tell me a course or topic and I can list the matching lectures.",
  ].join("\n");
}

function buildLectureTopicPrompt(courses: string[]): string {
  const options = courses.length
    ? courses.map((course) => `- ${course}`).join("\n")
    : [
      "- Calculus 1",
      "- Calculus 2",
      "- Calculus 3",
      "- Statistics",
      "- Differential Equations",
      "- Elementary Algebra",
    ].join("\n");

  return [
    "What topic or course do you want lectures for?",
    "",
    "I can list lectures by topic/course, for example:",
    options,
  ].join("\n");
}

function buildCitationLectureReply(
  message: string,
  citations: LectureCitation[]
): string | null {
  if (!isLectureListIntent(message) && !isVideoLookupIntent(message)) return null;

  const deduped = uniqueLectures(dedupeCitations(citations));
  if (deduped.length === 0) {
    return "I don't have any matching lecture metadata in my database for that request.";
  }

  if (isVideoLookupIntent(message)) {
    const firstWithUrl = deduped.find((c) => isUsableVideoUrl(c.timestampUrl));
    if (!firstWithUrl) {
      return "I found lecture context, but I do not have a usable video link for it in the database.";
    }

    return [
      `${firstWithUrl.lectureTitle ?? "Unknown lecture"}`,
      `${firstWithUrl.course ?? "Unknown course"} · ${firstWithUrl.professor ?? "Unknown professor"} · ${formatSeconds(firstWithUrl.timestampStartSeconds)}`,
      `Watch: ${firstWithUrl.timestampUrl}`,
    ].join("\n");
  }

  return deduped
    .map((c, i) => {
      const title = c.lectureTitle ?? "Unknown lecture";
      const course = c.course ?? "Unknown course";
      const professor = c.professor ?? "Unknown professor";
      const watch = isUsableVideoUrl(c.timestampUrl) ? `\nWatch: ${c.timestampUrl}` : "";
      return `${i + 1}. ${title}\n${course} · ${professor}${watch}`;
    })
    .join("\n\n");
}

function extractTranscriptExcerpt(context: string): string {
  const parts = context.split(/\n\s*\n/);
  const excerpt = parts[parts.length - 1] ?? context;
  return excerpt.replace(/\s+/g, " ").trim();
}

function extractLectureMetadata(context: string): {
  title?: string;
  course?: string;
  professor?: string;
  timestamp?: string;
} {
  return {
    title: context.match(/^Lecture:\s*(.+)$/m)?.[1]?.trim(),
    course: context.match(/^Course:\s*(.+)$/m)?.[1]?.trim(),
    professor: context.match(/^Professor:\s*(.+)$/m)?.[1]?.trim(),
    timestamp: context.match(/^Timestamp:\s*(.+)$/m)?.[1]?.trim(),
  };
}

function trimSentence(value: string, maxChars = 260): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const slice = cleaned.slice(0, maxChars);
  const boundary = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("?"), slice.lastIndexOf("!"));
  if (boundary >= 80) return `${slice.slice(0, boundary + 1)} ...`;
  return `${slice.trimEnd()} ...`;
}

function timestampStartValue(timestamp?: string): number {
  const seconds = timestamp?.match(/^(\d+)s/)?.[1];
  if (!seconds) return Number.MAX_SAFE_INTEGER;
  return Number(seconds);
}

function chooseRepresentativeLectureContexts(contexts: string[], citations: LectureCitation[]) {
  const topTitle = citations[0]?.lectureTitle || extractLectureMetadata(contexts[0] ?? "").title || "";
  const matching = contexts.filter((context) => {
    const title = extractLectureMetadata(context).title ?? "";
    return topTitle && title === topTitle;
  });

  return (matching.length ? matching : contexts).slice(0, 6);
}

function buildLectureRecoveryReply({
  message,
  ragContext,
  citations,
}: {
  message: string;
  ragContext: string[];
  citations: LectureCitation[];
}): string | null {
  const isRecoveryRequest =
    /(lecture me on|teach me the lecture|summarize the lecture|i missed the lecture|wasn'?t in class|what did the lecture cover|explain the lecture)/i.test(
      message
    );
  if (!isRecoveryRequest || ragContext.length === 0) return null;

  const relevantContexts = chooseRepresentativeLectureContexts(ragContext, citations);
  const metadata = extractLectureMetadata(relevantContexts[0] ?? "");
  const firstCitation = citations.find((cite) => cite.lectureTitle === metadata.title) ?? citations[0];
  const lectureTitle = metadata.title ?? firstCitation?.lectureTitle ?? "the retrieved lecture";
  const course = metadata.course ?? firstCitation?.course ?? "Unknown course";
  const professor = metadata.professor ?? firstCitation?.professor ?? "Unknown professor";
  const watch = firstCitation?.timestampUrl ? `\nWatch from here: ${firstCitation.timestampUrl}` : "";

  const excerpts = relevantContexts
    .map((context) => {
      const meta = extractLectureMetadata(context);
      const excerpt = trimSentence(extractTranscriptExcerpt(context), 320);
      const time = meta.timestamp ? ` (${meta.timestamp})` : "";
      return { time, excerpt, sortValue: timestampStartValue(meta.timestamp) };
    })
    .filter((item) => item.excerpt.length > 0)
    .sort((a, b) => a.sortValue - b.sortValue);

  const lower = excerpts.map((item) => item.excerpt.toLowerCase()).join(" ");
  const keyIdeas: string[] = [];
  if (/derivative as a function|function has its own derivative|derivative is a function/.test(lower)) {
    keyIdeas.push("The derivative is treated as its own function, not just a number at one point.");
  }
  if (/limit h goes to 0|limit procedure|x plus h/.test(lower)) {
    keyIdeas.push("The lecture connects derivatives back to the limit process with h approaching 0.");
  }
  if (/slope|tangent line|horizontal/.test(lower)) {
    keyIdeas.push("A derivative measures slope/change, so horizontal tangent lines give derivative value 0.");
  }
  if (/constant.*0|change of a constant is 0|no change/.test(lower)) {
    keyIdeas.push("Constants have derivative 0 because there is no change.");
  }
  if (/vertical asymptote|asymptote/.test(lower)) {
    keyIdeas.push("The lecture notes that vertical asymptotes can be preserved when comparing a function and its derivative.");
  }
  if (/min|max|minimum|maximum/.test(lower)) {
    keyIdeas.push("Minimum and maximum points are tied to derivative value 0 when the tangent line is horizontal.");
  }

  const ideaLines = keyIdeas.length
    ? keyIdeas.map((idea) => `- ${idea}`)
    : ["- The retrieved chunks are the grounding source; use the timestamped clips below as the lecture trail."];

  const evidenceLines = excerpts.slice(0, 5).map((item, index) => {
    return `${index + 1}. ${item.time ? `${item.time} ` : ""}${item.excerpt}`;
  });

  const citationLines = dedupeCitations(citations)
    .filter((cite) => !lectureTitle || cite.lectureTitle === lectureTitle)
    .slice(0, 5)
    .map((cite, index) => {
      const time = formatSeconds(cite.timestampStartSeconds);
      const link = cite.timestampUrl ? ` -> ${cite.timestampUrl}` : "";
      return `${index + 1}. ${time}${link}`;
    });

  const lines = [
    `**Lecture Recovery: ${lectureTitle}**`,
    `${course} · ${professor}${watch}`,
    "",
    "**Board Setup**",
    "Here is the lecture flow from the retrieved transcript chunks. I am using the retrieved lecture evidence first, not making up a fresh lesson.",
    "",
    "**Main Ideas**",
    ...ideaLines,
    "",
    "**Lecture Trail**",
    ...evidenceLines,
    "",
    "**If You Missed Class**",
    "Focus on the board logic: identify the original function, understand what the derivative function represents, connect it to slope/change, and watch where the derivative becomes 0 or undefined.",
    "",
    citationLines.length ? "**Timestamped Clips**" : "",
    ...citationLines,
  ];

  return lines
    .filter((line, index) => {
      if (line !== "") return true;
      return lines[index - 1] !== "" && lines[index + 1] !== "";
    })
    .join("\n");
}

export {
  buildCitationLectureReply,
  buildLectureRecoveryReply,
  buildLectureCountReply,
  buildLectureTopicPrompt,
  dedupeCitations,
  formatSeconds,
  getAvailableLectureCourses,
  getLectureCourseCounts,
  getLecturesByCourse,
  isCalc1LectureListIntent,
  isLectureCountIntent,
  isLectureListIntent,
  isUsableVideoUrl,
};
