import { readFileSync } from "node:fs";

const safeLoggerSource = readFileSync("lib/safeLogger.ts", "utf8");
const errorBoundarySource = readFileSync("app/error.tsx", "utf8");
const chatRouteSource = readFileSync("app/api/chat/route.ts", "utf8");
const ragRouteSource = readFileSync("app/api/rag/query/route.ts", "utf8");
const publicArtifactsRouteSource = readFileSync("app/api/artifacts/public/route.ts", "utf8");
const knowledgeBaseStatusRouteSource = readFileSync("app/api/knowledge-base/status/route.ts", "utf8");
const privacyChecklistSource = readFileSync("docs/PRIVACY_RELEASE_CHECKLIST.md", "utf8");

function hasAll(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
}

function doesNotIncludeAny(source, fragments) {
  return fragments.every((fragment) => !source.includes(fragment));
}

const checks = [
  {
    name: "safe logger redacts sensitive metadata and token-like values",
    pass: hasAll(safeLoggerSource, [
      "SENSITIVE_METADATA_KEY",
      "prompt|message|content|file|profile|artifact|password",
      "TOKEN_LIKE_VALUE",
      "sanitizeMetadataValue",
      "return \"[redacted]\"",
      "buildSafeErrorLog",
      "process.env.NODE_ENV !== \"production\"",
      "logSafeError",
    ]),
  },
  {
    name: "error boundary logs safely and does not render raw error details",
    pass:
      hasAll(errorBoundarySource, [
        "\"use client\"",
        "import { logSafeError } from \"@/lib/safeLogger\"",
        "logSafeError(\"app.route-boundary\", error",
        "digest: error.digest ?? null",
        "unstable_retry()",
        "Your private study content is not shown here.",
      ]) &&
      doesNotIncludeAny(errorBoundarySource, [
        "{error.message}",
        "error.stack",
        "JSON.stringify(error)",
      ]),
  },
  {
    name: "API route failures use safe logging for production-visible errors",
    pass:
      hasAll(chatRouteSource, [
        "import { logSafeError } from \"@/lib/safeLogger\"",
        "logSafeError(\"api.chat.fatal\", error, { route: \"/api/chat\" })",
      ]) &&
      hasAll(ragRouteSource, [
        "import { logSafeError } from \"@/lib/safeLogger\"",
        "logSafeError(\"api.rag.query\", error",
        "route: \"/api/rag/query\"",
      ]) &&
      hasAll(publicArtifactsRouteSource, [
        "import { logSafeError } from \"@/lib/safeLogger\"",
        "logSafeError(\"api.artifacts.public.fetch\", error",
        "logSafeError(\"api.artifacts.public.route\", error",
      ]) &&
      hasAll(knowledgeBaseStatusRouteSource, [
        "import { logSafeError } from \"@/lib/safeLogger\"",
        "logSafeError(\"api.knowledge-base.status\", error",
      ]),
  },
  {
    name: "replaced broad raw error logs on hardened API routes",
    pass:
      doesNotIncludeAny(publicArtifactsRouteSource, [
        "console.error(\"Public artifacts fetch failed:\", error)",
        "console.error(\"Public artifacts route error:\", error)",
      ]) &&
      doesNotIncludeAny(knowledgeBaseStatusRouteSource, [
        "console.error(\"Knowledge base status route error:\", error)",
      ]) &&
      doesNotIncludeAny(chatRouteSource, [
        "console.log(\"❌ Fatal error:\", error)",
      ]),
  },
  {
    name: "development-only verbose chat and RAG content logs stay gated",
    pass:
      hasAll(chatRouteSource, [
        "const isDevLog = process.env.NODE_ENV !== \"production\"",
        "if (isDevLog)",
        "console.log(\"FINAL MESSAGES\", JSON.stringify(ollamaMessages, null, 2))",
      ]) &&
      hasAll(ragRouteSource, [
        "const isDevLog = process.env.NODE_ENV !== \"production\"",
        "if (isDevLog)",
        "console.log(\"lectureContext\", context.join(\"\\n\\n---\\n\\n\"))",
      ]),
  },
  {
    name: "release checklist includes failure visibility boundaries",
    pass: hasAll(privacyChecklistSource, [
      "Unexpected production errors use privacy-safe structured logging only.",
      "Error boundary logs include action/digest metadata, not rendered private study content.",
      "API route logs include route/action and safe metadata, not request bodies.",
    ]),
  },
];

let failed = false;
for (const check of checks) {
  if (check.pass) {
    console.log(`✅ ${check.name}`);
  } else {
    failed = true;
    console.error(`❌ ${check.name}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("✅ safe-logging");
}
