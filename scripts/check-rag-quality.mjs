function parseArgs(argv) {
    return {
        strict: argv.includes("--strict") || process.env.CI === "true",
    };
}

const { strict } = parseArgs(process.argv.slice(2)); c
const endpoint = process.env.RAG_EVAL_URL?.trim() || "http://localhost:3000/api/rag/query";

const checks = [
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
        body: JSON.stringify({ question, lectureMode: true, maxChunks: 8 }),
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
for (const check of checks) {
    try {
        const result = await runCheck(check);
        if (result.pass) {
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
    process.exit(1);
}

console.log(`✅ Retrieval quality checks passed (${checks.length} queries).`);