export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RagRequest = {
  question?: string;
  lectureMode?: boolean;
  maxChunks?: number;
  maxStyleSnippets?: number;
  courseFilter?: string;
  professorFilter?: string;
};

type ChunkRow = {
  id?: string;
  source_id: string;
  clean_text: string;
  timestamp_start_seconds: number;
  timestamp_end_seconds: number;
  section_hint: string | null;
  similarity: number;
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

const STOPWORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "with",
  "from",
  "that",
  "this",
  "into",
  "teach",
  "teaching",
  "explain",
  "show",
  "tell",
  "about",
  "help",
  "learn",
]);

const MIN_TEXT_LENGTH = 10;
const MIN_VECTOR_TEXT_LENGTH = 20;
const MAX_CHUNK_DURATION_SECONDS = 120;
const FINAL_CONTEXT_CHUNKS = 8;

function extractKeywords(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .filter((w) => w.length >= 4)
        .filter((w) => !STOPWORDS.has(w))
    )
  ).slice(0, 6);
}

function normalizeKeyword(keyword: string): string {
  return keyword.endsWith("s") && keyword.length > 4 ? keyword.slice(0, -1) : keyword;
}

function toVideoTimestampUrl(url: string, seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (url.includes("?")) return `${url}&t=${safe}s`;
  return `${url}?t=${safe}s`;
}

function chunkKey(
  chunk: Pick<ChunkRow, "source_id" | "timestamp_start_seconds" | "timestamp_end_seconds">
): string {
  return `${chunk.source_id}:${chunk.timestamp_start_seconds}:${chunk.timestamp_end_seconds}`;
}

function isUsableChunk(
  chunk: Pick<ChunkRow, "clean_text" | "timestamp_start_seconds" | "timestamp_end_seconds">
): boolean {
  const text = chunk.clean_text?.trim() ?? "";
  const duration = Math.max(0, chunk.timestamp_end_seconds - chunk.timestamp_start_seconds);

  return text.length >= MIN_TEXT_LENGTH && duration <= MAX_CHUNK_DURATION_SECONDS;
}

function keywordScore(text: string, normalizedKeywords: string[]): number {
  const lowered = text.toLowerCase();
  const matchCount = normalizedKeywords.filter((k) => lowered.includes(k)).length;
  return 0.7 + matchCount * 0.1;
}

export async function POST(req: Request) {
  try {
    const body: RagRequest = await req.json();

    const question = body.question?.trim() || "";
    const maxChunks = Math.min(Math.max(body.maxChunks ?? 8, 1), 15);
    const maxStyleSnippets = Math.min(Math.max(body.maxStyleSnippets ?? 3, 1), 6);
    const courseFilter = body.courseFilter?.trim() || "";
    const professorFilter = body.professorFilter?.trim() || "";

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

    const keywords = extractKeywords(question);
    const normalizedKeywords = keywords.map(normalizeKeyword);

    const keywordFilterParts = Array.from(
      new Set(
        normalizedKeywords.flatMap((k) => [
          `clean_text.ilike.%${k}%`,
          `section_hint.ilike.%${k}%`,
        ])
      )
    );
    const keywordFilter = keywordFilterParts.join(",");

    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const embedding = embeddingRes.data?.[0]?.embedding;

    console.log("🔍 RAG query:", question);
    console.log("🔢 Embedding length:", embedding?.length);
    console.log("🔎 Keywords:", normalizedKeywords);

    if (!embedding) {
      return NextResponse.json(
        { error: "Embedding generation failed." },
        { status: 500 }
      );
    }

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
        ((requestedSourceRows as Pick<SourceRow, "id">[]) || []).map((row) => row.id)
      );
    }

    if (anyFilterRequested && requestedSourceIdSet && requestedSourceIdSet.size === 0) {
      return NextResponse.json({
        question,
        lectureMode: body.lectureMode ?? true,
        retrievalMode: normalizedKeywords.length > 0 ? "hybrid" : "vector-only",
        keywords: normalizedKeywords,
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
          },
        },
      });
    }

    const [
      { data: chunksData, error: chunkErr },
      { data: styleData, error: styleErr },
      { data: keywordData, error: keywordErr },
    ] = await Promise.all([
      supabaseAdmin.rpc("match_lecture_chunks", {
        query_embedding: embedding,
        match_count: maxChunks * 2,
      }),
      supabaseAdmin.rpc("match_persona_snippets", {
        query_embedding: embedding,
        match_count: maxStyleSnippets,
      }),
      normalizedKeywords.length > 0
        ? (() => {
            let keywordQuery = supabaseAdmin
              .from("lecture_chunks")
              .select(
                "id, source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
              )
              .or(keywordFilter)
              .limit(maxChunks * 3);

            if (requestedSourceIdSet && requestedSourceIdSet.size > 0) {
              keywordQuery = keywordQuery.in("source_id", Array.from(requestedSourceIdSet));
            }

            return keywordQuery;
          })()
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (chunkErr) {
      return NextResponse.json(
        { error: `Chunk retrieval failed: ${chunkErr.message}` },
        { status: 500 }
      );
    }

    if (styleErr) {
      return NextResponse.json(
        { error: `Persona retrieval failed: ${styleErr.message}` },
        { status: 500 }
      );
    }

    if (keywordErr) {
      return NextResponse.json(
        { error: `Keyword retrieval failed: ${keywordErr.message}` },
        { status: 500 }
      );
    }

    const rawVectorChunks = (chunksData || []) as ChunkRow[];

    const vectorChunks = rawVectorChunks
      .filter(isUsableChunk)
      .filter((c) => (c.clean_text?.trim().length ?? 0) >= MIN_VECTOR_TEXT_LENGTH);

    const keywordChunks = ((keywordData || []) as Omit<ChunkRow, "similarity">[])
      .filter(isUsableChunk)
      .map((c) => ({
        ...c,
        similarity: keywordScore(c.clean_text, normalizedKeywords),
      }));

    console.log("📦 Vector chunks:", vectorChunks.length);
    console.log("🔑 Keyword chunks:", keywordChunks.length);
    console.log("❌ Chunk error:", chunkErr);
    console.log("❌ Style error:", styleErr);
    console.log("❌ Keyword error:", keywordErr);
    console.log("raw vector chunk count:", rawVectorChunks.length);
    console.log("raw vector sample:", rawVectorChunks.slice(0, 3));
    

    const chunkMap = new Map<string, ChunkRow>();

    for (const row of [...vectorChunks, ...keywordChunks]) {
      const key = chunkKey(row);
      const prev = chunkMap.get(key);

      if (!prev || row.similarity > prev.similarity) {
        chunkMap.set(key, row);
      }
    }

    const mergedChunks = Array.from(chunkMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxChunks * 3);

    const styleSnippets = (styleData || []) as StyleRow[];

    const sourceIds = Array.from(
      new Set([
        ...mergedChunks.map((c) => c.source_id),
        ...styleSnippets.map((s) => s.source_id),
      ])
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

    const matchesSourceFilters = (sourceId: string): boolean => {
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

    const filteredChunks = mergedChunks.filter((chunk) =>
      matchesSourceFilters(chunk.source_id)
    );

    const filteredStyleSnippets = styleSnippets.filter((snippet) =>
      matchesSourceFilters(snippet.source_id)
    );

    const filteredSourceIds = new Set<string>([
      ...filteredChunks.map((chunk) => chunk.source_id),
      ...filteredStyleSnippets.map((snippet) => snippet.source_id),
    ]);

    const scopedChunks = filteredChunks.length > 0 ? filteredChunks : mergedChunks;
    const scopedStyleSnippets =
      filteredStyleSnippets.length > 0 ? filteredStyleSnippets : styleSnippets;

    const grouped = new Map<string, ChunkRow[]>();

    for (const chunk of scopedChunks as ChunkRow[]) {
      if (!grouped.has(chunk.source_id)) {
        grouped.set(chunk.source_id, []);
      }
      grouped.get(chunk.source_id)!.push(chunk);
    }

    const bestLectureChunks = (
      Array.from(grouped.values())
        .sort((a, b) => {
          const scoreA = a.reduce((sum: number, c: ChunkRow) => sum + c.similarity, 0);
          const scoreB = b.reduce((sum: number, c: ChunkRow) => sum + c.similarity, 0);
          return scoreB - scoreA;
        })[0] || []
    ) as ChunkRow[];

    const finalLectureChunks = bestLectureChunks.slice(0, FINAL_CONTEXT_CHUNKS);
    const context = finalLectureChunks.map((c: ChunkRow) => c.clean_text);

    const citations = finalLectureChunks.map((chunk) => {
      const source = sourceMap.get(chunk.source_id);

      return {
        sourceId: chunk.source_id,
        lectureTitle: source?.lecture_title ?? "Unknown lecture",
        professor: source?.professor ?? "Unknown professor",
        course: source?.course ?? "Unknown course",
        videoUrl: source?.video_url ?? "",
        timestampStartSeconds: chunk.timestamp_start_seconds,
        timestampEndSeconds: chunk.timestamp_end_seconds,
        timestampUrl: source?.video_url
          ? toVideoTimestampUrl(source.video_url, chunk.timestamp_start_seconds)
          : null,
        excerpt: chunk.clean_text,
        sectionHint: chunk.section_hint,
        similarity: chunk.similarity,
      };
    });

    return NextResponse.json({
      question,
      lectureMode: body.lectureMode ?? true,
      retrievalMode: normalizedKeywords.length > 0 ? "hybrid" : "vector-only",
      keywords: normalizedKeywords,
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
        selectedChunkKeys: finalLectureChunks.map((chunk) => chunkKey(chunk)),
        vectorTopChunkKeys: vectorChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        keywordTopChunkKeys: keywordChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        topSimilarityScores: finalLectureChunks.slice(0, 5).map((chunk) => ({
          key: chunkKey(chunk),
          similarity: chunk.similarity,
        })),
        filters: {
          courseFilter: courseFilter || null,
          professorFilter: professorFilter || null,
          courseFilterApplied: !!courseFilter && filteredSourceIds.size > 0,
          professorFilterApplied: !!professorFilter && filteredSourceIds.size > 0,
          filterFallbackUsed: anyFilterRequested && filteredSourceIds.size === 0,
          filteredSourceCount: filteredSourceIds.size,
          requestedSourceCandidates: requestedSourceIdSet?.size ?? null,
          noSourceCandidates: false,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}