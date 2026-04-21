import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_FILE = "transcripts/desktop_batch_processed.json";
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_SNIPPETS_PER_LECTURE = 10;

const STYLE_PATTERNS = [
  "think about",
  "intuition",
  "common mistake",
  "remember",
  "keep in mind",
  "important idea",
  "geometric meaning",
  "what do we do",
  "what is the only thing",
  "do you see",
  "there we go",
  "that's it",
  "not a big deal",
  "make sense",
  "on the exam",
  "you need to know",
  "must know",
  "the idea is",
  "the point is",
  "this tells us",
  "this means",
  "in other words",
  "so now",
  "now we",
  "let's translate",
  "plug everything",
  "we immediately",
  "be careful",
  "domain",
  "vertical asymptote",
  "slope",
  "change",
  "squeeze",
  "kalk",
  "calc two",
  "calc three",
  "calc 2",
  "calc 3",
];

const STYLE_RE = new RegExp(STYLE_PATTERNS.map(escapeRegExp).join("|"), "i");
const STYLE_RE_GLOBAL = new RegExp(STYLE_PATTERNS.map(escapeRegExp).join("|"), "gi");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return;
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const getValue = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      return fallback;
    }
    return argv[index + 1];
  };

  return {
    file: getValue("--file", DEFAULT_FILE),
    apply: argv.includes("--apply"),
  };
}

function cleanText(text) {
  return String(text || "")
    .replace(/\b(um+|uh+|ah+|like|you know)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value) {
  return String(value || "")
    .replace(/\.txt$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function makeWindows(sentences) {
  const windows = [];
  for (let i = 0; i < sentences.length; i++) {
    const window = sentences.slice(Math.max(0, i - 1), Math.min(sentences.length, i + 3));
    const text = window.join(" ");
    if (text.length >= 120 && text.length <= 1400) windows.push(text);
  }
  return windows;
}

function styleScore(text) {
  const hits = text.match(STYLE_RE_GLOBAL)?.length ?? 0;
  const directnessBonus = /\b(so|now|remember|keep in mind|what do we do|there we go)\b/i.test(text)
    ? 1
    : 0;
  const conceptBonus = /\b(slope|change|limit|derivative|integral|series|domain|exam|rule)\b/i.test(text)
    ? 1
    : 0;
  return hits + directnessBonus + conceptBonus;
}

function extractPersonaSnippets(text) {
  const seen = new Set();
  return makeWindows(splitSentences(text))
    .filter((snippet) => STYLE_RE.test(snippet))
    .map((snippet) => ({ snippet, score: styleScore(snippet) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.snippet)
    .filter((snippet) => {
      const key = snippet.slice(0, 160).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SNIPPETS_PER_LECTURE)
    .map((snippet) => ({
      snippet_text: snippet,
      timestamp_start_seconds: 0,
      persona_tag: "nemanja_teaching_style",
    }));
}

async function embedAll(openai, texts) {
  const out = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    out.push(...res.data.map((row) => row.embedding));
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, operation, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await operation();
      if (result?.error) throw new Error(result.error.message);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(750 * attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${attempts} attempts: ${message}`);
}

async function main() {
  loadDotEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!supabaseUrl || !serviceKey || !openaiKey) {
    throw new Error("Missing Supabase service key, Supabase URL, or OPENAI_API_KEY.");
  }

  const batch = JSON.parse(readFileSync(args.file, "utf8"));
  if (!Array.isArray(batch)) throw new Error("Expected transcript batch JSON array.");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  const { data: sources, error } = await supabase
    .from("lecture_sources")
    .select("id, lecture_title, course")
    .limit(1000);
  if (error) throw new Error(error.message);

  const sourceByTitle = new Map(
    (sources ?? []).map((source) => [normalizeTitle(source.lecture_title), source])
  );

  let matched = 0;
  let snippetCount = 0;
  const refreshJobs = [];

  for (const item of batch) {
    const source = sourceByTitle.get(normalizeTitle(item.filename));
    if (!source) continue;
    matched++;

    const snippets = extractPersonaSnippets(item.text);
    if (!snippets.length) continue;
    snippetCount += snippets.length;
    refreshJobs.push({ source, snippets });
  }

  if (args.apply) {
    const allTexts = refreshJobs.flatMap((job) =>
      job.snippets.map((snippet) => snippet.snippet_text)
    );
    const allEmbeddings = await embedAll(openai, allTexts);
    let embeddingIndex = 0;

    for (const job of refreshJobs) {
      const rows = job.snippets.map((snippet) => ({
        source_id: job.source.id,
        snippet_text: snippet.snippet_text,
        persona_tag: snippet.persona_tag,
        timestamp_start_seconds: snippet.timestamp_start_seconds,
        embedding: allEmbeddings[embeddingIndex++],
      }));

      await withRetry(`delete persona snippets for ${job.source.lecture_title}`, () =>
        supabase.from("persona_snippets").delete().eq("source_id", job.source.id)
      );

      await withRetry(`insert persona snippets for ${job.source.lecture_title}`, () =>
        supabase.from("persona_snippets").insert(rows)
      );
    }
  }

  console.log(
    `${args.apply ? "Refreshed" : "Would refresh"} ${refreshJobs.length}/${matched} matched lectures with ${snippetCount} style snippets.`
  );
  if (!args.apply) console.log("Dry run only. Re-run with --apply to update persona snippets.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${message}`);
  process.exit(1);
});
