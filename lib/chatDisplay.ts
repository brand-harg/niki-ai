export type ChatDisplayCitation = {
  lectureTitle?: string;
  professor?: string;
  timestampStartSeconds?: number;
  timestampUrl?: string | null;
  course?: string;
  similarity?: number;
  excerpt?: string;
  sectionHint?: string;
};

export type ChatDisplayRetrievalConfidence = "high" | "medium" | "low" | "none";

export type ChatDisplayRelatedLecture = {
  id: string;
  lecture_title: string;
  course: string;
  professor: string;
  video_url: string;
};

export type ChatDisplayMessage = {
  role: "ai" | "user";
  content: string;
  citations?: ChatDisplayCitation[];
  retrievalConfidence?: ChatDisplayRetrievalConfidence;
};

export type FocusTopicSuggestion = {
  topic: string;
  keywords: string[];
};

export const FOCUS_TOPIC_SUGGESTIONS: Record<string, FocusTopicSuggestion[]> = {
  "Elementary Algebra": [
    { topic: "1.2 Linear Equations", keywords: ["linear equation", "solve", "isolate", "equation"] },
    { topic: "2.1 Factoring Basics", keywords: ["factor", "factoring", "trinomial"] },
    { topic: "3.1 Systems of Equations", keywords: ["system", "elimination", "substitution"] },
    { topic: "4.1 Radicals and Exponents", keywords: ["radical", "sqrt", "exponent"] },
  ],
  PreCalc1: [
    { topic: "1.3 More on Functions and Graphs", keywords: ["function", "graph", "domain", "range"] },
    { topic: "2.2 Polynomial and Rational Functions", keywords: ["polynomial", "rational", "asymptote"] },
    { topic: "3.1 Exponential Functions", keywords: ["exponential", "growth", "decay"] },
    { topic: "3.2 Logarithmic Functions", keywords: ["log", "ln", "logarithm"] },
  ],
  "Calculus 1": [
    { topic: "2.2 Derivative Rules", keywords: ["derivative", "differentiate", "power rule", "product rule", "quotient rule"] },
    { topic: "1.3 Limits and Continuity", keywords: ["limit", "continuity", "approaches"] },
    { topic: "3.1 Applications of Derivatives", keywords: ["optimization", "related rates", "critical point"] },
    { topic: "3.2 Derivative as a Function", keywords: ["slope", "tangent", "derivative as a function"] },
  ],
  "Calculus 2": [
    { topic: "6.1 Basic Integration", keywords: ["integral", "integrate", "antiderivative"] },
    { topic: "7.1 U-Substitution", keywords: ["u substitution", "u-sub", "substitution"] },
    { topic: "7.3 Integration by Parts", keywords: ["integration by parts", "ibp"] },
    { topic: "9.1 Sequences and Series", keywords: ["sequence", "series", "summation"] },
  ],
  "Calculus 3": [
    { topic: "10.2 Vectors and Geometry", keywords: ["vector", "dot product", "cross product"] },
    { topic: "11.1 Partial Derivatives", keywords: ["partial derivative", "gradient", "multivariable"] },
    { topic: "12.1 Double Integrals", keywords: ["double integral", "iterated integral"] },
    { topic: "12.3 Polar and Parametric Surfaces", keywords: ["polar", "parametric", "surface"] },
  ],
  "Differential Equations": [
    { topic: "1.1 Separable Equations", keywords: ["separable", "differential equation"] },
    { topic: "1.5 Linear First-Order Equations", keywords: ["linear first-order", "integrating factor"] },
    { topic: "2.1 Second-Order Equations", keywords: ["second order", "characteristic equation"] },
    { topic: "3.1 Laplace Transforms", keywords: ["laplace", "transform"] },
  ],
  Statistics: [
    { topic: "1.1 Statistics Basics", keywords: ["mean", "median", "mode", "standard deviation"] },
    { topic: "2.1 Probability Foundations", keywords: ["probability", "conditional probability"] },
    { topic: "3.1 Normal Distributions and Z-Scores", keywords: ["normal distribution", "z-score"] },
    { topic: "4.1 Confidence Intervals and Tests", keywords: ["confidence interval", "hypothesis", "p-value", "z-test"] },
  ],
};

export const PURE_LOGIC_GREETINGS = [
  "What are we solving today?",
  "Send the math, code, or technical problem.",
  "What do you want to work through?",
  "Give me the problem and I’ll keep it clean.",
  "What needs fixing, proving, solving, or explaining?",
];

export const NEMANJA_GREETINGS = [
  "Do you need help with kalk?",
  "All right, what are we working on?",
  "Bring me the problem. We will make it behave.",
  "What do we need to figure out today?",
  "Kalk, algebra, stats, code. What is the situation?",
];

export const ALL_GREETING_TEXTS = new Set([...PURE_LOGIC_GREETINGS, ...NEMANJA_GREETINGS]);

export function normalizeSuggestionText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isPracticeRequestText(value: string) {
  const normalized = normalizeSuggestionText(value);
  if (!normalized) return false;

  return (
    /\bpractice\b/.test(normalized) ||
    /\bpractice problems?\b/.test(normalized) ||
    /\bmore problems?\b/.test(normalized) ||
    /\bproblem set\b/.test(normalized) ||
    /\bworksheet\b/.test(normalized) ||
    /\bdrill\b/.test(normalized)
  );
}

export function getFocusSuggestion(course: string, draft: string): string | null {
  const normalizedDraft = normalizeSuggestionText(draft);
  if (!normalizedDraft || normalizedDraft.length < 3) return null;

  const suggestions = FOCUS_TOPIC_SUGGESTIONS[course] ?? [];
  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const suggestion of suggestions) {
    let score = 0;
    for (const keyword of suggestion.keywords) {
      const normalizedKeyword = normalizeSuggestionText(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedDraft.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ") ? 3 : 2;
      } else {
        const parts = normalizedKeyword.split(" ").filter(Boolean);
        const partHits = parts.filter((part) => normalizedDraft.includes(part)).length;
        if (partHits >= Math.max(1, parts.length - 1)) score += partHits;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTopic = suggestion.topic;
    }
  }

  return bestScore >= 2 ? bestTopic : null;
}

export function isLikelyKnowledgeFileName(name = ""): boolean {
  return /(syllabus|schedule|calendar|canvas|assignment|module|quiz|exam|test|deadline|ics|csv)/i.test(
    name
  );
}

export function formatPinnedTimestamp(value?: string | null): string {
  if (!value) return "Just pinned";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just pinned";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function normalizeRecentContextTopic(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildRecentContextTopic(course: string, draft: string, fallbackTopic: string): string {
  const explicitTopic = normalizeRecentContextTopic(fallbackTopic);
  if (explicitTopic) return explicitTopic;

  const suggestedTopic = getFocusSuggestion(course, draft);
  if (suggestedTopic) return suggestedTopic;

  const compactDraft = normalizeRecentContextTopic(draft);
  if (compactDraft.length <= 72) return compactDraft;
  return `${compactDraft.slice(0, 69).trimEnd()}...`;
}

export function createGreeting(isProfessorMode: boolean): ChatDisplayMessage[] {
  const pool = isProfessorMode ? NEMANJA_GREETINGS : PURE_LOGIC_GREETINGS;
  const content = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
  return [{ role: "ai", content }];
}

export function isGreetingOnly(messages: ChatDisplayMessage[]) {
  return (
    messages.length === 0 ||
    (messages.length === 1 &&
      messages[0]?.role === "ai" &&
      ALL_GREETING_TEXTS.has(messages[0]?.content ?? ""))
  );
}

export function createHistoryMessage(message: ChatDisplayMessage): ChatDisplayMessage {
  return {
    role: message.role,
    content: message.content,
    citations: message.citations,
    retrievalConfidence: message.retrievalConfidence,
  };
}

export function stripPartialThink(content: string): string {
  if (!content) return "";

  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "");
  const openIndex = cleaned.indexOf("<think>");
  if (openIndex !== -1) {
    cleaned = cleaned.slice(0, openIndex);
  }

  return cleaned;
}

export function parseThoughtTrace(content: string): {
  steps: { label: string; detail: string }[];
  clean: string;
} {
  const match = content.match(/<think>([\s\S]*?)<\/think>/);
  if (!match) return { steps: [], clean: stripPartialThink(content).trim() };

  const rawLines = match[1].trim().split(/\n+/).filter(Boolean);
  const steps = rawLines
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return null;
      return {
        label: line.slice(0, colonIdx).trim(),
        detail: line.slice(colonIdx + 1).trim(),
      };
    })
    .filter((step): step is { label: string; detail: string } => !!step);

  return {
    steps,
    clean: stripPartialThink(content.replace(/<think>[\s\S]*?<\/think>/, "")).trim(),
  };
}

export function normalizeCourseKey(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Vault connection lost.";
}

export function formatTimestamp(seconds?: number) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function getYouTubeVideoId(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeEmbedUrl(url?: string | null, timestampStartSeconds?: number) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  const start =
    typeof timestampStartSeconds === "number" && Number.isFinite(timestampStartSeconds)
      ? Math.max(0, Math.floor(timestampStartSeconds))
      : 0;
  return `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&rel=0`;
}

export function formatRelatedLectureTitle(title?: string) {
  const normalized = (title ?? "")
    .replace(/^Nemanja Nikitovic Live Stream\s*/i, "")
    .replace(/^Nemanja Nikitovic\s*/i, "")
    .replace(/\b(Precalc1|Calculus1|Calculus2|Calculus3|Stats1|DifEq)\b\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || title || "Lecture";
}

export function dedupeCitations(citations: ChatDisplayCitation[] = []) {
  const seen = new Set<string>();
  const out: ChatDisplayCitation[] = [];

  for (const c of citations) {
    const key = [
      c.lectureTitle ?? "",
      c.course ?? "",
      c.professor ?? "",
      c.timestampStartSeconds ?? "",
      c.timestampUrl ?? "",
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }

  return out;
}

export function confidenceFromCitations(
  citations: ChatDisplayCitation[] = []
): ChatDisplayRetrievalConfidence {
  if (!citations.length) return "none";
  const bestSimilarity = Math.max(
    0,
    ...citations
      .map((citation) => citation.similarity)
      .filter((score): score is number => typeof score === "number")
  );

  if (bestSimilarity >= 0.82) return "high";
  if (bestSimilarity >= 0.62) return "medium";
  return "low";
}

export function cleanEvidenceText(value?: string) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function getCitationEvidenceMeta(citation: ChatDisplayCitation) {
  const excerpt = cleanEvidenceText(citation.excerpt);
  const sectionHint = cleanEvidenceText(citation.sectionHint);

  if (excerpt && typeof citation.similarity === "number" && citation.similarity >= 0.82) {
    return {
      label: "Exact",
      detail: "Direct transcript match from lecture",
      body: excerpt,
    };
  }

  if (excerpt) {
    return {
      label: "Related",
      detail: "Relevant excerpt from this lecture",
      body: excerpt,
    };
  }

  if (sectionHint) {
    return {
      label: "Foundational",
      detail: "No direct transcript — based on lecture topic",
      body: sectionHint,
    };
  }

  return {
    label: "Foundational",
    detail: "No direct transcript — based on lecture topic",
    body: "",
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeCodeLanguage(language?: string): string {
  const lang = (language ?? "").trim().toLowerCase();
  if (!lang) return "text";

  const aliases: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    shell: "bash",
    sh: "bash",
    zsh: "bash",
    powershell: "ps1",
    python: "py",
    plaintext: "text",
    txt: "text",
  };

  return aliases[lang] ?? lang;
}

export function inferCodeLanguage(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "text";
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(trimmed) && /"[^"]+"\s*:/.test(trimmed)) return "json";
  if (/\b(import|export|const|let|interface|type|React|useState|NextResponse)\b/.test(trimmed)) return "ts";
  if (/\b(function|const|let|var|=>|console\.log)\b/.test(trimmed)) return "js";
  if (/\b(def|import|from|print|self|None|True|False)\b/.test(trimmed)) return "py";
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|FROM|WHERE)\b/i.test(trimmed)) return "sql";
  if (/^(npm|pnpm|yarn|git|cd|ls|dir|python|node|npx)\b/m.test(trimmed)) return "bash";
  return "text";
}

export function codeLanguageLabel(language: string): string {
  const labels: Record<string, string> = {
    bash: "terminal",
    ps1: "powershell",
    py: "python",
    js: "javascript",
    jsx: "react",
    ts: "typescript",
    tsx: "react tsx",
    text: "text",
  };

  return labels[language] ?? language;
}

export function highlightCode(code: string, language: string): string {
  const escaped = escapeHtml(code);
  const lang = language.toLowerCase();

  if (/^(ts|tsx|js|jsx|javascript|typescript)$/.test(lang)) {
    return escaped
      .replace(/(".*?"|'.*?'|`[\s\S]*?`)/g, '<span class="code-token-string">$1</span>')
      .replace(
        /\b(import|from|export|default|const|let|var|function|return|if|else|for|while|async|await|try|catch|class|new|type|interface|extends|implements)\b/g,
        '<span class="code-token-keyword">$1</span>'
      )
      .replace(
        /\b(true|false|null|undefined)\b/g,
        '<span class="code-token-literal">$1</span>'
      )
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>')
      .replace(/\/\/.*/g, '<span class="code-token-comment">$&</span>');
  }

  if (/^(py|python)$/.test(lang)) {
    return escaped
      .replace(/(".*?"|'.*?')/g, '<span class="code-token-string">$1</span>')
      .replace(
        /\b(import|from|def|return|if|elif|else|for|while|try|except|class|with|as|lambda|None|True|False)\b/g,
        '<span class="code-token-keyword">$1</span>'
      )
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>')
      .replace(/#.*/g, '<span class="code-token-comment">$&</span>');
  }

  if (/^(json)$/.test(lang)) {
    return escaped
      .replace(/("[^"]+"\s*:)/g, '<span class="code-token-property">$1</span>')
      .replace(/:\s*("[^"]*")/g, ': <span class="code-token-string">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="code-token-literal">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>');
  }

  if (/^(sql)$/.test(lang)) {
    return escaped
      .replace(/('.*?')/g, '<span class="code-token-string">$1</span>')
      .replace(
        /\b(select|from|where|join|left|right|inner|insert|update|delete|create|table|alter|group|order|by|limit|as|and|or|not|null|primary|key|references|index|on|values|returning)\b/gi,
        '<span class="code-token-keyword">$1</span>'
      )
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>');
  }

  return escaped;
}
