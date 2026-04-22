const RAG_URL = process.env.NIKI_RAG_URL ?? "http://localhost:3000/api/rag/query";
const REQUEST_TIMEOUT_MS = Number(process.env.RAG_CITATION_REQUEST_TIMEOUT_MS ?? 45000);

const cases = [
  {
    id: "simple-derivative-source-trail",
    question: "what is the derivative of 5x",
    courseFilter: "Calculus 1",
    min: 2,
    max: 4,
    expect: [/Derivative/i, /Differentiation/i],
  },
  {
    id: "limit-source-trail",
    question: "find the limit as x approaches 2 of x^2+1",
    courseFilter: "Calculus 1",
    min: 2,
    max: 4,
    expect: [/Limit/i],
  },
  {
    id: "integral-source-trail",
    question: "integrate x^2",
    courseFilter: "Calculus 2",
    min: 2,
    max: 4,
    expect: [/Integration|Usub|Integral/i],
  },
  {
    id: "calc3-source-trail",
    question: "explain the gradient vector",
    courseFilter: "Calculus 3",
    min: 2,
    max: 4,
    expect: [/Vector|Dot Product|Cross Product|Planes/i],
  },
  {
    id: "stats-source-trail",
    question: "how do z scores work?",
    courseFilter: "Statistics",
    min: 2,
    max: 4,
    expect: [/Statistics|Probability|Confidence|Center/i],
  },
  {
    id: "ode-source-trail",
    question: "solve a separable differential equation",
    courseFilter: "Differential Equations",
    min: 2,
    max: 4,
    expect: [/Difeq|Differential|Slope Fields|Linear First/i],
  },
  {
    id: "exact-section-stays-single-source",
    question: "lecture me on Calculus1 3.2 Derivative as a Function",
    courseFilter: "Calculus 1",
    min: 1,
    max: 1,
    expect: [/3\.2|Derivative as a Function/i],
  },
];

function isYouTubeUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname);
  } catch {
    return false;
  }
}

async function postJson(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(RAG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

let failed = false;

for (const check of cases) {
  try {
    const json = await postJson({
      question: check.question,
      lectureMode: true,
      courseFilter: check.courseFilter,
      maxChunks: 8,
      maxStyleSnippets: 4,
    });
    const citations = Array.isArray(json.citations) ? json.citations : [];
    const count = citations.length;
    if (count < check.min || count > check.max) {
      throw new Error(`Expected ${check.min}-${check.max} citations, got ${count}.`);
    }

    const missingUrls = citations.filter((citation) => !isYouTubeUrl(citation.timestampUrl));
    if (missingUrls.length) {
      throw new Error(`Expected every citation to have a YouTube timestamp URL.`);
    }

    const titleText = citations.map((citation) => citation.lectureTitle ?? "").join("\n");
    if (!check.expect.some((pattern) => pattern.test(titleText))) {
      throw new Error(`Citation titles did not match expected topic.\n${titleText}`);
    }

    console.log(`✅ ${check.id}`);
  } catch (error) {
    failed = true;
    console.error(`❌ ${check.id}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed) process.exit(1);
