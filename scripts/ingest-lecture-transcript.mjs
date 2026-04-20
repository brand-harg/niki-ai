import { readFileSync } from "node:fs";
import process from "node:process";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

function usage() {
    console.log(`
Usage:
  npm run rag:ingest -- --file ./transcripts/lecture-4.json --course "Calc 1" --title "Lecture 4" --videoUrl "https://youtu.be/..." --professor "Prof Name"
  npm run rag:ingest -- --file ./desktop_batch_processed.json --professor "Prof Name" --defaultVideoBase "https://youtube.com/watch?v=UNKNOWN"
  npm run rag:ingest -- --file ./desktop_batch_processed.json --professor "Prof Name" --llmClean true --cleanModel "gpt-4.1-mini"

  Transcript JSON shape:
[
  { "start": 12.5, "end": 17.2, "text": "..." },
  ...
]

Batch JSON shape:
[
  { "subject": "Calculus_1", "filename": "Lecture title.txt", "text": "..." },
  ...
]
`);
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (!key.startsWith("--")) continue;
        args[key.slice(2)] = argv[i + 1];
        i++;
    }
    return args;
}

function cleanText(text) {
    return text
        .replace(/\b(um+|uh+|ah+|like|you know)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function chunkSegments(segments, maxChars = 900) {
    const chunks = [];
    let buffer = [];
    let charCount = 0;

    const breakPattern =
        /(therefore|in conclusion|let'?s move to|next example|so we have|which implies)/i;

    for (const seg of segments) {
        const cleaned = cleanText(seg.text || "");
        if (!cleaned) continue;

        buffer.push({
            start: Math.max(0, Math.floor(Number(seg.start) || 0)),
            end: Math.max(0, Math.floor(Number(seg.end) || Number(seg.start) || 0)),
            raw: String(seg.text || ""),
            clean: cleaned,
        });
        charCount += cleaned.length;

        const shouldBreak =
            charCount >= maxChars || breakPattern.test(cleaned) || cleaned.endsWith(".");
        if (!shouldBreak) continue;

        const first = buffer[0];
        const last = buffer[buffer.length - 1];
        chunks.push({
            raw_text: buffer.map((x) => x.raw).join(" "),
            clean_text: buffer.map((x) => x.clean).join(" "),
            timestamp_start_seconds: first.start,
            timestamp_end_seconds: Math.max(last.end, first.start),
            section_hint: buffer[0].clean.slice(0, 90),
        });
        buffer = [];
        charCount = 0;
    }

    if (buffer.length > 0) {
        const first = buffer[0];
        const last = buffer[buffer.length - 1];
        chunks.push({
            raw_text: buffer.map((x) => x.raw).join(" "),
            clean_text: buffer.map((x) => x.clean).join(" "),
            timestamp_start_seconds: first.start,
            timestamp_end_seconds: Math.max(last.end, first.start),
            section_hint: buffer[0].clean.slice(0, 90),
        });
    }

    return chunks.map((chunk, i) => ({ ...chunk, chunk_index: i }));
}

function extractPersonaSnippets(chunks) {
    const pattern =
        /(think about|intuition|common mistake|remember this|important idea|geometric meaning)/i;
    return chunks
        .filter((c) => pattern.test(c.clean_text))
        .slice(0, 80)
        .map((c) => ({
            snippet_text: c.clean_text,
            timestamp_start_seconds: c.timestamp_start_seconds,
            persona_tag: "teaching_style",
        }));
}

async function embedAll(openai, texts, model = "text-embedding-3-small") {
    const out = [];
    const batchSize = 64;

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const res = await openai.embeddings.create({
            model,
            input: batch,
        });
        for (const row of res.data) {
            out.push(row.embedding);
        }
    }
    return out;
}

function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function splitIntoSentenceSegments(text) {
    const cleaned = cleanText(text);
    if (!cleaned) return [];

    const sentences = cleaned
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    // Estimate timestamps when source has none (roughly 150 words/minute).
    const secondsPerWord = 0.4;
    let t = 0;
    return sentences.map((sentence) => {
        const words = sentence.split(/\s+/).filter(Boolean).length;
        const duration = Math.max(2, Math.round(words * secondsPerWord));
        const seg = { start: t, end: t + duration, text: sentence };
        t += duration;
        return seg;
    });
}

function normalizeBatchInput(parsed) {
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    // Case A: one transcript of timestamped segments.
    if (parsed[0]?.text && (parsed[0]?.start !== undefined || parsed[0]?.end !== undefined)) {
        return [
            {
                subject: null,
                filename: null,
                segments: parsed,
                estimatedTimestamps: false,
            },
        ];
    }

    // Case B: batch lectures with full text blobs.
    if (parsed[0]?.text && (parsed[0]?.subject || parsed[0]?.filename)) {
        return parsed.map((row) => ({
            subject: row.subject || null,
            filename: row.filename || null,
            segments: splitIntoSentenceSegments(String(row.text || "")),
            estimatedTimestamps: true,
        }));
    }

    return [];
}

async function maybeLlmPolish(openai, text, enabled, model) {
    if (!enabled || !text.trim()) return text;
    try {
        const res = await openai.responses.create({
            model,
            input: [
                {
                    role: "system",
                    content:
                        "Clean ASR lecture transcript text. Remove filler/repetitions/noise. Preserve math symbols/terminology and meaning. Return plain text only.",
                },
                {
                    role: "user",
                    content: text,
                },
            ],
        });

        const output = res.output_text?.trim();
        return output || text;
    } catch (error) {
        console.warn("LLM clean failed, falling back to raw text:", error);
        return text;
    }
}

async function ingestOneLecture({
    supabase,
    openai,
    sourcePayload,
    segments,
    jobLabel = "rule-based-cleaner-v1",
}) {

    const { data: source, error: sourceErr } = await supabase
        .from("lecture_sources")
        .insert(sourcePayload)
        .select("id")
        .single();

    if (sourceErr || !source?.id) {
        throw new Error(`Failed to insert lecture source: ${sourceErr?.message || "unknown"}`);
    }

    const sourceId = source.id;
    const { data: job } = await supabase
        .from("ingestion_jobs")
        .insert({
            source_id: sourceId,
            status: "running",
            cleaning_model: jobLabel,
            embedding_model: "text-embedding-3-small",
        })
        .select("id")
        .single();

    try {
        const chunks = chunkSegments(segments);
        if (chunks.length === 0) throw new Error("No chunks generated from lecture text.");

        const chunkEmbeddings = await embedAll(
            openai,
            chunks.map((c) => c.clean_text)
        );

        const chunkRows = chunks.map((chunk, i) => ({
            source_id: sourceId,
            chunk_index: chunk.chunk_index,
            raw_text: chunk.raw_text,
            clean_text: chunk.clean_text,
            section_hint: chunk.section_hint,
            timestamp_start_seconds: chunk.timestamp_start_seconds,
            timestamp_end_seconds: chunk.timestamp_end_seconds,
            token_count: chunk.clean_text.length / 4,
            embedding: chunkEmbeddings[i],
        }));

        const { error: chunkErr } = await supabase
            .from("lecture_chunks")
            .upsert(chunkRows, { onConflict: "source_id,chunk_index" });

        if (chunkErr) {
            throw new Error(`Failed to upsert lecture chunks: ${chunkErr.message}`);
        }

        const persona = extractPersonaSnippets(chunks);
        if (persona.length > 0) {
            const personaEmbeddings = await embedAll(
                openai,
                persona.map((p) => p.snippet_text)
            );

            const personaRows = persona.map((p, i) => ({
                source_id: sourceId,
                snippet_text: p.snippet_text,
                persona_tag: p.persona_tag,
                timestamp_start_seconds: p.timestamp_start_seconds,
                embedding: personaEmbeddings[i],
            }));

            const { error: personaErr } = await supabase
                .from("persona_snippets")
                .insert(personaRows);
            if (personaErr) {
                throw new Error(`Failed to insert persona snippets: ${personaErr.message}`);
            }
        }

        await supabase
            .from("ingestion_jobs")
            .update({ status: "completed", error: null })
            .eq("id", job?.id);

        return { sourceId, chunks: chunks.length, persona: persona.length };
    } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        if (job?.id) {
            await supabase
                .from("ingestion_jobs")
                .update({ status: "failed", error: message })
                .eq("id", job.id);
        }
        throw error;
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const file = args.file;
    const course = args.course;
    const lectureTitle = args.title;
    const videoUrl = args.videoUrl;
    const professor = args.professor;
    const defaultVideoBase = args.defaultVideoBase || "https://youtube.com/watch?v=UNKNOWN";
    const llmClean = String(args.llmClean || "false").toLowerCase() === "true";
    const cleanModel = args.cleanModel || "gpt-4.1-mini";

    if (!file || !professor) {
        usage();
        process.exit(1);
    }

    const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!openaiApiKey || !supabaseUrl || !supabaseServiceRoleKey) {
        console.error(
            "Missing env vars. Required: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
        );
        process.exit(1);
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const raw = readFileSync(file, "utf8");
    const parsed =
        safeJsonParse(raw) ??
        safeJsonParse(`[${raw.trim().replace(/,\s*$/, "")}]`) ??
        safeJsonParse(
            `[${raw
                .trim()
                .split(/\n+/)
                .filter(Boolean)
                .join(",")}]`
        );

    const normalized = normalizeBatchInput(parsed);
    if (normalized.length === 0) {
        console.error("Could not parse transcript/batch format.");
        process.exit(1);
    }

    let totalChunks = 0;
    let totalPersona = 0;

    for (let i = 0; i < normalized.length; i++) {
        const row = normalized[i];
        const rowCourse = row.subject?.replace(/_/g, " ") || course || "Unknown Course";
        const rowTitle =
            row.filename?.replace(/\.txt$/i, "") || lectureTitle || `Lecture ${i + 1}`;
        const rowVideo = videoUrl || defaultVideoBase;
        const rowText = row.segments.map((s) => s.text).join(" ");


        try {
            const polishedText =
                row.estimatedTimestamps && llmClean
                    ? await maybeLlmPolish(openai, rowText, true, cleanModel)
                    : rowText;
            const ingestSegments =
                row.estimatedTimestamps && llmClean
                    ? splitIntoSentenceSegments(polishedText)
                    : row.segments;

            const result = await ingestOneLecture({
                supabase,
                openai,
                sourcePayload: {
                    course: rowCourse,
                    lecture_title: rowTitle,
                    video_url: rowVideo,
                    professor,
                },
                segments: ingestSegments,
                jobLabel: row.subject
                    ? llmClean
                        ? `batch-text-llm-clean-${cleanModel}`
                        : "batch-text-estimated-timestamps-v1"
                    : "rule-based-cleaner-v1",
            });

            totalChunks += result.chunks;
            totalPersona += result.persona;
            console.log(
                `✅ [${i + 1}/${normalized.length}] ${rowTitle}: ${result.chunks} chunks, ${result.persona} persona snippets.`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "unknown";
            console.error(`❌ [${i + 1}/${normalized.length}] ${rowTitle} failed:`, message);
        }
    }

    console.log(
        `\n🎯 Done. Processed ${normalized.length} lectures. Total chunks: ${totalChunks}. Total persona snippets: ${totalPersona}.`
    );
}

main();