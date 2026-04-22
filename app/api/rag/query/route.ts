export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectCourseFilter, inferCourseFromMathTopic } from "@/lib/courseFilters";

type RagRequest = {
  question?: string;
  lectureMode?: boolean;
  maxChunks?: number;
  maxStyleSnippets?: number;
  minSimilarity?: number;
  courseFilter?: string;
  professorFilter?: string;
};

type ChunkRow = {
  id: string;
  source_id: string;
  clean_text: string;
  timestamp_start_seconds: number;
  timestamp_end_seconds: number;
  section_hint: string | null;
  similarity: number;
  lecture_title?: string;
  professor?: string;
  course?: string;
  video_url?: string;
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

type SourceIdRow = Pick<SourceRow, "id">;

const MAX_CONTEXT_CHARS = 1800;
const MAX_CITATION_EXCERPT_CHARS = 600;
const MAX_NEIGHBOR_WINDOW_SECONDS = 180;
const OPENAI_EMBEDDING_TIMEOUT_MS = 12_000;
const SUPABASE_QUERY_TIMEOUT_MS = 12_000;

const STOP_WORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "with",
  "from",
  "that",
  "this",
  "into",
  "does",
  "mean",
  "explain",
  "should",
  "would",
  "could",
  "about",
  "there",
  "their",
  "because",
  "using",
  "used",
  "make",
  "help",
  "happen",
  "plain",
  "language",
  "rule",
]);

function truncateText(value: string, maxChars: number) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sliced = cleaned.slice(0, maxChars);
  const lastSentence = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("?"),
    sliced.lastIndexOf("!")
  );
  if (lastSentence >= 240) return `${sliced.slice(0, lastSentence + 1)} ...`;
  return `${sliced.trimEnd()} ...`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function softQueryTimeout<TData>(
  query: PromiseLike<{ data: TData; error: { message?: string } | null }>,
  label: string,
  fallbackData: TData
) {
  try {
    return await withTimeout(
      Promise.resolve(query),
      SUPABASE_QUERY_TIMEOUT_MS,
      `${label} timed out.`
    );
  } catch (error: unknown) {
    return {
      data: fallbackData,
      error: { message: errorMessage(error) },
    };
  }
}

function extractKeywords(question: string) {
  const base = Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .filter((w) => !STOP_WORDS.has(w))
    )
  );

  const aliases: string[] = [];
  if (/\bchain rule\b/i.test(question)) aliases.push("composite", "derivative");
  if (/\bl['’]?hopital'?s?\b|\bhopital'?s?\b/i.test(question)) aliases.push("lhopital", "hopital", "rule", "limit");
  if (/\bu[-\s]?substitution\b|\bu[-\s]?sub\b/i.test(question)) aliases.push("substitution", "integral");
  if (/\bintegration by parts\b/i.test(question)) aliases.push("parts", "integral");
  if (/\brelated rates\b/i.test(question)) aliases.push("implicit", "time", "differentiate");
  if (/\bsecond derivative\b|\bconcavity\b|\binflection\b/i.test(question)) aliases.push("concavity", "inflection", "derivative");
  if (/\bratio test\b/i.test(question)) aliases.push("series", "convergence");
  if (/\bcomparison test\b/i.test(question)) aliases.push("series", "convergence");
  if (/\balternating series(?: test)?\b|\bAST\b/i.test(question)) aliases.push("series", "convergence", "alternating", "decreasing");
  if (/\btaylor\b|\bmaclaurin\b/i.test(question)) aliases.push("polynomial", "approximation", "series");
  if (/\bslope fields?\b/i.test(question)) aliases.push("differential", "solution", "slope", "field");
  if (/\bbayes\b|\bposterior\b|\bprior\b/i.test(question)) aliases.push("probability", "conditional", "posterior", "prior");
  if (/\boverfitting\b|\bregularization\b|\bbias[-\s]?variance\b/i.test(question)) {
    aliases.push("variance", "bias");
  }
  if (/\blearning rate\b|\bgradient descent\b/i.test(question)) aliases.push("gradient", "optimization", "minimum");
  if (/\bbackpropagation\b|\bbackprop\b/i.test(question)) aliases.push("derivative", "chain", "partial");
  if (/\battention\b|\btransformer\b/i.test(question)) aliases.push("attention", "weights", "sequence");
  if (/\bcross products?\b|\bdot products?\b|\bvectors?\s+in\s+space\b/i.test(question)) {
    aliases.push("vector", "vectors", "cross", "product", "dot", "space");
  }

  return Array.from(new Set([...base, ...aliases])).slice(0, 10);
}

function isGenericRetrievalPreflight(question: string) {
  return /^(ping|health\s*check|healthcheck|test)$/i.test(question.trim());
}

function embeddingInputForQuestion(question: string, courseFilter: string, keywords: string[]) {
  return [
    question,
    courseFilter ? `Course filter: ${courseFilter}` : "",
    keywords.length ? `Important retrieval terms: ${keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function toVideoTimestampUrl(url: string, seconds: number) {
  if (!isUsableVideoUrl(url)) return null;
  const safe = Math.max(0, Math.floor(seconds));
  if (url.includes("?")) return `${url}&t=${safe}s`;
  return `${url}?t=${safe}s`;
}

function slugForSource(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type DirectFallbackSource = {
  title: string;
  course: string;
  professor: string;
  videoUrl: string;
  excerpt: string;
  sectionHint: string;
  similarity: number;
};

function sourceTrail(primary: DirectFallbackSource, related: DirectFallbackSource[] = []) {
  const seen = new Set<string>();
  return [primary, ...related].filter((source) => {
    const key = `${source.title}|${source.videoUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contextFromDirectSources(sources: DirectFallbackSource[]) {
  return sources.map(
    (source, index) => `Chunk ${index + 1}
Course: ${source.course}
Lecture: ${source.title}
Professor: ${source.professor}
Timestamp: 0s-0s
Section: ${source.sectionHint}
Similarity: ${source.similarity.toFixed(3)}

${source.excerpt}`
  );
}

function hasExactSectionRequest(question: string) {
  return /\b\d{1,2}\.\d{1,2}\b/.test(question);
}

function isMathLikeFallbackQuestion(question: string) {
  return /\b(derivative|differentiate|limit|integral|integrate|series|sequence|vector|gradient|partial|matrix|matrices|eigen|probability|statistics|z[-\s]?scores?|differential\s+equation|ode|factor|quadratic|complex|function|graph|solve|simplify|equation|polynomial|trig|log|ln|sqrt)\b|[0-9xyzt]\s*[\^+\-*/=()]|\\(?:frac|int|sum|lim)/i.test(question);
}

function knownTitleFallback(question: string) {
  const known = [
    {
      pattern: /3\.2[\s\S]*derivative\s+as\s+a\s+function|derivative\s+as\s+a\s+function[\s\S]*3\.2/i,
      title: "Nemanja Nikitovic Live Stream Calculus1 3.2 Derivative as a Function",
      course: "Calculus 1",
      videoUrl: "https://www.youtube.com/watch?v=PrxuYwOrqo4",
      excerpt:
        "Derivative as a Function treats the derivative as a new function: each input x is assigned the slope of the original function at that point.",
      related: [],
    },
    {
      pattern: /calc(?:ulus)?\s*2[\s\S]*power\s+series|power\s+series/i,
      title: "Nemanja Nikitovic Live Stream (Calculus2s 11.1 and 11.3 Power Series (Taylor Series))",
      course: "Calculus 2",
      videoUrl: "https://www.youtube.com/watch?v=8HYQInPuaw0",
      excerpt:
        "Power Series rewrites a function as an infinite polynomial centered at a point, then studies where that polynomial converges.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2s 11.2 Properties and Converg. Of Power Series)",
          videoUrl: "https://www.youtube.com/watch?v=UDvgn5T9oPc",
          excerpt:
            "Properties and convergence of power series continue the same topic by checking where the series representation is valid.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 11.2 and 11.4 Properties and Calculus of Power Series)",
          videoUrl: "https://www.youtube.com/watch?v=Fw3tSYuOdEg",
          excerpt:
            "Calculus of power series connects the representation to differentiation and integration of series.",
        },
      ],
    },
    {
      pattern: /alternating\s+series|\bAST\b/i,
      title: "Nemanja Nikitovic Live Stream Calculus2 10.6 Alternating Series",
      course: "Calculus 2",
      videoUrl: "https://www.youtube.com/watch?v=0aIQFq-JAU0",
      excerpt:
        "Alternating Series focuses on series whose signs switch. The core test checks that the positive term decreases and approaches zero.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 10.3 Infinite Series)",
          videoUrl: "https://www.youtube.com/watch?v=3tKW3z7UpCU",
          excerpt:
            "Infinite Series sets the foundation for deciding whether an infinite sum converges or diverges.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 10.5 Comparison Tests)",
          videoUrl: "https://www.youtube.com/watch?v=W8TMD9jNumc",
          excerpt:
            "Comparison Tests give another convergence lens that supports the alternating-series unit.",
        },
      ],
    },
    {
      pattern: /statistics[\s\S]*probability|probability[\s\S]*statistics/i,
      title: "Nemanja Nikitovic Live Stream Statistics1 4.1 Probability Basics",
      course: "Intro To Statistics",
      videoUrl: "https://www.youtube.com/watch?v=InKKNvKRT7U",
      excerpt:
        "Probability Basics introduces outcomes, events, and the rules for measuring how likely an event is.",
      related: [],
    },
    {
      pattern: /differential\s+equations?[\s\S]*separable|separable[\s\S]*differential\s+equations?/i,
      title: "Nemanja Nikitovic Live Stream (DIfeq 1.6 Substitution Methods and Exact Equations)",
      course: "Differential Equations",
      videoUrl: "https://www.youtube.com/watch?v=fo-QhBxIaEc",
      excerpt:
        "Separable differential equations are solved by moving all y terms with dy and all x terms with dx, then integrating both sides.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Difeq 1.3 Slope Fields)",
          videoUrl: "https://www.youtube.com/watch?v=zvEi4-O_kCc",
          excerpt:
            "Slope Fields give the visual foundation for reading a differential equation as direction information.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (DifEq 1.5 Linear First-Order Equations)",
          videoUrl: "https://www.youtube.com/watch?v=eqUT6oRxrnk",
          excerpt:
            "Linear First-Order Equations provide the neighboring first-order method when separability is not the main structure.",
        },
      ],
    },
  ].find((item) => item.pattern.test(question));
  if (!known) return null;

  const professor = "Nemanja Nikitovic";
  const timestampUrl = toVideoTimestampUrl(known.videoUrl, 0);
  const primary: DirectFallbackSource = {
    title: known.title,
    course: known.course,
    professor,
    videoUrl: known.videoUrl,
    excerpt: known.excerpt,
    sectionHint: "known title fallback",
    similarity: 1,
  };
  const sources = hasExactSectionRequest(question)
    ? [primary]
    : sourceTrail(
    primary,
    known.related.map((source) => ({
      title: source.title,
      course: known.course,
      professor,
      videoUrl: source.videoUrl,
      excerpt: source.excerpt,
      sectionHint: "related lecture fallback",
      similarity: 0.78,
    }))
  ).slice(0, 4);
  const context = contextFromDirectSources(sources);

  return {
    mode: "known-title-fallback",
    confidence: "high",
    sourceId: `known-title-${slugForSource(known.title)}`,
    sectionHint: "known title fallback",
    diagnostic: "Known-title fallback used before vector retrieval.",
    title: known.title,
    course: known.course,
    professor,
    videoUrl: known.videoUrl,
    timestampUrl,
    excerpt: known.excerpt,
    context,
    sources,
  };
}

function foundationalLectureFallback(question: string, courseFilter: string) {
  const normalizedCourse = courseFilter.toLowerCase();
  const knownSources = [
    {
      pattern: /\b(limit|lim|approaches|continuity|continuous|infinity)\b/i,
      coursePattern: /calculus\s*1|calc\s*1|^$/,
      title: "Nemanja Nikitovic Live Stream (Calculus1s 2.2 Intro to Limits)",
      course: "Calculus 1",
      videoUrl: "https://www.youtube.com/watch?v=4TgJGRh56_U",
      excerpt:
        "Foundational limit context: a limit asks what value the function approaches near a point, before worrying about whether the function equals that value there.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1s 2.3 Techniques for Solving Limits)",
          videoUrl: "https://www.youtube.com/watch?v=IT8ne5ETPNI",
          excerpt:
            "Techniques for Solving Limits gives the algebraic moves used when substitution is not enough.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1L 2.5 Limits at Infinity)",
          videoUrl: "https://www.youtube.com/watch?v=MgV7KW5jKAo",
          excerpt:
            "Limits at Infinity connects limit reasoning to long-run behavior and horizontal asymptotes.",
        },
      ],
    },
    {
      pattern: /\b(derivative|differentiate|d\/dx|dy\/dx|power\s+rule|slope|tangent)\b/i,
      coursePattern: /calculus\s*1|calc\s*1|^$/,
      title: "Nemanja Nikitovic Live Stream Calculus1 3.2 Derivative as a Function",
      course: "Calculus 1",
      videoUrl: "https://www.youtube.com/watch?v=PrxuYwOrqo4",
      excerpt:
        "Foundational derivative context: the derivative is treated as a new function that reports slope/change. A simple derivative like 5x follows this same slope rule.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1L 3.1 Intro to Derivative)",
          videoUrl: "https://www.youtube.com/watch?v=Pz68o3etwiM",
          excerpt:
            "Intro to Derivative builds the slope/change intuition before the derivative rules are applied.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1L 3.3 Rules of Differentiation)",
          videoUrl: "https://www.youtube.com/watch?v=a00SiV_0mLo",
          excerpt:
            "Rules of Differentiation is the foundation for fast derivatives such as constants times x.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1 3.4 Product and Quotient Rules)",
          videoUrl: "https://www.youtube.com/watch?v=63p8sc_oMiA",
          excerpt:
            "Product and Quotient Rules extend the same derivative foundation to more complex expressions.",
        },
      ],
    },
    {
      pattern: /\b(related\s+rates?|rate\s+of\s+change|implicit\s+differentiation|optimization)\b/i,
      coursePattern: /calculus\s*1|calc\s*1|^$/,
      title: "Nemanja Nikitovic Live Stream (Calculus1L 3.11 Related Rates)",
      course: "Calculus 1",
      videoUrl: "https://www.youtube.com/watch?v=T4YEMlfi4DM",
      excerpt:
        "Foundational related-rates context: translate changing quantities into variables, relate them with an equation, then differentiate with respect to time.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1 3.6 Derivatives as Rate of Change)",
          videoUrl: "https://www.youtube.com/watch?v=uLHouu1JppA",
          excerpt:
            "Derivatives as Rate of Change gives the core interpretation behind related rates.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1 3.8 Implicit Differentiation)",
          videoUrl: "https://www.youtube.com/watch?v=huMgGBoYbYk",
          excerpt:
            "Implicit Differentiation supplies the differentiation move used in many related-rates setups.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1 4.5 Optimization Problems)",
          videoUrl: "https://www.youtube.com/watch?v=37gAXY55MF0",
          excerpt:
            "Optimization Problems show another application workflow built from derivative modeling.",
        },
      ],
    },
    {
      pattern: /\b(l['’]?hopital'?s?|hopital)\b/i,
      coursePattern: /calculus\s*1|calc\s*1|^$/,
      title: "Nemanja Nikitovic Live Stream Calculus1 4.7 LHopitals Rule",
      course: "Calculus 1",
      videoUrl: "https://www.youtube.com/watch?v=3JDmyZzknVE",
      excerpt:
        "Foundational L'Hopital context: indeterminate quotient limits are handled by differentiating the numerator and denominator under the rule's hypotheses.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1s 2.3 Techniques for Solving Limits)",
          videoUrl: "https://www.youtube.com/watch?v=IT8ne5ETPNI",
          excerpt:
            "Techniques for Solving Limits gives the earlier limit toolbox before L'Hopital is introduced.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus1L 2.5 Limits at Infinity)",
          videoUrl: "https://www.youtube.com/watch?v=MgV7KW5jKAo",
          excerpt:
            "Limits at Infinity connects the limit setting to long-run behavior before derivative-based limit shortcuts.",
        },
      ],
    },
    {
      pattern: /\b(u[-\s]?sub|substitution|integral|integrate|antiderivative)\b/i,
      coursePattern: /calculus\s*1|calc\s*1|calculus\s*2|calc\s*2|^$/,
      title: "Nemanja Nikitovic Live Stream Calculus1 5.5 Usub",
      course: "Calculus 1",
      videoUrl: "https://www.youtube.com/watch?v=-ZiS6d7pZ9c",
      excerpt:
        "Foundational integration context: substitution identifies the inside function and rewrites the integral so the derivative relationship is visible.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 8.1 Basics of Integration)",
          videoUrl: "https://www.youtube.com/watch?v=JAq4xwhyuSE",
          excerpt:
            "Basics of Integration reviews the core antiderivative and accumulation routines.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 8.2 Integration by Parts)",
          videoUrl: "https://www.youtube.com/watch?v=xLiFyUcVwKQ",
          excerpt:
            "Integration by Parts is the next major integration method after substitution.",
        },
      ],
    },
    {
      pattern: /\b(shell\s+method|disk\s+method|washer|area\s+between|parametric\s+equations?|polar\s+coordinates?|surface\s+area|length\s+of\s+curves?)\b/i,
      coursePattern: /calculus\s*2|calc\s*2|^$/,
      title: "Nemanja Nikitovic Live Stream (Calculus2 6.4 Shell Method)",
      course: "Calculus 2",
      videoUrl: "https://www.youtube.com/watch?v=xeyaYNeRarQ",
      excerpt:
        "Foundational Calc 2 applications context: shell, disk, and area methods convert geometry into definite integrals.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2s 6.3 Disk Method)",
          videoUrl: "https://www.youtube.com/watch?v=5mon8Jf_AvE",
          excerpt:
            "Disk Method gives the neighboring volume setup to compare against shell method.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 12.1 Parametric Equations)",
          videoUrl: "https://www.youtube.com/watch?v=X6SPY_nwup8",
          excerpt:
            "Parametric Equations introduce curves described by a parameter instead of a single y=f(x) rule.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2s 12.2 and 12.3 Polar Coordinates)",
          videoUrl: "https://www.youtube.com/watch?v=kiTekKqSXbE",
          excerpt:
            "Polar Coordinates give another curve description system used after parametric equations.",
        },
      ],
    },
    {
      pattern: /\b(series|sequence|converge|diverge|ratio\s+test|comparison\s+test|alternating|power\s+series|taylor|maclaurin)\b/i,
      coursePattern: /calculus\s*2|calc\s*2|^$/,
      title: "Nemanja Nikitovic Live Stream (Calculus2 10.3 Infinite Series)",
      course: "Calculus 2",
      videoUrl: "https://www.youtube.com/watch?v=3tKW3z7UpCU",
      excerpt:
        "Foundational series context: a series is an infinite sum, so the first question is whether the partial sums settle down or keep drifting.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 10.5 Comparison Tests)",
          videoUrl: "https://www.youtube.com/watch?v=W8TMD9jNumc",
          excerpt:
            "Comparison Tests connect a new series to a known benchmark series.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2 10.6 Alternating Series)",
          videoUrl: "https://www.youtube.com/watch?v=0aIQFq-JAU0",
          excerpt:
            "Alternating Series focuses on sign-changing sums and the decreasing-to-zero structure.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus2s 11.1 and 11.3 Power Series (Taylor Series))",
          videoUrl: "https://www.youtube.com/watch?v=8HYQInPuaw0",
          excerpt:
            "Power Series connects series convergence to function approximation.",
        },
      ],
    },
    {
      pattern: /\b(vector|vectors|dot\s+products?|cross\s+products?|planes?|space|gradient|partial\s+derivatives?|double\s+integrals?|triple\s+integrals?|line\s+integrals?|surface\s+integrals?|multivariable)\b/i,
      coursePattern: /calculus\s*3|calc\s*3|^$/,
      title: "Nemanja Nikitovic Live Stream (Calculus3 13.2 Vectors in 3D)",
      course: "Calculus 3",
      videoUrl: "https://www.youtube.com/watch?v=bHDaRcjshWY",
      excerpt:
        "Foundational Calc 3 context: multivariable calculus starts by treating points and directions as vectors in space.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Calculus3 13.3 Dot Product)",
          videoUrl: "https://www.youtube.com/watch?v=z-putp8nDWk",
          excerpt:
            "Dot Product gives the projection and angle logic behind directional change.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus3 13.4 Cross Product)",
          videoUrl: "https://www.youtube.com/watch?v=7f9McubtScA",
          excerpt:
            "Cross Product builds the perpendicular-vector geometry used in planes, surfaces, and orientations.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Calculus3 13.5 Lines and Planes in Space)",
          videoUrl: "https://www.youtube.com/watch?v=lexRfK7BY-M",
          excerpt:
            "Lines and Planes in Space connects vector direction to geometric objects in 3D.",
        },
      ],
    },
    {
      pattern: /\b(probability|statistics|mean|median|measures?\s+of\s+center|variance|standard\s+deviation|z[-\s]?scores?|confidence\s+intervals?|hypothesis|p[-\s]?value|normal\s+distribution|boxplots?|five[-\s]?number)\b/i,
      coursePattern: /statistics|stats|^$/,
      title: "Nemanja Nikitovic Live Stream (Statistics1 4.1 Probability Basics)",
      course: "Statistics",
      videoUrl: "https://www.youtube.com/watch?v=InKKNvKRT7U",
      excerpt:
        "Foundational statistics context: probability and data summaries give the language for measuring uncertainty and variation.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Statistics1 3.1 Measures of Center)",
          videoUrl: "https://www.youtube.com/watch?v=SE-DDVCCHNE",
          excerpt:
            "Measures of Center gives the baseline vocabulary for summarizing a data set.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Statistics1 4.3 Some Rules of Probability)",
          videoUrl: "https://www.youtube.com/watch?v=rp6hr4kE6J0",
          excerpt:
            "Rules of Probability builds the algebra of events used in later inference.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Statistics1 8.3 Confidence Intervals when Sigma is Unknown)",
          videoUrl: "https://www.youtube.com/watch?v=M1KtYR3yqRI",
          excerpt:
            "Confidence Intervals connect sample evidence to uncertainty about a population parameter.",
        },
      ],
    },
    {
      pattern: /\b(differential\s+equation|ode|slope\s+fields?|separable|first[-\s]?order|linear\s+first|laplace|eigenvalue|systems?\s+of\s+differential)\b/i,
      coursePattern: /differential\s+equations?|diffeq|ode|^$/,
      title: "Nemanja Nikitovic Live Stream (Difeq 1.3 Slope Fields)",
      course: "Differential Equations",
      videoUrl: "https://www.youtube.com/watch?v=zvEi4-O_kCc",
      excerpt:
        "Foundational ODE context: slope fields show a differential equation as local direction information before solving symbolically.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (DifEq 1.5 Linear First-Order Equations)",
          videoUrl: "https://www.youtube.com/watch?v=eqUT6oRxrnk",
          excerpt:
            "Linear First-Order Equations introduce the standard structure for many solvable ODEs.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (DifEq 4.1 First Order Systems of DIfEq)",
          videoUrl: "https://www.youtube.com/watch?v=LKbK7pYDCME",
          excerpt:
            "First Order Systems extend single-equation ODE thinking to coupled variables.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (DiffEq 7.1 Laplace Transforms and Inverse Transforms)",
          videoUrl: "https://www.youtube.com/watch?v=cxizitNRM_s",
          excerpt:
            "Laplace Transforms shift differential equations into an algebraic transform setting.",
        },
      ],
    },
    {
      pattern: /\b(matrix|matrices|eigenvalues?|eigenvectors?|row\s+reduce|row\s+reduction|linear\s+systems?|linear\s+algebra)\b/i,
      coursePattern: /differential\s+equations?|diffeq|ode|linear\s+algebra|^$/,
      title: "Nemanja Nikitovic Live Stream (DiffEq 5.1 Matrices and Linear Systems)",
      course: "Differential Equations",
      videoUrl: "https://www.youtube.com/watch?v=p_J_3ETDK94",
      excerpt:
        "Foundational matrix context: systems of equations can be organized as matrix equations so structure and solution behavior become visible.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (DiffEq 5.1 Matrices and Linear Systems part2)",
          videoUrl: "https://www.youtube.com/watch?v=kaTH-M48IoY",
          excerpt:
            "Matrices and Linear Systems part 2 continues the row and system structure.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (DiffEq 5.2 The Eigenvalue Problem for Homogeneous Systems)",
          videoUrl: "https://www.youtube.com/watch?v=VuaORii0Hjk",
          excerpt:
            "The Eigenvalue Problem connects matrices to modes and solution behavior.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (DiffEq 5.2 The Eigenvalue Problem for Homogeneous Systems Pt2)",
          videoUrl: "https://www.youtube.com/watch?v=o94gN1EvfT4",
          excerpt:
            "The second eigenvalue lecture extends the homogeneous-system method.",
        },
      ],
    },
    {
      pattern: /\b(factor|factoring|quadratic|polynomial|systems?(?:\s+of\s+equations|\s+using\s+substitution)?|exponents?|radicals?|special\s+products|solve\s+for|linear\s+equation)\b/i,
      coursePattern: /elementary\s+algebra|algebra|^$/,
      title: "Nemanja Nikitovic Live Stream (Elementary Algebra 6.1 Intro to Factoring)",
      course: "Elementary Algebra",
      videoUrl: "https://www.youtube.com/watch?v=VLtXGzY3LIM",
      excerpt:
        "Foundational algebra context: factoring rewrites expressions into multiplicative structure so equations and simplifications become easier.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Elementary Algebra 6.2 Factoring Trinomials a=1)",
          videoUrl: "https://www.youtube.com/watch?v=4cwEZaVjGiQ",
          excerpt:
            "Factoring Trinomials handles a common quadratic pattern.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Elementary Algebra 5.1 Rules for Exponents)",
          videoUrl: "https://www.youtube.com/watch?v=qhLtBBZWyh0",
          excerpt:
            "Rules for Exponents support simplification before and after factoring.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Elementary Algebra 4.2 Solving Systems Using Substitution)",
          videoUrl: "https://www.youtube.com/watch?v=mWZvEQfJicU",
          excerpt:
            "Solving Systems Using Substitution connects equation structure to a repeatable solving method.",
        },
      ],
    },
    {
      pattern: /\b(complex\s+numbers?|inverse\s+functions?|rational\s+functions?|quadratic\s+functions?|polynomial\s+functions?|functions?\s+and\s+graphs?|precalc|precalculus)\b/i,
      coursePattern: /precalc|precalculus|^$/,
      title: "Nemanja Nikitovic Live Stream (Precalculus1 2.1 Complex Numbers)",
      course: "PreCalc1",
      videoUrl: "https://www.youtube.com/watch?v=iO4LlxWXDkQ",
      excerpt:
        "Foundational PreCalc context: complex numbers, functions, and graph behavior are the bridge into calculus topics.",
      related: [
        {
          title: "Nemanja Nikitovic Live Stream (Precalculus1 1.8 Inverse Functions)",
          videoUrl: "https://www.youtube.com/watch?v=tTNxah7fgPs",
          excerpt:
            "Inverse Functions explains how functions reverse input-output relationships.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Precalculus1 2.2 Quadratic Functions)",
          videoUrl: "https://www.youtube.com/watch?v=_fZzvaXU7DY",
          excerpt:
            "Quadratic Functions provide a core graph family used throughout algebra and calculus.",
        },
        {
          title: "Nemanja Nikitovic Live Stream (Precalculus 1 2.6 Rational Functions and Their Graphs)",
          videoUrl: "https://www.youtube.com/watch?v=jKy7Cei7UV0",
          excerpt:
            "Rational Functions and Their Graphs covers asymptotes and quotient-based graph behavior.",
        },
      ],
    },
  ];

  let known = knownSources.find((item) => item.pattern.test(question) && item.coursePattern.test(normalizedCourse));

  if (!known && isMathLikeFallbackQuestion(question)) {
    if (/calculus\s*3|calc\s*3/.test(normalizedCourse)) {
      known = knownSources.find((item) => /Vectors in 3D/i.test(item.title));
    } else if (/calculus\s*2|calc\s*2/.test(normalizedCourse)) {
      known = knownSources.find((item) => /Basics of Integration|Infinite Series/i.test(item.title));
    } else if (/calculus\s*1|calc\s*1/.test(normalizedCourse)) {
      known = knownSources.find((item) => /Intro to Limits/i.test(item.title));
    } else if (/stat/.test(normalizedCourse)) {
      known = knownSources.find((item) => /Probability Basics/i.test(item.title));
    } else if (/diff|ode|linear\s+algebra/.test(normalizedCourse)) {
      known = knownSources.find((item) => /Matrices and Linear Systems/i.test(item.title));
    } else if (/precalc|precalculus/.test(normalizedCourse)) {
      known = knownSources.find((item) => /Complex Numbers/i.test(item.title));
    } else if (/algebra/.test(normalizedCourse)) {
      known = knownSources.find((item) => /Intro to Factoring/i.test(item.title));
    }
  }

  if (!known) return null;

  const professor = "Nemanja Nikitovic";
  const timestampUrl = toVideoTimestampUrl(known.videoUrl, 0);
  const primary: DirectFallbackSource = {
    title: known.title,
    course: known.course,
    professor,
    videoUrl: known.videoUrl,
    excerpt: known.excerpt,
    sectionHint: "foundational lecture fallback",
    similarity: 0.82,
  };
  const sources = sourceTrail(
    primary,
    known.related.map((source) => ({
      title: source.title,
      course: known.course,
      professor,
      videoUrl: source.videoUrl,
      excerpt: source.excerpt,
      sectionHint: "related foundational fallback",
      similarity: 0.72,
    }))
  ).slice(0, 4);
  const context = contextFromDirectSources(sources);

  return {
    mode: "foundational-fallback",
    confidence: "medium",
    sourceId: `foundational-${slugForSource(known.title)}`,
    sectionHint: "foundational lecture fallback",
    diagnostic: "Foundational lecture fallback used before vector retrieval.",
    title: known.title,
    course: known.course,
    professor,
    videoUrl: known.videoUrl,
    timestampUrl,
    excerpt: known.excerpt,
    context,
    sources,
  };
}

function isUsableVideoUrl(url?: string | null): url is string {
  if (!url) return false;
  if (/UNKNOWN/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

function chunkKey(chunk: Pick<ChunkRow, "source_id" | "timestamp_start_seconds" | "timestamp_end_seconds">) {
  return `${chunk.source_id}:${chunk.timestamp_start_seconds}:${chunk.timestamp_end_seconds}`;
}

function keywordPattern(keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|ed|ing)?\\b`, "i");
}

function scoreKeywordChunk(text: string, keywords: string[]) {
  const haystack = text.toLowerCase();
  const hits = keywords.filter((keyword) => keywordPattern(keyword).test(text)).length;
  const phraseHits = keywords
    .slice(0, -1)
    .filter((keyword, i) => haystack.includes(`${keyword} ${keywords[i + 1]}`)).length;
  return Math.min(0.88, 0.62 + hits * 0.06 + phraseHits * 0.08);
}

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.filter((keyword) => keywordPattern(keyword).test(text)).length;
}

function countPhraseHits(text: string, phrases: string[]) {
  const haystack = text.toLowerCase();
  return phrases.filter((phrase) => haystack.includes(phrase.toLowerCase())).length;
}

const LECTURE_TITLE_STOPWORDS = new Set([
  "lecture",
  "lectures",
  "youtube",
  "video",
  "link",
  "please",
  "class",
  "wasnt",
  "wasn",
  "missed",
  "teach",
  "teaches",
  "covered",
  "covers",
  "think",
  "them",
  "what",
  "where",
  "which",
  "called",
  "with",
  "from",
  "live",
  "stream",
  "nemanja",
  "nikitovic",
]);

const GENERIC_TITLE_QUERY_TOKENS = new Set([
  "function",
  "graph",
  "equation",
  "course",
  "topic",
  "part",
  "intro",
  "introduction",
  "basic",
  "basics",
  "rule",
  "method",
]);

function lectureTitleTokens(value: string): string[] {
  const normalizeToken = (token: string) => {
    if (/^\d+(?:\.\d+)?$/.test(token)) return token;
    if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
    if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
    return token;
  };

  const tokens = new Set(
    new Set(
      value
        .toLowerCase()
        .replace(/calculus\s*1|calc\s*1/g, "calculus1")
        .replace(/calculus\s*2|calc\s*2/g, "calculus2")
        .replace(/calculus\s*3|calc\s*3/g, "calculus3")
        .replace(/pre\s*calc\s*1|precalc\s*1|precalculus\s*1/g, "precalc1")
        .replace(/[^a-z0-9.]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .map(normalizeToken)
        .filter((token) => token.length >= 3 || /^\d+(?:\.\d+)?$/.test(token))
        .filter((token) => !LECTURE_TITLE_STOPWORDS.has(token))
    )
  );

  if (/\bu[-\s]?substitution\b|\bu[-\s]?sub\b/i.test(value)) {
    tokens.add("usub");
  }
  if (/\bl['’]?hopital'?s?\b|\bhopital'?s?\b/i.test(value)) {
    tokens.add("lhopital");
    tokens.add("hopital");
  }

  return Array.from(tokens);
}

function scoreRequestedLectureTitle(question: string, source: SourceRow) {
  const requested = lectureTitleTokens(question);
  if (requested.length === 0) return 0;

  const titleTokens = new Set([
    ...lectureTitleTokens(source.lecture_title ?? ""),
    ...lectureTitleTokens(source.course ?? ""),
  ]);
  const requestedSections = requested.filter((token) => /^\d+(?:\.\d+)?$/.test(token));
  const sectionHits = requestedSections.filter((token) => titleTokens.has(token)).length;
  if (requestedSections.length > 0 && sectionHits === 0) return 0;

  const meaningful = requested.filter(
    (token) =>
      !/^\d+(?:\.\d+)?$/.test(token) &&
      !token.includes("calculus") &&
      !token.includes("precalc")
  );
  const wordHits = meaningful.filter((token) => titleTokens.has(token)).length;
  const courseHits = requested.filter(
    (token) =>
      (token.includes("calculus") || token.includes("precalc")) &&
      titleTokens.has(token)
  ).length;
  const abbreviationBoost = requested.includes("usub") && titleTokens.has("usub") ? 4 : 0;

  return sectionHits * 8 + wordHits * 2 + courseHits + abbreviationBoost;
}

async function fetchExactLectureSources({
  question,
  courseFilter,
  professorFilter,
}: {
  question: string;
  courseFilter: string;
  professorFilter: string;
}) {
  const requestedTokens = lectureTitleTokens(question);
  const requestedSectionTokens = requestedTokens.filter((token) => /^\d+(?:\.\d+)?$/.test(token));
  const titleQueryTokens = requestedTokens
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => !token.includes("calculus") && !token.includes("precalc"))
    .slice(0, 6);
  const specificTitleTokens = titleQueryTokens
    .filter((token) => !GENERIC_TITLE_QUERY_TOKENS.has(token))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  const targetedTitleTokens = Array.from(new Set([...requestedSectionTokens, ...specificTitleTokens])).slice(0, 3);

  const buildSourceQuery = (tokens: string[], limit: number) => {
    let sourceQuery = supabaseAdmin
      .from("lecture_sources")
      .select("id, lecture_title, video_url, professor, course")
      .limit(limit);

    if (tokens.length > 0) {
      sourceQuery = sourceQuery.or(
        tokens.map((token) => `lecture_title.ilike.%${token}%`).join(",")
      );
    }
    if (courseFilter) {
      sourceQuery = sourceQuery.ilike("course", `%${courseFilter}%`);
    }
    if (professorFilter) {
      sourceQuery = sourceQuery.ilike("professor", `%${professorFilter}%`);
    }
    return sourceQuery;
  };

  const targetedResults = targetedTitleTokens.length
    ? await Promise.all(
      targetedTitleTokens.map((token) =>
        softQueryTimeout(
          buildSourceQuery([token], 80),
          `Exact lecture source lookup for ${token}`,
          [] as SourceRow[]
        )
      )
    )
    : [];
  const targetedRows = targetedResults.flatMap((result) => (result.data ?? []) as SourceRow[]);
  const targetedErrors = targetedResults
    .map((result) => result.error)
    .filter((error): error is { message?: string } => !!error);

  const fallbackTokens = targetedErrors.length > 0 && courseFilter ? [] : titleQueryTokens;
  const fallbackResult = targetedRows.length > 0
    ? { data: targetedRows, error: null }
    : await softQueryTimeout(
      buildSourceQuery(fallbackTokens, 200),
      "Exact lecture source lookup",
      [] as SourceRow[]
    );

  const data = fallbackResult.data;
  const error = fallbackResult.error ?? (targetedErrors.length ? targetedErrors[0] : null);
  if (error) return { data: [] as SourceRow[], error };

  const ranked = ((data ?? []) as SourceRow[])
    .map((source) => ({ source, score: scoreRequestedLectureTitle(question, source) }))
    .filter(({ score }) => score >= 4)
    .sort((a, b) => b.score - a.score);
  const bestScore = ranked[0]?.score ?? 0;
  const exactSources = bestScore > 0
    ? ranked.filter(({ score }) => score === bestScore).map(({ source }) => source)
    : [];

  return { data: exactSources.slice(0, 4), error: null };
}

function hybridChunkScore({
  chunk,
  source,
  keywords,
  phrases,
}: {
  chunk: ChunkRow;
  source?: SourceRow;
  keywords: string[];
  phrases: string[];
}) {
  const chunkText = chunk.clean_text ?? "";
  const titleText = source?.lecture_title ?? "";
  const sectionText = chunk.section_hint ?? "";
  const keywordHits = countKeywordHits(chunkText, keywords);
  const titleHits = countKeywordHits(titleText, keywords);
  const sectionHits = countKeywordHits(sectionText, keywords);
  const phraseHits = countPhraseHits(`${titleText} ${sectionText} ${chunkText}`, phrases);
  const lexicalBoost =
    Math.min(keywordHits, 6) * 0.035 +
    Math.min(titleHits, 4) * 0.055 +
    Math.min(sectionHits, 3) * 0.04 +
    Math.min(phraseHits, 3) * 0.07;

  return Math.min(1.25, chunk.similarity * 0.78 + lexicalBoost);
}

function selectDiverseChunks({
  candidates,
  sourceMap,
  keywords,
  phrases,
  maxChunks,
}: {
  candidates: ChunkRow[];
  sourceMap: Map<string, SourceRow>;
  keywords: string[];
  phrases: string[];
  maxChunks: number;
}) {
  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: hybridChunkScore({
        chunk,
        source: sourceMap.get(chunk.source_id),
        keywords,
        phrases,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const selected: ChunkRow[] = [];
  const perSource = new Map<string, number>();

  for (const item of scored) {
    const sourceCount = perSource.get(item.chunk.source_id) ?? 0;
    const nearDuplicate = selected.some(
      (picked) =>
        picked.source_id === item.chunk.source_id &&
        Math.abs(picked.timestamp_start_seconds - item.chunk.timestamp_start_seconds) < 45
    );
    if (nearDuplicate) continue;
    if (sourceCount >= 3 && selected.length < Math.max(3, Math.floor(maxChunks * 0.75))) {
      continue;
    }

    selected.push({ ...item.chunk, similarity: item.score });
    perSource.set(item.chunk.source_id, sourceCount + 1);
    if (selected.length >= maxChunks) return selected;
  }

  for (const item of scored) {
    if (selected.some((chunk) => chunkKey(chunk) === chunkKey(item.chunk))) continue;
    selected.push({ ...item.chunk, similarity: item.score });
    if (selected.length >= maxChunks) break;
  }

  return selected;
}

function retrievalQuality(chunks: ChunkRow[]) {
  const topSimilarity = chunks[0]?.similarity ?? 0;
  const averageTopSimilarity =
    chunks.length > 0
      ? chunks.slice(0, 3).reduce((sum, chunk) => sum + chunk.similarity, 0) /
      Math.min(chunks.length, 3)
      : 0;

  const confidence =
    topSimilarity >= 0.82 && chunks.length >= 3
      ? "high"
      : topSimilarity >= 0.62 && chunks.length >= 2
        ? "medium"
        : chunks.length > 0
          ? "low"
          : "none";

  return {
    confidence,
    topSimilarity,
    averageTopSimilarity,
    selectedChunkCount: chunks.length,
  };
}

function isRpcSignatureError(message: string) {
  return /function .* does not exist|could not find the function|schema cache/i.test(message);
}

async function matchLectureChunks({
  queryEmbedding,
  matchCount,
  courseFilter,
  professorFilter,
}: {
  queryEmbedding: number[];
  matchCount: number;
  courseFilter: string;
  professorFilter: string;
}) {
  const filtered = await softQueryTimeout(
    supabaseAdmin.rpc("match_lecture_chunks", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_course: courseFilter || null,
      filter_professor: professorFilter || null,
      filter_source_id: null,
    }),
    "Filtered vector lecture chunk retrieval",
    [] as ChunkRow[]
  );

  if (!filtered.error || !isRpcSignatureError(filtered.error.message ?? "")) {
    return filtered;
  }

  return softQueryTimeout(
    supabaseAdmin.rpc("match_lecture_chunks", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
    }),
    "Vector lecture chunk retrieval",
    [] as ChunkRow[]
  );
}

async function matchPersonaSnippets({
  queryEmbedding,
  matchCount,
  courseFilter,
  professorFilter,
}: {
  queryEmbedding: number[];
  matchCount: number;
  courseFilter: string;
  professorFilter: string;
}) {
  const filtered = await softQueryTimeout(
    supabaseAdmin.rpc("match_persona_snippets", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_course: courseFilter || null,
      filter_professor: professorFilter || null,
      filter_source_id: null,
    }),
    "Filtered persona snippet retrieval",
    [] as StyleRow[]
  );

  if (!filtered.error || !isRpcSignatureError(filtered.error.message ?? "")) {
    return filtered;
  }

  return softQueryTimeout(
    supabaseAdmin.rpc("match_persona_snippets", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
    }),
    "Persona snippet retrieval",
    [] as StyleRow[]
  );
}

async function fetchNeighborChunks(seedChunks: ChunkRow[]) {
  const seeds = seedChunks.slice(0, 6);
  const results = await Promise.all(
    seeds.map(async (seed) => {
      const start = Math.max(0, seed.timestamp_start_seconds - MAX_NEIGHBOR_WINDOW_SECONDS);
      const end = seed.timestamp_end_seconds + MAX_NEIGHBOR_WINDOW_SECONDS;
      const { data, error } = await softQueryTimeout(
        supabaseAdmin
          .from("lecture_chunks")
          .select(
            "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
          )
          .eq("source_id", seed.source_id)
          .gte("timestamp_start_seconds", start)
          .lte("timestamp_start_seconds", end)
          .order("timestamp_start_seconds", { ascending: true })
          .limit(8),
        "Neighbor transcript retrieval",
        [] as Omit<ChunkRow, "similarity">[]
      );

      if (error) {
        return { data: [] as ChunkRow[], error: error.message };
      }

      const neighborRows = ((data || []) as Omit<ChunkRow, "similarity">[]).map((row) => {
        const distance = Math.abs(row.timestamp_start_seconds - seed.timestamp_start_seconds);
        const penalty = Math.min(0.16, distance / 1500);
        return {
          ...row,
          similarity: Math.max(0.48, seed.similarity - 0.06 - penalty),
        };
      });

      return { data: neighborRows, error: null };
    })
  );

  return {
    data: results.flatMap((result) => result.data),
    errors: results.map((result) => result.error).filter((error): error is string => !!error),
  };
}

export async function POST(req: Request) {
  try {
    const body: RagRequest = await req.json();
    const question = body.question?.trim() || "";
    const maxChunks = Math.min(Math.max(body.maxChunks ?? 8, 1), 15);
    const maxStyleSnippets = Math.min(Math.max(body.maxStyleSnippets ?? 3, 1), 6);
    const minSimilarity = Math.min(Math.max(body.minSimilarity ?? 0.2, 0), 1);
    const rawCourseFilter = body.courseFilter?.trim() || "";
    const courseFilter = rawCourseFilter
      ? detectCourseFilter(rawCourseFilter, rawCourseFilter) ?? rawCourseFilter
      : inferCourseFromMathTopic(question) ?? "";
    const professorFilter = body.professorFilter?.trim() || "";
    const isDevLog = process.env.NODE_ENV !== "production";
    const keywords = extractKeywords(question);
    const keywordPhrases = keywords
      .slice(0, -1)
      .map((keyword, i) => `${keyword} ${keywords[i + 1]}`);


    if (!question) {
      return NextResponse.json(
        { error: "Please provide a question for retrieval." },
        { status: 400 }
      );
    }

    if (isGenericRetrievalPreflight(question)) {
      return NextResponse.json({
        question,
        lectureMode: body.lectureMode ?? true,
        retrievalMode: "preflight-empty",
        retrievalConfidence: "none",
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
            requestedSourceCandidates: null,
            noSourceCandidates: true,
            minSimilarityUsed: minSimilarity,
            droppedLowSimilarityCount: 0,
            vectorRetrievalError: "Generic retrieval preflight skipped live retrieval.",
            styleRetrievalError: null,
          },
        },
      });
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

    const directFallback =
      knownTitleFallback(question) ?? foundationalLectureFallback(question, courseFilter);
    if (directFallback) {
      return NextResponse.json({
        question,
        lectureMode: body.lectureMode ?? true,
        retrievalMode: directFallback.mode,
        retrievalConfidence: directFallback.confidence,
        keywords,
        context: directFallback.context,
        styleSnippets: [],
        citations: directFallback.sources.map((source, index) => ({
          sourceId: `${directFallback.sourceId}-${index + 1}`,
          lectureTitle: source.title,
          professor: source.professor,
          course: source.course,
          videoUrl: source.videoUrl,
          timestampStartSeconds: 0,
          timestampEndSeconds: 0,
          timestampUrl: toVideoTimestampUrl(source.videoUrl, 0),
          excerpt: source.excerpt,
          sectionHint: source.sectionHint,
          similarity: source.similarity,
        })),
        retrievalDiagnostics: {
          selectedChunkKeys: directFallback.sources.map(
            (_source, index) => `${directFallback.sourceId}-${index + 1}:0:0`
          ),
          vectorTopChunkKeys: [],
          keywordTopChunkKeys: [],
          topSimilarityScores: directFallback.sources.map((source, index) => ({
            key: `${directFallback.sourceId}-${index + 1}:0:0`,
            similarity: source.similarity,
          })),
          filters: {
            courseFilter: courseFilter || null,
            professorFilter: professorFilter || null,
            courseFilterApplied: !!courseFilter,
            professorFilterApplied: !!professorFilter,
            filterFallbackUsed: true,
            filteredSourceCount: directFallback.sources.length,
            requestedSourceCandidates: null,
            noSourceCandidates: false,
            minSimilarityUsed: minSimilarity,
            droppedLowSimilarityCount: 0,
            vectorRetrievalError: directFallback.diagnostic,
            styleRetrievalError: null,
          },
        },
      });
    }

    const { data: earlyExactSourceRows, error: earlyExactSourceErr } = await fetchExactLectureSources({
      question,
      courseFilter,
      professorFilter,
    });
    if (earlyExactSourceErr && isDevLog) {
      console.log("exactSourceError", earlyExactSourceErr);
    }

    if (earlyExactSourceRows.length > 0) {
      const exactSourceIds = Array.from(new Set(earlyExactSourceRows.map((row) => row.id)));
      const { data: exactChunkRows, error: exactChunkErr } = await softQueryTimeout(
        supabaseAdmin
          .from("lecture_chunks")
          .select("source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint")
          .in("source_id", exactSourceIds)
          .order("timestamp_start_seconds", { ascending: true })
          .limit(maxChunks),
        "Exact title chunk retrieval",
        [] as Omit<ChunkRow, "similarity">[]
      );

      if (exactChunkErr && isDevLog) {
        console.log("exactChunkError", exactChunkErr);
      }

      const exactChunks = ((exactChunkRows || []) as Omit<ChunkRow, "similarity">[]).map((chunk) => ({
        ...chunk,
        similarity: 1.18,
      }));

      if (exactChunks.length > 0) {
        const sourceMap = new Map<string, SourceRow>(
          earlyExactSourceRows.map((row) => [row.id, row])
        );
        const context = exactChunks.map((chunk, i) => {
          const source = sourceMap.get(chunk.source_id);
          return `Chunk ${i + 1}
Course: ${source?.course ?? "Unknown course"}
Lecture: ${source?.lecture_title ?? "Unknown lecture"}
Professor: ${source?.professor ?? "Unknown professor"}
Timestamp: ${chunk.timestamp_start_seconds}s-${chunk.timestamp_end_seconds}s
Section: ${chunk.section_hint ?? "Unknown"}
Similarity: ${chunk.similarity.toFixed(3)}

${truncateText(chunk.clean_text, MAX_CONTEXT_CHARS)}`;
        });
        const citations = exactChunks.map((chunk) => {
          const source = sourceMap.get(chunk.source_id);
          return {
            sourceId: chunk.source_id,
            lectureTitle: source?.lecture_title ?? "Unknown lecture",
            professor: source?.professor ?? "Unknown professor",
            course: source?.course ?? "Unknown course",
            videoUrl: isUsableVideoUrl(source?.video_url) ? source.video_url : "",
            timestampStartSeconds: chunk.timestamp_start_seconds,
            timestampEndSeconds: chunk.timestamp_end_seconds,
            timestampUrl: isUsableVideoUrl(source?.video_url)
              ? toVideoTimestampUrl(source.video_url, chunk.timestamp_start_seconds)
              : null,
            excerpt: truncateText(chunk.clean_text, MAX_CITATION_EXCERPT_CHARS),
            sectionHint: chunk.section_hint,
            similarity: chunk.similarity,
          };
        });
        const quality = retrievalQuality(exactChunks);

        return NextResponse.json({
          question,
          lectureMode: body.lectureMode ?? true,
          retrievalMode: "exact-title",
          retrievalConfidence: quality.confidence,
          keywords,
          context,
          styleSnippets: [],
          citations,
          retrievalDiagnostics: {
            quality,
            selectedChunkKeys: exactChunks.map((chunk) => chunkKey(chunk)),
            vectorTopChunkKeys: [],
            keywordTopChunkKeys: [],
            neighborChunkKeys: [],
            neighborRetrievalErrors: [],
            candidateCounts: {
              vector: 0,
              keyword: 0,
              initialMerged: exactChunks.length,
              neighbors: 0,
              thresholded: exactChunks.length,
            },
            lexicalRetrievalErrors: [],
            topSimilarityScores: exactChunks.slice(0, 5).map((chunk) => ({
              key: chunkKey(chunk),
              similarity: chunk.similarity,
            })),
            filters: {
              courseFilter: courseFilter || null,
              professorFilter: professorFilter || null,
              courseFilterApplied: !!courseFilter,
              professorFilterApplied: !!professorFilter,
              filterFallbackUsed: false,
              filteredSourceCount: exactSourceIds.length,
              requestedSourceCandidates: null,
              noSourceCandidates: false,
              minSimilarityUsed: minSimilarity,
              droppedLowSimilarityCount: 0,
              vectorRetrievalError: null,
              styleRetrievalError: null,
            },
          },
        });
      }
    }

    let embedding: number[] | null = null;
    let embeddingError: string | null = null;
    try {
      const openai = new OpenAI({
        apiKey: openaiApiKey,
        maxRetries: 0,
        timeout: OPENAI_EMBEDDING_TIMEOUT_MS,
      });
      const embeddingRes = await withTimeout(
        openai.embeddings.create({
          model: "text-embedding-3-small",
          input: embeddingInputForQuestion(question, courseFilter, keywords),
        }),
        OPENAI_EMBEDDING_TIMEOUT_MS + 1_000,
        "Embedding generation timed out."
      );
      embedding = embeddingRes.data?.[0]?.embedding ?? null;
      if (!embedding) {
        embeddingError = "Embedding generation returned no vector.";
      }
    } catch (error: unknown) {
      embeddingError = `Embedding generation failed: ${errorMessage(error)}`;
    }

    const keywordFilter = keywords.map((k) => `clean_text.ilike.%${k}%`).join(",");
    const phraseFilter = keywordPhrases
      .map((phrase) => `clean_text.ilike.%${phrase}%`)
      .join(",");
    const anyFilterRequested = !!courseFilter || !!professorFilter;

    let requestedSourceIdSet: Set<string> | null = null;
    let sourceFilterLookupError: string | null = null;
    if (anyFilterRequested) {
      let sourceFilterQuery = supabaseAdmin.from("lecture_sources").select("id");
      if (courseFilter) {
        sourceFilterQuery = sourceFilterQuery.ilike("course", `%${courseFilter}%`);
      }
      if (professorFilter) {
        sourceFilterQuery = sourceFilterQuery.ilike("professor", `%${professorFilter}%`);
      }

      const { data: requestedSourceRows, error: requestedSourceErr } =
        await softQueryTimeout(
          sourceFilterQuery.limit(200),
          "Requested source filter lookup",
          [] as SourceIdRow[]
        );
      if (requestedSourceErr) {
        sourceFilterLookupError = requestedSourceErr.message ?? "Source filter lookup failed.";
        if (isDevLog) {
          console.log("sourceFilterLookupError", sourceFilterLookupError);
        }
      } else {
        requestedSourceIdSet = new Set(
          ((requestedSourceRows as SourceIdRow[]) || []).map((row) => row.id)
        );
      }
    }

    if (anyFilterRequested && requestedSourceIdSet && requestedSourceIdSet.size === 0) {
      return NextResponse.json({
        question,
        lectureMode: body.lectureMode ?? true,
        retrievalMode: keywords.length > 0 ? "hybrid" : "vector-only",
        retrievalConfidence: "none",
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
            minSimilarityUsed: minSimilarity,
            droppedLowSimilarityCount: 0,
          },
        },
      });
    }

    const { data: exactSourceRows, error: exactSourceErr } = await fetchExactLectureSources({
      question,
      courseFilter,
      professorFilter,
    });
    const exactSourceIds = Array.from(new Set(exactSourceRows.map((row) => row.id)));

    const [
      { data: chunksData, error: chunkErr },
      { data: styleData, error: styleErr },
      { data: keywordData, error: keywordErr },
      { data: phraseKeywordData, error: phraseKeywordErr },
      { data: titleKeywordData, error: titleKeywordErr },
      { data: exactTitleData, error: exactTitleErr },
    ] = await Promise.all([
      embedding
        ? matchLectureChunks({
          queryEmbedding: embedding,
          matchCount: Math.min(40, Math.max(maxChunks * 4, 16)),
          courseFilter,
          professorFilter,
        })
        : Promise.resolve({ data: [], error: null }),
      embedding
        ? matchPersonaSnippets({
          queryEmbedding: embedding,
          matchCount: maxStyleSnippets,
          courseFilter,
          professorFilter,
        })
        : Promise.resolve({ data: [], error: null }),
      keywords.length > 0
        ? (() => {
          let keywordQuery = supabaseAdmin
            .from("lecture_chunks")
            .select(
              "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
            )
            .or(keywordFilter)
            .limit(Math.max(50, maxChunks * 10));

          if (requestedSourceIdSet && requestedSourceIdSet.size > 0) {
            keywordQuery = keywordQuery.in(
              "source_id",
              Array.from(requestedSourceIdSet)
            );
          }
          return softQueryTimeout(
            keywordQuery,
            "Keyword lecture chunk retrieval",
            [] as Omit<ChunkRow, "similarity">[]
          );
        })()
        : Promise.resolve({ data: [], error: null }),
      phraseFilter
        ? (() => {
          let phraseQuery = supabaseAdmin
            .from("lecture_chunks")
            .select(
              "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
            )
            .or(phraseFilter)
            .limit(Math.max(20, maxChunks * 4));

          if (requestedSourceIdSet && requestedSourceIdSet.size > 0) {
            phraseQuery = phraseQuery.in(
              "source_id",
              Array.from(requestedSourceIdSet)
            );
          }
          return softQueryTimeout(
            phraseQuery,
            "Phrase keyword lecture chunk retrieval",
            [] as Omit<ChunkRow, "similarity">[]
          );
        })()
        : Promise.resolve({ data: [], error: null }),
      keywords.length > 0
        ? (async () => {
          let titleQuery = supabaseAdmin
            .from("lecture_sources")
            .select("id, lecture_title")
            .or(keywords.map((k) => `lecture_title.ilike.%${k}%`).join(","))
            .limit(200);

          if (courseFilter) {
            titleQuery = titleQuery.ilike("course", `%${courseFilter}%`);
          }
          if (professorFilter) {
            titleQuery = titleQuery.ilike("professor", `%${professorFilter}%`);
          }

          const { data: titleSources, error: titleSourceErr } = await softQueryTimeout(
            titleQuery,
            "Title keyword source retrieval",
            [] as Array<SourceIdRow & Pick<SourceRow, "lecture_title">>
          );
          if (titleSourceErr) return { data: [], error: titleSourceErr };

          const rankedTitleSources = (
            (titleSources as Array<SourceIdRow & Pick<SourceRow, "lecture_title">>) || []
          )
            .map((row) => ({
              id: row.id,
              hits: countKeywordHits(row.lecture_title ?? "", keywords),
            }))
            .filter((row) => row.hits > 0)
            .sort((a, b) => b.hits - a.hits);
          const bestTitleHits = rankedTitleSources[0]?.hits ?? 0;
          const titleSourceIds =
            bestTitleHits >= 2
              ? rankedTitleSources
                .filter((row) => row.hits === bestTitleHits || row.hits >= 2)
                .slice(0, 10)
                .map((row) => row.id)
              : [];
          if (titleSourceIds.length === 0) return { data: [], error: null };

          return softQueryTimeout(
            supabaseAdmin
              .from("lecture_chunks")
              .select(
                "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
              )
              .in("source_id", titleSourceIds)
              .limit(Math.max(20, maxChunks * 4)),
            "Title keyword chunk retrieval",
            [] as Omit<ChunkRow, "similarity">[]
          );
        })()
        : Promise.resolve({ data: [], error: null }),
      exactSourceIds.length > 0
        ? softQueryTimeout(
          supabaseAdmin
            .from("lecture_chunks")
            .select(
              "source_id, clean_text, timestamp_start_seconds, timestamp_end_seconds, section_hint"
            )
            .in("source_id", exactSourceIds)
            .order("timestamp_start_seconds", { ascending: true })
            .limit(Math.max(20, maxChunks * 4)),
          "Exact title chunk retrieval",
          [] as Omit<ChunkRow, "similarity">[]
        )
        : Promise.resolve({ data: [], error: null }),
    ]);

    const vectorRetrievalError = embeddingError ?? chunkErr?.message ?? null;

    if (isDevLog) {
      console.log("lectureMatches", chunksData ?? []);
      console.log("lectureError", chunkErr ?? null);
    }
    const styleRetrievalError = embedding ? styleErr?.message ?? null : embeddingError;
    if (styleErr && isDevLog) {
      console.log("personaError", styleErr);
    }
    const lexicalRetrievalErrors = [
      exactSourceErr ? `Exact source lookup failed: ${exactSourceErr.message}` : null,
      exactTitleErr ? `Exact title chunk retrieval failed: ${exactTitleErr.message}` : null,
      keywordErr ? `Keyword retrieval failed: ${keywordErr.message}` : null,
      phraseKeywordErr ? `Phrase keyword retrieval failed: ${phraseKeywordErr.message}` : null,
      titleKeywordErr ? `Title keyword retrieval failed: ${titleKeywordErr.message}` : null,
    ].filter((message): message is string => !!message);

    if (lexicalRetrievalErrors.length > 0 && isDevLog) {
      console.log("lexicalRetrievalErrors", lexicalRetrievalErrors);
    }

    const vectorChunks = (chunksData || []) as ChunkRow[];
    const keywordChunks = [
      ...((keywordErr ? [] : keywordData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
      ...c,
      similarity: scoreKeywordChunk(c.clean_text, keywords),
      })),
      ...((phraseKeywordErr ? [] : phraseKeywordData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
        ...c,
        similarity: Math.max(0.92, scoreKeywordChunk(c.clean_text, keywords)),
      })),
      ...((titleKeywordErr ? [] : titleKeywordData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
        ...c,
        similarity: Math.max(0.9, scoreKeywordChunk(c.clean_text, keywords)),
      })),
      ...((exactTitleErr ? [] : exactTitleData || []) as Omit<ChunkRow, "similarity">[]).map((c) => ({
        ...c,
        similarity: Math.max(1.12, scoreKeywordChunk(c.clean_text, keywords)),
      })),
    ];

    const initialChunkMap = new Map<string, ChunkRow>();
    for (const row of [...vectorChunks, ...keywordChunks]) {
      const key = chunkKey(row);
      const prev = initialChunkMap.get(key);
      if (!prev || row.similarity > prev.similarity) {
        initialChunkMap.set(key, row);
      }
    }

    const initialCandidates = Array.from(initialChunkMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.min(40, Math.max(maxChunks * 4, 16)));
    const neighborResult = await fetchNeighborChunks(initialCandidates);
    const chunkMap = new Map<string, ChunkRow>();
    for (const row of [...initialCandidates, ...neighborResult.data]) {
      const key = chunkKey(row);
      const prev = chunkMap.get(key);
      if (!prev || row.similarity > prev.similarity) {
        chunkMap.set(key, row);
      }
    }

    const chunks = Array.from(chunkMap.values());
    const styleSnippets = (styleData || []) as StyleRow[];
    const sourceIds = Array.from(
      new Set([...chunks.map((c) => c.source_id), ...styleSnippets.map((s) => s.source_id)])
    );

    const { data: sourceRows, error: sourceErr } = sourceIds.length
      ? await softQueryTimeout(
        supabaseAdmin
          .from("lecture_sources")
          .select("id, lecture_title, video_url, professor, course")
          .in("id", sourceIds),
        "Source metadata retrieval",
        [] as SourceRow[]
      )
      : { data: [], error: null };

    const sourceMetadataError = sourceErr?.message ?? null;
    if (sourceMetadataError && isDevLog) {
      console.log("sourceMetadataError", sourceMetadataError);
    }

    const sourceMap = new Map<string, SourceRow>(
      ((sourceRows as SourceRow[]) || []).map((row) => [row.id, row])
    );

    const matchesSourceFilters = (sourceId: string) => {
      if (!courseFilter && !professorFilter) return true;
      if (sourceFilterLookupError) return true;
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

    const filteredChunks = chunks.filter((chunk) => matchesSourceFilters(chunk.source_id));
    const filteredStyleSnippets = styleSnippets.filter((snippet) =>
      matchesSourceFilters(snippet.source_id)
    );
    const filteredSourceIds = new Set<string>([
      ...filteredChunks.map((chunk) => chunk.source_id),
      ...filteredStyleSnippets.map((snippet) => snippet.source_id),
    ]);
    const scopedChunksPreThreshold = anyFilterRequested ? filteredChunks : chunks;
    const thresholdedCandidateChunks = scopedChunksPreThreshold.filter(
      (chunk) => chunk.similarity >= minSimilarity
    );
    const droppedLowSimilarityCount =
      scopedChunksPreThreshold.length - thresholdedCandidateChunks.length;
    const scopedChunks = selectDiverseChunks({
      candidates: thresholdedCandidateChunks,
      sourceMap,
      keywords,
      phrases: keywordPhrases,
      maxChunks,
    });
    const scopedStyleSnippets = anyFilterRequested
      ? filteredStyleSnippets
      : styleSnippets;
    const anyFilterApplied = filteredSourceIds.size > 0;

    const context = scopedChunks.map((chunk, i) => {
        const source = sourceMap.get(chunk.source_id);
        return `Chunk ${i + 1}
Course: ${source?.course ?? "Unknown course"}
Lecture: ${source?.lecture_title ?? "Unknown lecture"}
Professor: ${source?.professor ?? "Unknown professor"}
Timestamp: ${chunk.timestamp_start_seconds}s-${chunk.timestamp_end_seconds}s
Section: ${chunk.section_hint ?? "Unknown"}
Similarity: ${chunk.similarity.toFixed(3)}

${truncateText(chunk.clean_text, MAX_CONTEXT_CHARS)}`;
      })
      .slice(0, maxChunks);

    if (isDevLog) {
      console.log("lectureContext", context.join("\n\n---\n\n"));
    }


    const citations = scopedChunks.map((chunk) => {
      const source = sourceMap.get(chunk.source_id);
      return {
        sourceId: chunk.source_id,
        lectureTitle: source?.lecture_title ?? "Unknown lecture",
        professor: source?.professor ?? "Unknown professor",
        course: source?.course ?? "Unknown course",
        videoUrl: isUsableVideoUrl(source?.video_url) ? source.video_url : "",
        timestampStartSeconds: chunk.timestamp_start_seconds,
        timestampEndSeconds: chunk.timestamp_end_seconds,
        timestampUrl: isUsableVideoUrl(source?.video_url)
          ? toVideoTimestampUrl(source.video_url, chunk.timestamp_start_seconds)
          : null,
        excerpt: truncateText(chunk.clean_text, MAX_CITATION_EXCERPT_CHARS),
        sectionHint: chunk.section_hint,
        similarity: chunk.similarity,
      };
    });
    const quality = retrievalQuality(scopedChunks);

    return NextResponse.json({
      question,
      lectureMode: body.lectureMode ?? true,
      retrievalMode: keywords.length > 0 ? "hybrid" : "vector-only",
      retrievalConfidence: quality.confidence,
      keywords,
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
        quality,
        selectedChunkKeys: scopedChunks.map((chunk) => chunkKey(chunk)),
        vectorTopChunkKeys: vectorChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        keywordTopChunkKeys: keywordChunks.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        neighborChunkKeys: neighborResult.data.slice(0, maxChunks).map((chunk) => chunkKey(chunk)),
        neighborRetrievalErrors: neighborResult.errors,
        candidateCounts: {
          vector: vectorChunks.length,
          keyword: keywordChunks.length,
          initialMerged: initialCandidates.length,
          neighbors: neighborResult.data.length,
          thresholded: thresholdedCandidateChunks.length,
        },
        lexicalRetrievalErrors,
        topSimilarityScores: scopedChunks.slice(0, 5).map((chunk) => ({
          key: chunkKey(chunk),
          similarity: chunk.similarity,
        })),
        filters: {
          courseFilter: courseFilter || null,
          professorFilter: professorFilter || null,
          courseFilterApplied: !!courseFilter && anyFilterApplied,
          professorFilterApplied: !!professorFilter && anyFilterApplied,
          filterFallbackUsed: !!sourceFilterLookupError,
          filteredSourceCount: filteredSourceIds.size,
          requestedSourceCandidates: requestedSourceIdSet?.size ?? null,
          noSourceCandidates: false,
          minSimilarityUsed: minSimilarity,
          droppedLowSimilarityCount,
          vectorRetrievalError,
          styleRetrievalError,
          sourceFilterLookupError,
          sourceMetadataError,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
