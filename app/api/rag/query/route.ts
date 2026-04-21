export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectCourseFilter, inferCourseFromMathTopic } from "@/lib/courseFilters";

type RagRequest = {
  question?: string;
  lectureMode?: boolean;
  maxChunks?: number;
  maxStyleSnippets?: number;
  minSimilarity?: number;
  courseFilter?: string;
  professorFilter?: string;
};

type ChunkRow = {
  id: string;
  source_id: string;
  clean_text: string;
  timestamp_start_seconds: number;
  timestamp_end_seconds: number;
  section_hint: string | null;
  similarity: number;
  lecture_title?: string;
  professor?: string;
  course?: string;
  video_url?: string;
};

type StyleRow = {
  source_id: string;
  snippet_text: string;
  persona_tag: string;
  timestamp_start_seconds: number;
  similarity: number;
};

type SourceRow = {
  id: string;
  lecture_title: string;
  video_url: string;
  professor: string;
  course: string;
};

type SourceIdRow = Pick<SourceRow, "id">;

const MAX_CONTEXT_CHARS = 1800;
const MAX_CITATION_EXCERPT_CHARS = 600;
const MAX_NEIGHBOR_WINDOW_SECONDS = 180;

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
]);

function truncateText(value: string, maxChars: number) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sliced = cleaned.slice(0, maxChars);
  const lastSentence = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("?"),
    sliced.lastIndexOf("!")
  );
  if (lastSentence >= 240) return `${sliced.slice(0, lastSentence + 1)} ...`;
  return `${sliced.trimEnd()} ...`;
}

function extractKeywords(question: string) {
  const base = Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .filter((w) => !STOP_WORDS.has(w))
    )
  );

  const aliases: string[] = [];
  if (/\bchain rule\b/i.test(question)) aliases.push("composite", "derivative");
  if (/\bu[-\s]?substitution\b|\bu[-\s]?sub\b/i.test(question)) aliases.push("substitution", "integral");
  if (/\bintegration by parts\b/i.test(question)) aliases.push("parts", "integral");
  if (/\brelated rates\b/i.test(question)) aliases.push("implicit", "time", "differentiate");
  if (/\bsecond derivative\b|\bconcavity\b|\binflection\b/i.test(question)) aliases.push("concavity", "inflection", "derivative");
  if (/\bratio test\b/i.test(question)) aliases.push("series", "convergence");
  if (/\bcomparison test\b/i.test(question)) aliases.push("series", "convergence");
  if (/\btaylor\b|\bmaclaurin\b/i.test(question)) aliases.push("polynomial", "approximation", "series");
  if (/\bslope field\b/i.test(question)) aliases.push("differential", "solution");
  if (/\bbayes\b|\bposterior\b|\bprior\b/i.test(question)) aliases.push("probability", "conditional", "posterior", "prior");
  if (/\boverfitting\b|\bregularization\b|\bbias[-\s]?variance\b/i.test(question)) {
    aliases.push("variance", "bias");
  }
  if (/\blearning rate\b|\bgradient descent\b/i.test(question)) aliases.push("gradient", "optimization", "minimum");
  if (/\bbackpropagation\b|\bbackprop\b/i.test(question)) aliases.push("derivative", "chain", "partial");
  if (/\battention\b|\btransformer\b/i.test(question)) aliases.push("attention", "weights", "sequence");

  return Array.from(new Set([...base, ...aliases])).slice(0, 10);
}

function embeddingInputForQuestion(question: string, courseFilter: string, keywords: string[]) {
  return [
    question,
    courseFilter ? `Course filter: ${courseFilter}` : "",
    keywords.length ? `Important retrieval terms: ${keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function toVideoTimestampUrl(url: string, seconds: number) {
  if (!isUsableVideoUrl(url)) return null;
  const safe = Math.max(0, Math.floor(seconds));
  if (url.includes("?")) return `${url}&t=${safe}s`;
  return `${url}?t=${safe}s`;
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

function chunkKey(chunk: Pick<ChunkRow, "source_id" | "timestamp_start_seconds" | "timestamp_end_seconds">) {
  return `${chunk.source_id}:${chunk.timestamp_start_seconds}:${chunk.timestamp_end_seconds}`;
}

function keywordPattern(keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|ed|ing)?\\b`, "i");
}

function scoreKeywordChunk(text: string, keywords: string[]) {
  const haystack = text.toLowerCase();
  const hits = keywords.filter((keyword) => keywordPattern(keyword).test(text)).length;
  const phraseHits = keywords
    .slice(0, -1)
    .filter((keyword, i) => haystack.includes(`${keyword} ${keywords[i + 1]}`)).length;
  return Math.min(0.88, 0.62 + hits * 0.06 + phraseHits * 0.08);
}

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.filter((keyword) => keywordPattern(keyword).test(text)).length;
}

function countPhraseHits(text: string, phrases: string[]) {
  const haystack = text.toLowerCase();
  return phrases.filter((phrase) => haystack.includes(phrase.toLowerCase())).length;
}

function hybridChunkScore({
  chunk,
  source,
  keywords,
  phrases,
}: {
  chunk: ChunkRow;
  source?: SourceRow;
  keywords: string[];
  phrases: string[];
}) {
  const chunkText = chunk.clean_text ?? "";
  const titleText = source?.lecture_title ?? "";
  const sectionText = chunk.section_hint ?? "";
  const keywordHits = countKeywordHits(chunkText, keywords);
  const titleHits = countKeywordHits(titleText, keywords);
  const sectionHits = countKeywordHits(sectionText, keywords);
  const phraseHits = countPhraseHits(`${titleText} ${sectionText} ${chunkText}`, phrases);
  const lexicalBoost =
    Math.min(keywordHits, 6) * 0.035 +
    Math.min(titleHits, 4) * 0.055 +
    Math.min(sectionHits, 3) * 0.04 +
    Math.min(phraseHits, 3) * 0.07;

  return Math.min(1.25, chunk.similarity * 0.78 + lexicalBoost);
}

function selectDiverseChunks({
  candidates,
  sourceMap,
  keywords,
  phrases,
  maxChunks,
}: {
  candidates: ChunkRow[];
  sourceMap: Map<string, SourceRow>;
  keywords: string[];
  phrases: string[];
  maxChunks: number;
}) {
  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: hybridChunkScore({
        chunk,
        source: sourceMap.get(chunk.source_id),
        keywords,
        phrases,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const selected: ChunkRow[] = [];
  const perSource = new Map<string, number>();

  for (const item of scored) {
    const sourceCount = perSource.get(item.chunk.source_id) ?? 0;
    const nearDuplicate = selected.some(
      (picked) =>
        picked.source_id === item.chunk.source_id &&
        Math.abs(picked.timestamp_start_seconds - item.chunk.timestamp_start_seconds) < 45
    );
    if (nearDuplicate) continue;
    if (sourceCount >= 3 && selected.length < Math.max(3, Math.floor(maxChunks * 0.75))) {
      continue;
    }

    selected.push({ ...item.chunk, similarity: item.score });
    perSource.set(item.chunk.source_id, sourceCount + 1);
    if (selected.length >= maxChunks) return selected;
  }

  for (const item of scored) {
    if (selected.some((chunk) => chunkKey(chunk) === chunkKey(item.chunk))) continue;
    selected.push({ ...item.chunk, similarity: item.score });
    if (selected.length >= maxChunks) break;
  }

  return selected;
}

function retrievalQuality(chunks: ChunkRow[]) {
  const topSimilarity = chunks[0]?.similarity ?? 0;
  const averageTopSimilarity =
    chunks.length > 0
      ? chunks.slice(0, 3).reduce((sum, chunk) => sum + chunk.similarity, 0) /
      Math.min(chunks.length, 3)
      : 0;

  const confidence =
    topSimilarity >= 0.82 && chunks.length >= 3
      ? "high"
      : topSimilarity >= 0.62 && chunks.length >= 2
        ? "medium"
        : chunks.length > 0
          ? "low"
          : "none";

  return {
    confidence,
    topSimilarity,
    averageTopSimilarity,
    selectedChunkCount: chunks.length,
  };
}

function isRpcSignatureError(message: string) {
  return /function .* does not exist|could not find the function|schema cache/i.test(message);
}

async function matchLectureChunks({
  queryEmbedding,
  matchCount,
  courseFilter,
  professorFilter,
}: {
  queryEmbedding: number[];
  matchCount: number;
  courseFilter: string;
  professorFilter: string;
}) {
  const filtered = await supabaseAdmin.rpc("match_lecture_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_course: courseFilter || null,
    filter_professor: professorFilter || null,
    filter_source_id: null,
  });

  if (!filtered.error || !isRpcSignatureError(filtered.error.message)) {
    return filtered;
  }

  return supabaseAdmin.rpc("match_lecture_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });
}

async function matchPersonaSnippets({
  queryEmbedding,
  matchCount,
  courseFilter,
  professorFilter,
}: {
  queryEmbedding: number[];
  matchCount: number;
  courseFilter: string;
  professorFilter: string;
}) {
  const filtered = await supabaseAdmin.rpc("match_persona_snippets", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_course: courseFilter || null,
    filter_professor: professorFilter || null,
    filter_source_id: null,
  });

  if (!filtered.error || !isRpcSignatureError(filtered.error.message)) {
    return filtered;
  }

  return supabaseAdmin.rpc("match_persona_snippets", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });
}

async function fetchNeighborChunks(seedChunks: ChunkRow[]) {
  const seeds = seedChunks.slice(0, 6);
  const results = await Promise.all(
    seeds.map(async (seed) => {
      const start = Math.max(0, seed.timestamp_start_seconds - MAX_NEIGHBOR_WINDOW_SECONDS);
      const end = seed.timestamp_end_seconds + MAX_NEIGHBOR_WINDOW_SECONDS;
      const { data, error } = await supabaseAdmin
        .from("lecture_chunks")
        .select(
          "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
        )
        .eq("source_id", seed.source_id)
        .gte("timestamp_start_seconds", start)
        .lte("timestamp_start_seconds", end)
        .order("timestamp_start_seconds", { ascending: true })
        .limit(8);

      if (error) {
        return { data: [] as ChunkRow[], error: error.message };
      }

      const neighborRows = ((data || []) as Omit<ChunkRow, "similarity">[]).map((row) => {
        const distance = Math.abs(row.timestamp_start_seconds - seed.timestamp_start_seconds);
        const penalty = Math.min(0.16, distance / 1500);
        return {
          ...row,
          similarity: Math.max(0.48, seed.similarity - 0.06 - penalty),
        };
      });

      return { data: neighborRows, error: null };
    })
  );

  return {
    data: results.flatMap((result) => result.data),
    errors: results.map((result) => result.error).filter((error): error is string => !!error),
  };
}

export async function POST(req: Request) {
  try {
    const body: RagRequest = await req.json();
    const question = body.question?.trim() || "";
    const maxChunks = Math.min(Math.max(body.maxChunks ?? 8, 1), 15);
    const maxStyleSnippets = Math.min(Math.max(body.maxStyleSnippets ?? 3, 1), 6);
    const minSimilarity = Math.min(Math.max(body.minSimilarity ?? 0.2, 0), 1);
    const rawCourseFilter = body.courseFilter?.trim() || "";
    const courseFilter = rawCourseFilter
      ? detectCourseFilter(rawCourseFilter, rawCourseFilter) ?? rawCourseFilter
      : inferCourseFromMathTopic(question) ?? "";
    const professorFilter = body.professorFilter?.trim() || "";
    const isDevLog = process.env.NODE_ENV !== "production";
    const keywords = extractKeywords(question);
    const keywordPhrases = keywords
      .slice(0, -1)
      .map((keyword, i) => `${keyword} ${keywords[i + 1]}`);


    if (!question) {
      return NextResponse.json(
        { error: "Please provide a question for retrieval." },
        { status: 400 }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
    if (!openaiApiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is required for RAG embeddings. Add it to your environment to enable retrieval.",
        },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: embeddingInputForQuestion(question, courseFilter, keywords),
    });
    const embedding = embeddingRes.data?.[0]?.embedding;
    if (!embedding) {
      return NextResponse.json(
        { error: "Embedding generation failed." },
        { status: 500 }
      );
    }

    const keywordFilter = keywords.map((k) => `clean_text.ilike.%${k}%`).join(",");
    const phraseFilter = keywordPhrases
      .map((phrase) => `clean_text.ilike.%${phrase}%`)
      .join(",");
    const anyFilterRequested = !!courseFilter || !!professorFilter;

    let requestedSourceIdSet: Set<string> | null = null;
    if (anyFilterRequested) {
      let sourceFilterQuery = supabaseAdmin.from("lecture_sources").select("id");
      if (courseFilter) {
        sourceFilterQuery = sourceFilterQuery.ilike("course", `%${courseFilter}%`);
      }
      if (professorFilter) {
        sourceFilterQuery = sourceFilterQuery.ilike("professor", `%${professorFilter}%`);
      }

      const { data: requestedSourceRows, error: requestedSourceErr } =
        await sourceFilterQuery.limit(200);
      if (requestedSourceErr) {
        return NextResponse.json(
          { error: `Source filter lookup failed: ${requestedSourceErr.message}` },
          { status: 500 }
        );
      }
      requestedSourceIdSet = new Set(
        ((requestedSourceRows as SourceIdRow[]) || []).map((row) => row.id)
      );
    }

    if (anyFilterRequested && requestedSourceIdSet && requestedSourceIdSet.size === 0) {
      return NextResponse.json({
        question,
        lectureMode: body.lectureMode ?? true,
        retrievalMode: keywords.length > 0 ? "hybrid" : "vector-only",
        retrievalConfidence: "none",
        keywords,
        context: [],
        styleSnippets: [],
        citations: [],
        retrievalDiagnostics: {
          selectedChunkKeys: [],
          vectorTopChunkKeys: [],
          keywordTopChunkKeys: [],
          topSimilarityScores: [],
          filters: {
            courseFilter: courseFilter || null,
            professorFilter: professorFilter || null,
            courseFilterApplied: false,
            professorFilterApplied: false,
            filterFallbackUsed: false,
            filteredSourceCount: 0,
            requestedSourceCandidates: 0,
            noSourceCandidates: true,
            minSimilarityUsed: minSimilarity,
            droppedLowSimilarityCount: 0,
          },
        },
      });
    }

    const [
      { data: chunksData, error: chunkErr },
      { data: styleData, error: styleErr },
      { data: keywordData, error: keywordErr },
      { data: phraseKeywordData, error: phraseKeywordErr },
      { data: titleKeywordData, error: titleKeywordErr },
    ] = await Promise.all([
      matchLectureChunks({
          queryEmbedding: embedding,
          matchCount: Math.min(40, Math.max(maxChunks * 4, 16)),
          courseFilter,
          professorFilter,
        }),
      matchPersonaSnippets({
        queryEmbedding: embedding,
        matchCount: maxStyleSnippets,
        courseFilter,
        professorFilter,
      }),
      keywords.length > 0
        ? (() => {
          let keywordQuery = supabaseAdmin
            .from("lecture_chunks")
            .select(
              "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
            )
            .or(keywordFilter)
            .limit(Math.max(50, maxChunks * 10));

          if (requestedSourceIdSet && requestedSourceIdSet.size > 0) {
            keywordQuery = keywordQuery.in(
              "source_id",
              Array.from(requestedSourceIdSet)
            );
          }
          return keywordQuery;
        })()
        : Promise.resolve({ data: [], error: null }),
      phraseFilter
        ? (() => {
          let phraseQuery = supabaseAdmin
            .from("lecture_chunks")
            .select(
              "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
            )
            .or(phraseFilter)
            .limit(Math.max(20, maxChunks * 4));

          if (requestedSourceIdSet && requestedSourceIdSet.size > 0) {
            phraseQuery = phraseQuery.in(
              "source_id",
              Array.from(requestedSourceIdSet)
            );
          }
          return phraseQuery;
        })()
        : Promise.resolve({ data: [], error: null }),
      keywords.length > 0
        ? (async () => {
          let titleQuery = supabaseAdmin
            .from("lecture_sources")
            .select("id, lecture_title")
            .or(keywords.map((k) => `lecture_title.ilike.%${k}%`).join(","))
            .limit(200);

          if (courseFilter) {
            titleQuery = titleQuery.ilike("course", `%${courseFilter}%`);
          }
          if (professorFilter) {
            titleQuery = titleQuery.ilike("professor", `%${professorFilter}%`);
          }

          const { data: titleSources, error: titleSourceErr } = await titleQuery;
          if (titleSourceErr) return { data: [], error: titleSourceErr };

          const rankedTitleSources = (
            (titleSources as Array<SourceIdRow & Pick<SourceRow, "lecture_title">>) || []
          )
            .map((row) => ({
              id: row.id,
              hits: countKeywordHits(row.lecture_title ?? "", keywords),
            }))
            .filter((row) => row.hits > 0)
            .sort((a, b) => b.hits - a.hits);
          const bestTitleHits = rankedTitleSources[0]?.hits ?? 0;
          const titleSourceIds =
            bestTitleHits >= 2
              ? rankedTitleSources
                .filter((row) => row.hits === bestTitleHits || row.hits >= 2)
                .slice(0, 10)
                .map((row) => row.id)
              : [];
          if (titleSourceIds.length === 0) return { data: [], error: null };

          return supabaseAdmin
            .from("lecture_chunks")
            .select(
              "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
            )
            .in("source_id", titleSourceIds)
            .limit(Math.max(20, maxChunks * 4));
        })()
        : Promise.resolve({ data: [], error: null }),
    ]);

    const vectorRetrievalError = chunkErr?.message ?? null;

    if (isDevLog) {
      console.log("lectureMatches", chunksData ?? []);
      console.log("lectureError", chunkErr ?? null);
    }
    const styleRetrievalError = styleErr?.message ?? null;
    if (styleErr && isDevLog) {
      console.log("personaError", styleErr);
    }
    if (keywordErr) {
      return NextResponse.json(
        { error: `Keyword retrieval failed: ${keywordErr.message}` },
        { status: 500 }
      );
    }
    if (phraseKeywordErr) {
      return NextResponse.json(
        { error: `Phrase keyword retrieval failed: ${phraseKeywordErr.message}` },
        { status: 500 }
      );
    }
    if (titleKeywordErr) {
      return NextResponse.json(
        { error: `Title keyword retrieval failed: ${titleKeywordErr.message}` },
        { status: 500 }
      );
    }

    const vectorChunks = (chunksData || []) as ChunkRow[];
    const keywordChunks = [
      ...((keywordData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
      ...c,
      similarity: scoreKeywordChunk(c.clean_text, keywords),
      })),
      ...((phraseKeywordData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
        ...c,
        similarity: Math.max(0.92, scoreKeywordChunk(c.clean_text, keywords)),
      })),
      ...((titleKeywordData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
        ...c,
        similarity: Math.max(0.9, scoreKeywordChunk(c.clean_text, keywords)),
      })),
    ];

    const initialChunkMap = new Map<string, ChunkRow>();
    for (const row of [...vectorChunks, ...keywordChunks]) {
      const key = chunkKey(row);
      const prev = initialChunkMap.get(key);
      if (!prev || row.similarity > prev.similarity) {
        initialChunkMap.set(key, row);
      }
    }

    const initialCandidates = Array.from(initialChunkMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.min(40, Math.max(maxChunks * 4, 16)));
    const neighborResult = await fetchNeighborChunks(initialCandidates);
    const chunkMap = new Map<string, ChunkRow>();
    for (const row of [...initialCandidates, ...neighborResult.data]) {
      const key = chunkKey(row);
      const prev = chunkMap.get(key);
      if (!prev || row.similarity > prev.similarity) {
        chunkMap.set(key, row);
      }
    }

    const chunks = Array.from(chunkMap.values());
    const styleSnippets = (styleData || []) as StyleRow[];
    const sourceIds = Array.from(
      new Set([...chunks.map((c) => c.source_id), ...styleSnippets.map((s) => s.source_id)])
    );

    const { data: sourceRows, error: sourceErr } = sourceIds.length
      ? await supabaseAdmin
        .from("lecture_sources")
        .select("id, lecture_title, video_url, professor, course")
        .in("id", sourceIds)
      : { data: [], error: null };

    if (sourceErr) {
      return NextResponse.json(
        { error: `Source metadata retrieval failed: ${sourceErr.message}` },
        { status: 500 }
      );
    }

    const sourceMap = new Map<string, SourceRow>(
      ((sourceRows as SourceRow[]) || []).map((row) => [row.id, row])
    );

    const matchesSourceFilters = (sourceId: string) => {
      if (!courseFilter && !professorFilter) return true;
      if (requestedSourceIdSet) {
        return requestedSourceIdSet.has(sourceId);
      }
      const source = sourceMap.get(sourceId);
      if (!source) return false;
      const coursePass = courseFilter
        ? source.course.toLowerCase().includes(courseFilter.toLowerCase())
        : true;
      const professorPass = professorFilter
        ? source.professor.toLowerCase().includes(professorFilter.toLowerCase())
        : true;
      return coursePass && professorPass;
    };

    const filteredChunks = chunks.filter((chunk) => matchesSourceFilters(chunk.source_id));
    const filteredStyleSnippets = styleSnippets.filter((snippet) =>
      matchesSourceFilters(snippet.source_id)
    );
    const filteredSourceIds = new Set<string>([
      ...filteredChunks.map((chunk) => chunk.source_id),
      ...filteredStyleSnippets.map((snippet) => snippet.source_id),
    ]);
    const scopedChunksPreThreshold = anyFilterRequested ? filteredChunks : chunks;
    const thresholdedCandidateChunks = scopedChunksPreThreshold.filter(
      (chunk) => chunk.similarity >= minSimilarity
    );
    const droppedLowSimilarityCount =
      scopedChunksPreThreshold.length - thresholdedCandidateChunks.length;
    const scopedChunks = selectDiverseChunks({
      candidates: thresholdedCandidateChunks,
      sourceMap,
      keywords,
      phrases: keywordPhrases,
      maxChunks,
    });
    const scopedStyleSnippets = anyFilterRequested
      ? filteredStyleSnippets
      : styleSnippets;
    const anyFilterApplied = filteredSourceIds.size > 0;

    const context = scopedChunks.map((chunk, i) => {
        const source = sourceMap.get(chunk.source_id);
        return `Chunk ${i + 1}
Course: ${source?.course ?? "Unknown course"}
Lecture: ${source?.lecture_title ?? "Unknown lecture"}
Professor: ${source?.professor ?? "Unknown professor"}
Timestamp: ${chunk.timestamp_start_seconds}s-${chunk.timestamp_end_seconds}s
Section: ${chunk.section_hint ?? "Unknown"}
Similarity: ${chunk.similarity.toFixed(3)}

${truncateText(chunk.clean_text, MAX_CONTEXT_CHARS)}`;
      })
      .slice(0, maxChunks);

    if (isDevLog) {
      console.log("lectureContext", context.join("\n\n---\n\n"));
    }


    const citations = scopedChunks.map((chunk) => {
      const source = sourceMap.get(chunk.source_id);
      return {
        sourceId: chunk.source_id,
        lectureTitle: source?.lecture_title ?? "Unknown lecture",
        professor: source?.professor ?? "Unknown professor",
        course: source?.course ?? "Unknown course",
        videoUrl: isUsableVideoUrl(source?.video_url) ? source.video_url : "",
        timestampStartSeconds: chunk.timestamp_start_seconds,
        timestampEndSeconds: chunk.timestamp_end_seconds,
        timestampUrl: isUsableVideoUrl(source?.video_url)
          ? toVideoTimestampUrl(source.video_url, chunk.timestamp_start_seconds)
          : null,
        excerpt: truncateText(chunk.clean_text, MAX_CITATION_EXCERPT_CHARS),
        sectionHint: chunk.section_hint,
        similarity: chunk.similarity,
      };
    });
    const quality = retrievalQuality(scopedChunks);

    return NextResponse.json({
      question,
      lectureMode: body.lectureMode ?? true,
      retrievalMode: keywords.length > 0 ? "hybrid" : "vector-only",
      retrievalConfidence: quality.confidence,
      keywords,
      context,
      styleSnippets: scopedStyleSnippets.map((s) => ({
        sourceId: s.source_id,
        text: s.snippet_text,
        personaTag: s.persona_tag,
        timestampStartSeconds: s.timestamp_start_seconds,
        similarity: s.similarity,
      })),
      citations,
      retrievalDiagnostics: {
        quality,
        selectedChunkKeys: scopedChunks.map((chunk) => chunkKey(chunk)),
        vectorTopChunkKeys: vectorChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        keywordTopChunkKeys: keywordChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        neighborChunkKeys: neighborResult.data.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        neighborRetrievalErrors: neighborResult.errors,
        candidateCounts: {
          vector: vectorChunks.length,
          keyword: keywordChunks.length,
          initialMerged: initialCandidates.length,
          neighbors: neighborResult.data.length,
          thresholded: thresholdedCandidateChunks.length,
        },
        topSimilarityScores: scopedChunks.slice(0, 5).map((chunk) => ({
          key: chunkKey(chunk),
          similarity: chunk.similarity,
        })),
        filters: {
          courseFilter: courseFilter || null,
          professorFilter: professorFilter || null,
          courseFilterApplied: !!courseFilter && anyFilterApplied,
          professorFilterApplied: !!professorFilter && anyFilterApplied,
          filterFallbackUsed: false,
          filteredSourceCount: filteredSourceIds.size,
          requestedSourceCandidates: requestedSourceIdSet?.size ?? null,
          noSourceCandidates: false,
          minSimilarityUsed: minSimilarity,
          droppedLowSimilarityCount,
          vectorRetrievalError,
          styleRetrievalError,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
