import { readFileSync } from "node:fs";

const routeSource = readFileSync("app/api/rag/query/route.ts", "utf8");

const fixtures = [
  {
    name: "has-post-handler",
    pattern: /export async function POST\(req: Request\)/,
  },
  {
    name: "validates-question",
    pattern: /Please provide a question for retrieval\./,
  },
  {
    name: "requires-openai-key",
    pattern: /OPENAI_API_KEY is required for RAG embeddings/,
  },
  {
    name: "uses-embedding-model",
    pattern: /text-embedding-3-small/,
  },
  {
    name: "retrieves-lecture-chunks",
    pattern: /match_lecture_chunks/,
  },
  {
    name: "has-keyword-fallback-search",
    pattern: /clean_text\.ilike|retrievalMode/,
  },
  {
    name: "uses-expanded-embedding-query",
    pattern: /embeddingInputForQuestion/,
  },
  {
    name: "uses-hybrid-reranker",
    pattern: /hybridChunkScore|selectDiverseChunks/,
  },
  {
    name: "retrieves-neighboring-transcript-context",
    pattern: /fetchNeighborChunks|neighborChunkKeys/,
  },
  {
    name: "supports-source-filters",
    pattern: /courseFilter|professorFilter|matchesSourceFilters/,
  },
  {
    name: "retrieves-persona-snippets",
    pattern: /match_persona_snippets/,
  },
  {
    name: "returns-citations",
    pattern: /citations/,
  },
  {
    name: "returns-retrieval-diagnostics",
    pattern:
      /retrievalDiagnostics|topSimilarityScores|filters:|filterFallbackUsed|filteredSourceCount|requestedSourceCandidates|noSourceCandidates/,
  },
];

let failed = false;
for (const fixture of fixtures) {
  const pass = fixture.pattern.test(routeSource);
  if (pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
