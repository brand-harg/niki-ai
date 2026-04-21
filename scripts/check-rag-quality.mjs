import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VALID_SUITES = new Set(["calc", "ml"]);

function normalizeChecks(parsed) {
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
            question: String(item.question || "").trim(),
            expectedAny: Array.isArray(item.expectedAny)
                ? item.expectedAny.map((x) => String(x).toLowerCase()).filter(Boolean)
                : [],
        }))
        .filter((item) => item.question && item.expectedAny.length > 0);
    return cleaned.length > 0 ? cleaned : null;
}


function usage() {
    console.log(`
Usage:
  node scripts/check-rag-quality.mjs [--suite calc|ml] [--checksFile ./path/to/checks.(json|mjs)] [--courseFilter "Calc 1"] [--professorFilter "Prof"] [--maxChunks 8] [--strict]
Options:
  --suite       Built-in check suite. Defaults to "calc".
  --checksFile  Custom JSON or ESM module array of checks with shape:
                [{ "question": "...", "expectedAny": ["keyword1", "keyword2"] }]
  --courseFilter      Optional filter passed to /api/rag/query.
  --professorFilter   Optional filter passed to /api/rag/query.
  --maxChunks         Optional maxChunks passed to /api/rag/query (default 8).
  --strict      Exit non-zero when endpoint preflight fails.
`);
}

function parseArgs(argv) {
    const args = {
        strict: argv.includes("--strict") || process.env.CI === "true",
        suite: "calc",
        checksFile: "",
        ourseFilter: "",
        professorFilter: "",
        maxChunks: 8,
    };
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (key === "--suite" && argv[i + 1]) {
            args.suite = String(argv[i + 1]).toLowerCase();
            i++;
            continue;
        }
        if (key === "--checksFile" && argv[i + 1]) {
            args.checksFile = argv[i + 1];
            i++;
            continue;
        }
        if (key === "--courseFilter" && argv[i + 1]) {
            args.courseFilter = argv[i + 1];
            i++;
            continue;
        }
        if (key === "--professorFilter" && argv[i + 1]) {
            args.professorFilter = argv[i + 1];
            i++;
            continue;
        }
        if (key === "--maxChunks" && argv[i + 1]) {
            args.maxChunks = Number(argv[i + 1]);
            i++;
            continue;
        }
        if (key === "--help" || key === "-h") {
            usage();
            process.exit(0);
        }
    }

    return args;
}

const { strict, suite, checksFile, courseFilter, professorFilter, maxChunks } = parseArgs(process.argv.slice(2));
const endpoint = process.env.RAG_EVAL_URL?.trim() || "http://localhost:3000/api/rag/query";

const mlChecks = [
    {
        question: "What is gradient descent and why does the learning rate matter?",
        expectedAny: ["machine", "learning", "optimization", "gradient"],
    },
    {
        question: "How does backpropagation compute partial derivatives through layers?",
        expectedAny: ["backprop", "derivative", "neural", "chain"],
    },
    {
        question: "Why does overfitting happen and how does regularization help?",
        expectedAny: ["overfitting", "regularization", "bias", "variance"],
    },
    {
        question: "Can you explain Bayes rule in plain language?",
        expectedAny: ["bayes", "probability", "posterior", "prior"],
    },
    {
        question: "What is the intuition behind attention in transformers?",
        expectedAny: ["attention", "transformer", "sequence", "token"],
    },
];

const calcChecks = [
    {
        question: "How do I use the chain rule to differentiate a composite function?",
        expectedAny: ["chain", "derivative", "composite", "calculus"],
    },
    {
        question: "What is the geometric meaning of the derivative at a point?",
        expectedAny: ["slope", "tangent", "derivative", "rate"],
    },
    {
        question: "When should I use u-substitution while integrating?",
        expectedAny: ["substitution", "integral", "differentiate", "rewrite"],
    },
    {
        question: "How does the Fundamental Theorem of Calculus connect derivatives and integrals?",
        expectedAny: ["fundamental", "calculus", "derivative", "integral"],
    },
    {
        question: "What does it mean for a sequence to converge?",
        expectedAny: ["limit", "converge", "sequence", "approaches"],
    },
    {
        question: "How do I test whether a series converges absolutely?",
        expectedAny: ["series", "absolute", "converge", "test"],
    },
];

function parseChecksFile(path) {
    if (path.endsWith(".mjs")) return null;
    try {
        const raw = readFileSync(path, "utf8");
        const parsed = JSON.parse(raw);
        return normalizeChecks(parsed);
    } catch {
        return null;
    }
}

async function parseChecksModule(path) {
    try {
        const mod = await import(pathToFileURL(path).href);
        return normalizeChecks(mod.default);
    } catch {
        return null;
    }
}

const checks = checksFile
    ? checksFile.endsWith(".mjs")
        ? await parseChecksModule(checksFile)
        : parseChecksFile(checksFile)
    : suite === "ml"
        ? mlChecks
        : calcChecks;

if (!checks) {
    console.error(
        `❌ Invalid checks file "${checksFile}". Expected JSON or ESM default export array of {question, expectedAny[]}.`
        );
    process.exit(1);
}

if (!checksFile && !VALID_SUITES.has(suite)) {
    console.error(`❌ Invalid suite "${suite}". Use one of: ${Array.from(VALID_SUITES).join(", ")}.`);
    usage();
    process.exit(1);
}

if (!Number.isFinite(maxChunks) || maxChunks < 1) {
    console.error(`❌ Invalid maxChunks "${maxChunks}". Use a positive number.`);
    process.exit(1);
}

function citationMatchesExpected(citation, expectedAny) {
    const haystack = [citation.lectureTitle, citation.professor, citation.course, citation.excerpt]
        .join(" ")
        .toLowerCase();
    return expectedAny.some((needle) => haystack.includes(needle));
}

async function runCheck({ question, expectedAny }) {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            question,
            lectureMode: true,
            maxChunks,
            ...(courseFilter ? { courseFilter } : {}),
            ...(professorFilter ? { professorFilter } : {}),
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        return {
            question,
            pass: false,
            reason: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
    }

    const payload = await res.json();
    const citations = Array.isArray(payload?.citations) ? payload.citations : [];
    if (citations.length === 0) {
        return {
            question,
            pass: false,
            reason: "No citations returned.",
        };
    }

    const pass = citations.some((citation) => citationMatchesExpected(citation, expectedAny));
    return {
        question,
        pass,
        reason: pass
            ? "Matched expected keywords in at least one top citation."
            : `No top citation matched expected keywords: ${expectedAny.join(", ")}`,
    };
}

async function endpointReachableAndUsable() {
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: "ping", lectureMode: true, maxChunks: 1 }),
        });
        if (res.status >= 500) {
            const text = await res.text();
            return {
                ok: false,
                reason: `Endpoint returned ${res.status} during preflight: ${text.slice(0, 180)}`,
            };
        }

        return { ok: true, reason: null };
    } catch {
        return { ok: false, reason: "Request failed during preflight." };
    }
}

const preflight = await endpointReachableAndUsable();
if (!preflight.ok) {
    const msg =
        `RAG endpoint unavailable at ${endpoint}. ${preflight.reason ?? ""} ` +
        "Start the app and configure OPENAI_API_KEY/SUPABASE env vars before running this check.";
    if (strict) {
        console.error(`❌ ${msg}`);
        process.exit(1);
    }

    console.warn(`⚠️ ${msg}`);
    process.exit(0);
}

let failed = false;
let passed = 0;
for (const check of checks) {
    try {
        const result = await runCheck(check);
        if (result.pass) {
            passed++;
            console.log(`✅ ${result.question}`);
        } else {
            failed = true;
            console.error(`❌ ${result.question}`);
            console.error(`   ${result.reason}`);
        }
    } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ ${check.question}`);
        console.error(`   Request failed: ${message}`);
    }
}

if (failed) {
    console.error(
        `❌ Retrieval quality checks failed (${passed}/${checks.length} passed, suite: ${checksFile ? "custom" : suite}).`
    );
    process.exit(1);
}

console.log(
    `✅ Retrieval quality checks passed (${checks.length} queries, suite: ${checksFile ? "custom" : suite}, courseFilter: ${courseFilter || "none"}, professorFilter: ${professorFilter || "none"}, maxChunks: ${maxChunks}).`
);