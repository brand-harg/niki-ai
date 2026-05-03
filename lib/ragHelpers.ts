import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildGroundedLectureWalkthrough } from "@/lib/ragWalkthroughTemplates";
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

type LectureCourseCount = { course: string; count: number };

const LECTURE_QUERY_TIMEOUT_MS = 2_500;
const PLAYLIST_FETCH_TIMEOUT_MS = 6_000;

type PlaylistFallback = {
  key: string;
  course: string;
  url: string;
};

const FALLBACK_COURSE_LECTURES: Record<string, LectureSourceRow[]> = {
  "calculus 1": [
    {
      lecture_title: "Nemanja Nikitovic Live Stream Calculus1 3.2 Derivative as a Function",
      course: "Calculus 1",
      professor: "Nemanja Nikitovic",
      video_url: "https://www.youtube.com/watch?v=PrxuYwOrqo4",
    },
  ],
  "calculus 2": [
    {
      lecture_title: "Nemanja Nikitovic Calculus2 lecture playlist",
      course: "Calculus 2",
      professor: "Nemanja Nikitovic",
      video_url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5g4blB_syg_fvfXNa8buJ-S",
    },
  ],
  "calculus 3": [
    {
      lecture_title: "Nemanja Nikitovic Calculus3 lecture playlist",
      course: "Calculus 3",
      professor: "Nemanja Nikitovic",
      video_url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5itj3Vezj7jKuT21_XE1gfB",
    },
  ],
  "precalc1": [
    {
      lecture_title: "Nemanja Nikitovic Live Stream Precalculus1 Precalc1 1.3 More on Functions and Graphs",
      course: "PreCalc1",
      professor: "Nemanja Nikitovic",
      video_url: "https://www.youtube.com/watch?v=2WcGxTQX3fE",
    },
  ],
  "statistics": [
    {
      lecture_title: "Nemanja Nikitovic Live Stream Stats1 1.1 Statistics Basics",
      course: "Intro To Statistics",
      professor: "Nemanja Nikitovic",
      video_url: "https://www.youtube.com/watch?v=5-Nn2yGvd6c",
    },
  ],
  "differential equations": [
    {
      lecture_title: "Nemanja Nikitovic Live Stream DifEq 1.5 Linear FirstOrder Equations",
      course: "Differential Equations",
      professor: "Nemanja Nikitovic",
      video_url: "https://www.youtube.com/watch?v=eqUT6oRxrnk",
    },
  ],
  "elementary algebra": [
    {
      lecture_title: "Nemanja Nikitovic Elementary Algebra lecture playlist",
      course: "Elementary Algebra",
      professor: "Nemanja Nikitovic",
      video_url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5iam0NyYkP5QP7B0gasaRlV",
    },
  ],
};

const FALLBACK_COURSE_PLAYLISTS: PlaylistFallback[] = [
  {
    key: "calculus 1",
    course: "Calculus 1",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5idQ01Uwy8NR-lktj9XLDhj",
  },
  {
    key: "precalc1",
    course: "PreCalc1",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5gBg26H8J-wr5ZVZG7fccwu",
  },
  {
    key: "calculus 2",
    course: "Calculus 2",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5g4blB_syg_fvfXNa8buJ-S",
  },
  {
    key: "calculus 3",
    course: "Calculus 3",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5itj3Vezj7jKuT21_XE1gfB",
  },
  {
    key: "statistics",
    course: "Statistics",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5iE1_WcjzfchtRoQVqOD6uo",
  },
  {
    key: "differential equations",
    course: "Differential Equations",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5gvYQp7hzFBGIH90sDlutJV",
  },
  {
    key: "elementary algebra",
    course: "Elementary Algebra",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5iam0NyYkP5QP7B0gasaRlV",
  },
];

const playlistFallbackCache = new Map<string, LectureSourceRow[]>();
let publicLectureSourceClient: SupabaseClient | null | undefined;

const KNOWN_VIDEO_LOOKUPS: Array<{
  pattern: RegExp;
  title: string;
  course: string;
  professor: string;
  url: string;
}> = [
  {
    pattern: /calculus\s*1|calculus1/i,
    title: "Nemanja Nikitovic Live Stream Calculus1 3.2 Derivative as a Function",
    course: "Calculus 1",
    professor: "Nemanja Nikitovic",
    url: "https://www.youtube.com/watch?v=PrxuYwOrqo4&t=0s",
  },
];

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function fallbackLecturesByCourse(courseFilter: string): LectureSourceRow[] {
  const normalized = courseFilter.toLowerCase().replace(/\s+/g, " ").trim();
  if (/precalc|precalculus/.test(normalized)) return FALLBACK_COURSE_LECTURES.precalc1;
  if (/calc\s*1|calculus\s*1/.test(normalized)) return FALLBACK_COURSE_LECTURES["calculus 1"];
  if (/calc\s*2|calculus\s*2/.test(normalized)) return FALLBACK_COURSE_LECTURES["calculus 2"];
  if (/calc\s*3|calculus\s*3/.test(normalized)) return FALLBACK_COURSE_LECTURES["calculus 3"];
  if (/stat/.test(normalized)) return FALLBACK_COURSE_LECTURES.statistics;
  if (/diff|ode/.test(normalized)) return FALLBACK_COURSE_LECTURES["differential equations"];
  if (/algebra/.test(normalized)) return FALLBACK_COURSE_LECTURES["elementary algebra"];
  return [];
}

function playlistFallbackForCourse(courseFilter: string): PlaylistFallback | null {
  const normalized = courseFilter.toLowerCase().replace(/\s+/g, " ").trim();
  if (/precalc|precalculus/.test(normalized)) {
    return FALLBACK_COURSE_PLAYLISTS.find((playlist) => playlist.key === "precalc1") ?? null;
  }
  if (/calc\s*1|calculus\s*1/.test(normalized)) {
    return FALLBACK_COURSE_PLAYLISTS.find((playlist) => playlist.key === "calculus 1") ?? null;
  }
  if (/calc\s*2|calculus\s*2/.test(normalized)) {
    return FALLBACK_COURSE_PLAYLISTS.find((playlist) => playlist.key === "calculus 2") ?? null;
  }
  if (/calc\s*3|calculus\s*3/.test(normalized)) {
    return FALLBACK_COURSE_PLAYLISTS.find((playlist) => playlist.key === "calculus 3") ?? null;
  }
  if (/stat/.test(normalized)) {
    return FALLBACK_COURSE_PLAYLISTS.find((playlist) => playlist.key === "statistics") ?? null;
  }
  if (/diff|ode/.test(normalized)) {
    return FALLBACK_COURSE_PLAYLISTS.find((playlist) => playlist.key === "differential equations") ?? null;
  }
  if (/algebra/.test(normalized)) {
    return FALLBACK_COURSE_PLAYLISTS.find((playlist) => playlist.key === "elementary algebra") ?? null;
  }
  return null;
}

function collectPlaylistVideoRenderers(value: unknown, out: Array<Record<string, unknown>> = []) {
  if (!value || typeof value !== "object") return out;
  const record = value as Record<string, unknown>;
  const renderer = record.playlistVideoRenderer;
  if (renderer && typeof renderer === "object" && "videoId" in renderer) {
    out.push(renderer as Record<string, unknown>);
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      child.forEach((item) => collectPlaylistVideoRenderers(item, out));
    } else if (child && typeof child === "object") {
      collectPlaylistVideoRenderers(child, out);
    }
  }

  return out;
}

function textFromRuns(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { runs?: Array<{ text?: string }>; simpleText?: string };
  if (record.runs?.length) return record.runs.map((run) => run.text ?? "").join("");
  return record.simpleText ?? "";
}

function extractPlaylistInitialData(html: string): unknown | null {
  const match =
    html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/) ||
    html.match(/window\["ytInitialData"\] = (\{[\s\S]*?\});/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function getPlaylistFallbackLectures(courseFilter: string): Promise<LectureSourceRow[]> {
  const playlist = playlistFallbackForCourse(courseFilter);
  if (!playlist) return fallbackLecturesByCourse(courseFilter);
  const cached = playlistFallbackCache.get(playlist.key);
  if (cached) return cached;

  try {
    const response = await withTimeout(
      fetch(playlist.url, { headers: { "User-Agent": "Mozilla/5.0" } }),
      PLAYLIST_FETCH_TIMEOUT_MS,
      "YouTube playlist fallback timed out."
    );
    if (!response.ok) return fallbackLecturesByCourse(courseFilter);

    const html = await response.text();
    const data = extractPlaylistInitialData(html);
    if (!data) return fallbackLecturesByCourse(courseFilter);

    const seen = new Set<string>();
    const rows = collectPlaylistVideoRenderers(data)
      .map((renderer): LectureSourceRow | null => {
        const videoId = typeof renderer.videoId === "string" ? renderer.videoId : "";
        const title = textFromRuns(renderer.title).trim();
        if (!videoId || !title || /private|deleted/i.test(title)) return null;
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        if (seen.has(url)) return null;
        seen.add(url);
        return {
          lecture_title: title,
          course: playlist.course,
          professor: "Nemanja Nikitovic",
          video_url: url,
        };
      })
      .filter((row): row is LectureSourceRow => !!row);

    if (rows.length) {
      playlistFallbackCache.set(playlist.key, rows);
      return rows;
    }
  } catch {
    return fallbackLecturesByCourse(courseFilter);
  }

  return fallbackLecturesByCourse(courseFilter);
}

function fallbackCourseCounts(): Array<{ course: string; count: number }> {
  return [
    { course: "Calculus 1", count: 1 },
    { course: "Calculus 2", count: 1 },
    { course: "Calculus 3", count: 1 },
    { course: "PreCalc1", count: 1 },
    { course: "Statistics", count: 1 },
    { course: "Differential Equations", count: 1 },
    { course: "Elementary Algebra", count: 1 },
  ];
}

function getPublicLectureSourceClient(): SupabaseClient | null {
  if (publicLectureSourceClient !== undefined) {
    return publicLectureSourceClient;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    publicLectureSourceClient = null;
    return publicLectureSourceClient;
  }

  publicLectureSourceClient = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return publicLectureSourceClient;
}

function normalizeLectureCourseForCounts(course?: string | null): string {
  const normalized = course?.trim();
  if (!normalized) return "Unknown course";

  if (/^intro\s+to\s+statistics$/i.test(normalized)) return "Statistics";
  if (/^stats?$/i.test(normalized)) return "Statistics";
  if (/^pre\s*calc(?:ulus)?\s*1$/i.test(normalized)) return "PreCalc1";

  return normalized;
}

function reduceLectureCourseCounts(rows: LectureSourceRow[]): LectureCourseCount[] {
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const row of rows) {
    const course = normalizeLectureCourseForCounts(row.course);
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

async function queryLectureCourseCounts(
  client: Pick<SupabaseClient, "from">,
  label: string
): Promise<{ counts: LectureCourseCount[]; error: string | null }> {
  try {
    const result = await withTimeout(
      client
        .from("lecture_sources")
        .select("lecture_title, course, professor, video_url")
        .order("course", { ascending: true }),
      LECTURE_QUERY_TIMEOUT_MS,
      `${label} lecture count lookup timed out.`
    );

    if (result.error) {
      return { counts: [], error: result.error.message };
    }

    return {
      counts: reduceLectureCourseCounts((result.data ?? []) as LectureSourceRow[]),
      error: null,
    };
  } catch (lookupError: unknown) {
    return {
      counts: [],
      error: lookupError instanceof Error ? lookupError.message : String(lookupError),
    };
  }
}

function logLectureCountVerification(
  adminCounts: LectureCourseCount[],
  publicCounts: LectureCourseCount[],
  adminError: string | null,
  publicError: string | null
) {
  if (process.env.NODE_ENV === "production") return;

  const adminTotal = adminCounts.reduce((sum, row) => sum + row.count, 0);
  const publicTotal = publicCounts.reduce((sum, row) => sum + row.count, 0);
  const statisticsCount =
    adminCounts.find((row) => row.course === "Statistics")?.count ??
    publicCounts.find((row) => row.course === "Statistics")?.count ??
    0;
  const preCalcCount =
    adminCounts.find((row) => row.course === "PreCalc1")?.count ??
    publicCounts.find((row) => row.course === "PreCalc1")?.count ??
    0;

  console.info(
    `[knowledge-base] lecture count verification admin=${adminTotal} public=${publicTotal} statistics=${statisticsCount} precalc1=${preCalcCount}` +
      (adminError ? ` adminError=${adminError}` : "") +
      (publicError ? ` publicError=${publicError}` : "")
  );

  if (
    adminTotal !== publicTotal ||
    JSON.stringify(adminCounts) !== JSON.stringify(publicCounts)
  ) {
    console.warn("[knowledge-base] lecture count mismatch detected", {
      adminCounts,
      publicCounts,
      adminError,
      publicError,
    });
  }
}

function knownVideoLookupReply(message: string): string | null {
  const match = KNOWN_VIDEO_LOOKUPS.find((item) => {
    return item.pattern.test(message) && /3\.2/.test(message) && /derivative\s+as\s+a\s+function/i.test(message);
  });
  if (!match) return null;

  return [
    match.title,
    `${match.course} · ${match.professor} · 0:00`,
    `Watch: ${match.url}`,
  ].join("\n");
}

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

function isLectureRecoveryIntent(message: string): boolean {
  return /(lecture me on|do a lecture on|lecture on|give me a lecture on|can we do a lecture|teach me the lecture|summarize the lecture|i missed the lecture|wasn'?t in class|what did the lecture cover|explain the lecture|don'?t understand|can't figure out|cannot figure out|help me understand)/i.test(
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
  let data: unknown[] | null = null;
  let error: { message?: string } | null = null;
  try {
    const result = await withTimeout(
      supabaseAdmin
        .from("lecture_sources")
        .select("lecture_title, course, professor, video_url")
        .ilike("course", `%${courseFilter}%`)
        .order("lecture_title", { ascending: true }),
      LECTURE_QUERY_TIMEOUT_MS,
      "Lecture course lookup timed out."
    );
    data = result.data;
    error = result.error;
  } catch (lookupError: unknown) {
    error = { message: lookupError instanceof Error ? lookupError.message : String(lookupError) };
  }

  if (error) {
    const fallback = await getPlaylistFallbackLectures(courseFilter);
    if (fallback.length > 0) return fallback;
    throw new Error(error.message);
  }

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

  const sorted = deduped.sort((a, b) => {
    const sectionDiff = lectureSortValue(a.lecture_title) - lectureSortValue(b.lecture_title);
    if (sectionDiff !== 0) return sectionDiff;
    return (a.lecture_title ?? "").localeCompare(b.lecture_title ?? "");
  });
  return sorted.length > 0 ? sorted : await getPlaylistFallbackLectures(courseFilter);
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
  // Knowledge base availability is global content, not user-owned content.
  // Verify that both the service-role path and the public anon path resolve the same counts.
  const publicClient = getPublicLectureSourceClient();
  const [adminResult, publicResult] = await Promise.all([
    queryLectureCourseCounts(supabaseAdmin, "admin"),
    publicClient
      ? queryLectureCourseCounts(publicClient, "public")
      : Promise.resolve({ counts: [] as LectureCourseCount[], error: "Missing anon client env." }),
  ]);

  logLectureCountVerification(
    adminResult.counts,
    publicResult.counts,
    adminResult.error,
    publicResult.error
  );

  if (adminResult.counts.length > 0 && publicResult.counts.length > 0) {
    return adminResult.counts.length >= publicResult.counts.length
      ? adminResult.counts
      : publicResult.counts;
  }

  if (adminResult.counts.length > 0) return adminResult.counts;
  if (publicResult.counts.length > 0) return publicResult.counts;

  return fallbackCourseCounts();
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
      "- PreCalc1",
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
    if (isVideoLookupIntent(message)) return knownVideoLookupReply(message);
    return "I don't have any matching lecture metadata in my database for that request.";
  }

  if (isVideoLookupIntent(message)) {
    const firstWithUrl =
      deduped.find((c) => isUsableVideoUrl(c.timestampUrl) && hasCredibleLectureTitleMatch(message, c.lectureTitle ?? "")) ??
      (hasSpecificLectureTitleRequest(message)
        ? undefined
        : deduped.find((c) => isUsableVideoUrl(c.timestampUrl)));
    if (!firstWithUrl) {
      const knownReply = knownVideoLookupReply(message);
      if (knownReply) return knownReply;
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

const LECTURE_TITLE_STOPWORDS = new Set([
  "lecture",
  "lectures",
  "teach",
  "summarize",
  "explain",
  "missed",
  "class",
  "called",
  "please",
  "real",
  "from",
  "with",
  "what",
  "cover",
  "covered",
  "wasnt",
  "wasn",
  "were",
  "have",
  "into",
]);

function lectureTitleTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/calculus\s*1|calc\s*1/g, "calculus1")
        .replace(/calculus\s*2|calc\s*2/g, "calculus2")
        .replace(/calculus\s*3|calc\s*3/g, "calculus3")
        .replace(/[^a-z0-9.]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => token.length >= 3 || /^\d+(?:\.\d+)?$/.test(token))
        .filter((token) => !LECTURE_TITLE_STOPWORDS.has(token))
    )
  );
}

function hasCredibleLectureTitleMatch(message: string, title: string): boolean {
  const requested = lectureTitleTokens(message);
  if (requested.length === 0) return true;

  const titleTokens = new Set(lectureTitleTokens(title));
  const meaningfulRequested = requested.filter(
    (token) =>
      /^\d+(?:\.\d+)?$/.test(token) ||
      token.includes("calculus") ||
      token.length >= 4
  );
  if (meaningfulRequested.length === 0) return true;

  const hits = meaningfulRequested.filter((token) => titleTokens.has(token));
  const requestedSections = meaningfulRequested.filter((token) => /^\d+(?:\.\d+)?$/.test(token));
  if (requestedSections.length > 0 && !requestedSections.some((token) => titleTokens.has(token))) {
    return false;
  }

  const hasSectionHit = hits.some((token) => /^\d+(?:\.\d+)?$/.test(token));
  const hasWordHit = hits.some((token) => !/^\d+(?:\.\d+)?$/.test(token));
  const explicitCalledRequest = /\bcalled\b/i.test(message);

  if (explicitCalledRequest) return hits.length >= 2 || (hasSectionHit && hasWordHit);
  return hits.length >= 2 || hasSectionHit || hasWordHit;
}

function hasSpecificLectureTitleRequest(message: string): boolean {
  const requested = lectureTitleTokens(message);
  return requested.some((token) => /^\d+(?:\.\d+)?$/.test(token)) || requested.length >= 2;
}

function chooseRepresentativeLectureContexts(contexts: string[], citations: LectureCitation[]) {
  const requestedTitle =
    citations.find((cite) => cite.lectureTitle && contexts.some((context) => {
      const title = extractLectureMetadata(context).title ?? "";
      return title === cite.lectureTitle;
    }))?.lectureTitle || "";
  const topTitle = requestedTitle || citations[0]?.lectureTitle || extractLectureMetadata(contexts[0] ?? "").title || "";
  const matching = contexts.filter((context) => {
    const title = extractLectureMetadata(context).title ?? "";
    return topTitle && title === topTitle;
  });

  return (matching.length ? matching : contexts).slice(0, 6);
}

function formatCitationTrailItem(cite: LectureCitation): string {
  const title = cite.lectureTitle ?? "Unknown lecture";
  const course = cite.course ?? "Unknown course";
  const time = formatSeconds(cite.timestampStartSeconds);
  const link = cite.timestampUrl ? ` -> ${cite.timestampUrl}` : "";
  return `${title} (${course}) @ ${time}${link}`;
}

function buildSourceTrailLines(citations: LectureCitation[], lectureTitle: string): string[] {
  const trail = uniqueLectures(dedupeCitations(citations)).slice(0, 4);
  if (trail.length === 0) return [];

  if (trail.length === 1) {
    return [
      "**Source Trail**",
      `- Focused clip: ${formatCitationTrailItem(trail[0])}`,
      "- Use this as the exact source for the recovered lecture, then use the timestamped evidence below for the board details.",
    ];
  }

  const labels = ["Foundational clip", "Main method clip", "Extension clip", "Review/application clip"];
  return [
    "**Source Trail**",
    ...trail.map((cite, index) => `- ${labels[index] ?? "Related clip"}: ${formatCitationTrailItem(cite)}`),
    `- These are related lecture anchors for **${lectureTitle}**. Treat them as a watch path, not proof that every clip says the same thing.`,
  ];
}

function buildVisualBoardMemoryLines({
  lectureTitle,
  course,
  lower,
}: {
  lectureTitle: string;
  course: string;
  lower: string;
}): string[] {
  const combined = `${course} ${lectureTitle} ${lower}`.toLowerCase();
  const hasVisualCue =
    /\b(graph|curve|board|draw|drawing|sketch|picture|axis|axes|table|horizontal|vertical|tangent|slope|derivative|rate of change|asymptote|left|right|top|bottom)\b/.test(
      combined
    );
  if (!hasVisualCue) return [];

  let anchor =
    "Use the visual cue as an anchor: identify the object on the board, name the relationship being shown, then connect that picture back to the rule.";

  if (/derivative|rate of change|differentiation|tangent|slope|horizontal/.test(combined)) {
    anchor =
      "Anchor the picture as a slope story: the curve is the object, the tangent line is the local measuring tool, and a horizontal tangent means slope 0.";
  } else if (/limit|continuity|continuous|asymptote/.test(combined)) {
    anchor =
      "Anchor the picture as approach behavior: trace where the graph heads from the left and right before deciding the limit or asymptote statement.";
  } else if (/integral|area|shell|washer|volume/.test(combined)) {
    anchor =
      "Anchor the picture as accumulation: identify the region, the representative slice or shell, and the direction the pieces are being added.";
  } else if (/vector|gradient|line|plane|surface|double integral|triple integral/.test(combined)) {
    anchor =
      "Anchor the picture spatially: name the axes or plane first, then say which vector, curve, or region is being measured.";
  } else if (/statistic|probability|boxplot|histogram|normal|distribution/.test(combined)) {
    anchor =
      "Anchor the visual as data shape: identify center, spread, tail behavior, or the marked probability region before computing.";
  }

  return [
    "**Visual/Board Memory**",
    anchor,
    "Do not invent a screen location. If a clip mentions left, right, top, or bottom, preserve that relationship; otherwise describe only the visible math relationship.",
  ];
}

function buildOfficeHoursCheckLines({
  lectureTitle,
  course,
}: {
  lectureTitle: string;
  course: string;
}): string[] {
  const combined = `${course} ${lectureTitle}`.toLowerCase();
  let prompt =
    "Before rewatching, cover the solution and say the first rule, definition, or method the board is asking for.";

  if (/derivative|rate of change|differentiation/.test(combined)) {
    prompt =
      "If I hide the formula, can you explain why the derivative is slope/change first, then choose the shortcut rule second?";
  } else if (/series|power series|radius|interval of convergence|alternating/.test(combined)) {
    prompt =
      "Can you name the convergence test before doing algebra, and can you say what must be checked after the main test finishes?";
  } else if (/integral|integration|antiderivative|area|substitution|parts/.test(combined)) {
    prompt =
      "Can you identify whether this is accumulation, a basic antiderivative, substitution, or parts before touching the algebra?";
  } else if (/differential equation|difeq|diff eq|ode|laplace|homogeneous|nonhomogeneous/.test(combined)) {
    prompt =
      "Can you classify the differential equation first, then explain why that classification chooses the method?";
  } else if (/linear algebra|matrix|matrices|determinant|eigen|vector|row reduction/.test(combined)) {
    prompt =
      "Can you name the matrix task first: row reduction, determinant, multiplication, vector relation, or eigenvalue?";
  } else if (/statistic|statistics|probability|mean|variance|standard deviation|normal|z-score|confidence/.test(combined)) {
    prompt =
      "Can you identify the measured quantity and interpret the result in context, not just compute the number?";
  } else if (/algebra|factor|quadratic|polynomial|rational|synthetic|system/.test(combined)) {
    prompt =
      "Can you explain which form makes the next move easiest: factored form, expanded form, solved form, or a substituted system?";
  } else if (/trig|sine|cosine|tangent|unit circle|identity/.test(combined)) {
    prompt =
      "Can you name the identity or unit-circle fact before rewriting the expression?";
  }

  return [
    "**Office Hours Check**",
    prompt,
  ];
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
  if (!isLectureRecoveryIntent(message) || ragContext.length === 0) return null;

  const credibleContexts = ragContext.filter((context) => {
    const title = extractLectureMetadata(context).title ?? "";
    return title && hasCredibleLectureTitleMatch(message, title);
  });
  const relevantContexts = credibleContexts.length
    ? chooseRepresentativeLectureContexts(credibleContexts, citations)
    : chooseRepresentativeLectureContexts(ragContext, citations);
  const metadata = extractLectureMetadata(relevantContexts[0] ?? "");
  const firstCitation = citations.find((cite) => cite.lectureTitle === metadata.title) ?? citations[0];
  const lectureTitle = metadata.title ?? firstCitation?.lectureTitle ?? "the retrieved lecture";
  const course = metadata.course ?? firstCitation?.course ?? "Unknown course";
  const professor = metadata.professor ?? firstCitation?.professor ?? "Unknown professor";
  const watch = firstCitation?.timestampUrl ? `\nWatch from here: ${firstCitation.timestampUrl}` : "";

  if (!hasCredibleLectureTitleMatch(message, lectureTitle)) {
    return [
      "I do not have lecture retrieval context for that specific lecture.",
      "",
      "Give me a real course, topic, or lecture title from the indexed lectures and I can reconstruct it from the transcript instead of inventing details.",
    ].join("\n");
  }

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
  const scope = `${course} ${lectureTitle}`.toLowerCase();
  const isDerivativeScope = /derivative|rate of change|differentiation/.test(scope);
  const isLimitScope = /limit|continuity|continuous/.test(scope);
  const isSeriesScope = /series|power series|radius|interval of convergence/.test(scope);
  const isIntegralScope = /integral|integration|antiderivative|area|substitution|parts/.test(scope);
  const isDiffEqScope = /differential equation|difeq|diff eq|ode|laplace|homogeneous|nonhomogeneous/.test(scope);
  const isLinearAlgebraScope = /linear algebra|matrix|matrices|determinant|eigen|vector|row reduction/.test(scope);
  const isStatsScope = /statistic|statistics|probability|mean|variance|standard deviation|normal|z-score|confidence|intro to statistics/.test(scope);
  const isAlgebraScope = /algebra|factor|quadratic|polynomial|rational|synthetic|system/.test(scope);
  const isTrigScope = /trig|sine|cosine|tangent|unit circle|identity/.test(scope);
  const keyIdeas: string[] = [];

  if (isDerivativeScope && /derivative as a function|function has its own derivative|derivative is a function/.test(lower)) {
    keyIdeas.push("The derivative is treated as its own function, not just a number at one point.");
  }
  if (isDerivativeScope && /limit h goes to 0|limit procedure|x plus h/.test(lower)) {
    keyIdeas.push("The lecture connects derivatives back to the limit process with h approaching 0.");
  }
  if (isDerivativeScope && /slope|tangent line|horizontal/.test(lower)) {
    keyIdeas.push("A derivative measures slope/change, so horizontal tangent lines give derivative value 0.");
  }
  if (isDerivativeScope && /average speed|average rate|secant|rate of change/.test(lower)) {
    keyIdeas.push("Average rate of change uses a secant line; the derivative gives instantaneous rate of change.");
  }
  if (isDerivativeScope && /constant.*0|change of a constant is 0|no change/.test(lower)) {
    keyIdeas.push("Constants have derivative 0 because there is no change.");
  }
  if (isDerivativeScope && /vertical asymptote|asymptote/.test(lower)) {
    keyIdeas.push("The lecture notes that vertical asymptotes can be preserved when comparing a function and its derivative.");
  }
  if (isDerivativeScope && /min|max|minimum|maximum/.test(lower)) {
    keyIdeas.push("Minimum and maximum points are tied to derivative value 0 when the tangent line is horizontal.");
  }
  if (isLimitScope) {
    keyIdeas.push("Limits ask what value a function approaches, so the first move is deciding whether direct substitution works.");
  }
  if (isSeriesScope) {
    keyIdeas.push("Series lectures usually separate three jobs: identify the series form, test convergence, then check endpoints when needed.");
  }
  if (isSeriesScope && /alternating|ast|decreasing|b_n|limit.*0|converges/.test(lower)) {
    keyIdeas.push("For alternating series, the board logic is to isolate the positive b_n, check that it decreases, and check that its limit is 0.");
  }
  if (isIntegralScope) {
    keyIdeas.push("Integration lectures focus on choosing the right accumulation or antiderivative method before doing algebra.");
  }
  if (isDiffEqScope) {
    keyIdeas.push("Differential equations ask for an unknown function, so classifying the equation comes before solving.");
  }
  if (isLinearAlgebraScope) {
    keyIdeas.push("Linear algebra lectures focus on the object first: matrix operation, vector relation, determinant, eigenvalue, or row reduction.");
  }
  if (isStatsScope) {
    keyIdeas.push("Statistics lectures start by identifying what quantity is being measured and what context the number must be interpreted in.");
  }
  if (isAlgebraScope) {
    keyIdeas.push("Algebra lectures focus on changing form without changing value, then using the form that makes the next step easier.");
  }
  if (isTrigScope) {
    keyIdeas.push("Trig lectures usually depend on identities, unit-circle structure, and rewriting expressions into a usable form.");
  }

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
    ...buildGroundedLectureWalkthrough({ lectureTitle, course, lower, keyIdeas, excerpts }),
    "",
    ...buildVisualBoardMemoryLines({ lectureTitle, course, lower }),
    "",
    ...buildOfficeHoursCheckLines({ lectureTitle, course }),
    "",
    ...buildSourceTrailLines(citations, lectureTitle),
    "",
    "**Source Evidence**",
    ...evidenceLines,
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
  isVideoLookupIntent,
  isLectureCountIntent,
  isLectureListIntent,
  isUsableVideoUrl,
};
