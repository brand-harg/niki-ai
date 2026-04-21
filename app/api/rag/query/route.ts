export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

type RagRequest = {
  question?: string;
  lectureMode?: boolean;
  maxChunks?: number;
  maxStyleSnippets?: number;
  courseFilter?: string;
  professorFilter?: string;
};

type ChunkRow = {
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

function extractKeywords(question: string) {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .filter(
          (w) =>
            !["what", "when", "where", "which", "with", "from", "that", "this", "into"].includes(w)
        )
    )
  ).slice(0, 6);
}

function toVideoTimestampUrl(url: string, seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  if (url.includes("?")) return `${url}&t=${safe}s`;
  return `${url}?t=${safe}s`;
}

function chunkKey(
  chunk: Pick<ChunkRow, "source_id" | "timestamp_start_seconds" | "timestamp_end_seconds">
) {
  return `${chunk.source_id}:${chunk.timestamp_start_seconds}:${chunk.timestamp_end_seconds}`;
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
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const embedding = embeddingRes.data?.[0]?.embedding;
    if (!embedding) {
      return NextResponse.json({ error: "Embedding generation failed." }, { status: 500 });
    }

    const keywords = extractKeywords(question);
    const keywordFilter = keywords.map((k) => `clean_text.ilike.%${k}%`).join(",");
    const anyFilterRequested = !!courseFilter || !!professorFilter;

    let requestedSourceIdSet: Set<string> | null = null;
    if (anyFilterRequested) {
      let sourceFilterQuery = supabase.from("lecture_sources").select("id");
      if (courseFilter) sourceFilterQuery = sourceFilterQuery.ilike("course", `%${courseFilter}%`);
      if (professorFilter)
        sourceFilterQuery = sourceFilterQuery.ilike("professor", `%${professorFilter}%`);

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
        retrievalMode: keywords.length > 0 ? "hybrid" : "vector-only",
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
          },
        },
      });
    }

    const [
      { data: chunksData, error: chunkErr },
      { data: styleData, error: styleErr },
      { data: keywordData, error: keywordErr },
    ] = await Promise.all([
      supabase.rpc("match_lecture_chunks", {
        query_embedding: embedding,
        match_count: maxChunks,
      }),
      supabase.rpc("match_persona_snippets", {
        query_embedding: embedding,
        match_count: maxStyleSnippets,
      }),
      keywords.length > 0
        ? (() => {
          let keywordQuery = supabase
            .from("lecture_chunks")
            .select(
              "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
            )
            .or(keywordFilter)
            .limit(maxChunks);

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

    const vectorChunks = (chunksData || []) as ChunkRow[];
    const keywordChunks = ((keywordData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
      ...c,
      similarity: 0.15,
    }));

    const chunkMap = new Map<string, ChunkRow>();
    for (const row of [...vectorChunks, ...keywordChunks]) {
      const key = chunkKey(row);
      const prev = chunkMap.get(key);
      if (!prev || row.similarity > prev.similarity) chunkMap.set(key, row);
    }

    const chunks = Array.from(chunkMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxChunks);
    const styleSnippets = (styleData || []) as StyleRow[];
    const sourceIds = Array.from(
      new Set([
        ...chunks.map((c) => c.source_id),
        ...styleSnippets.map((s) => s.source_id),
      ])
    );

    const { data: sourceRows, error: sourceErr } = sourceIds.length
      ? await supabase
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
      if (requestedSourceIdSet) return requestedSourceIdSet.has(sourceId);
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
    const scopedChunks = anyFilterRequested ? filteredChunks : chunks;
    const scopedStyleSnippets = anyFilterRequested ? filteredStyleSnippets : styleSnippets;
    const anyFilterApplied = filteredSourceIds.size > 0;

    const citations = scopedChunks.map((chunk) => {
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
      retrievalMode: keywords.length > 0 ? "hybrid" : "vector-only",
      keywords,
      context: scopedChunks.map((c) => c.clean_text),
      styleSnippets: scopedStyleSnippets.map((s) => ({
        sourceId: s.source_id,
        text: s.snippet_text,
        personaTag: s.persona_tag,
        timestampStartSeconds: s.timestamp_start_seconds,
        similarity: s.similarity,
      })),
      citations,
      retrievalDiagnostics: {
        selectedChunkKeys: scopedChunks.map((chunk) => chunkKey(chunk)),
        vectorTopChunkKeys: vectorChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        keywordTopChunkKeys: keywordChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
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
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}