const CHAT_URL = process.env.NIKI_CHAT_URL ?? "http://localhost:3000/api/chat";
const RAG_URL = process.env.NIKI_RAG_URL ?? "http://localhost:3000/api/rag/query";
const REQUEST_TIMEOUT_MS = Number(process.env.RAG_NIGHTMARE_REQUEST_TIMEOUT_MS ?? 45000);

const chatHeaders = { "Content-Type": "application/json" };

const scenarios = [
  {
    id: "ask-available-lectures",
    description: "Generic lecture inventory should ask for a topic/course.",
    body: {
      message: "what lectures do you have?",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/What topic or course do you want lectures for/i, /Calculus 1/i, /Differential Equations/i],
  },
  {
    id: "course-only-followup",
    description: "A bare course name should list lectures, not solve a generic math problem.",
    body: {
      message: "Calculus 1",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Calculus1/i, /Watch:/i],
    reject: [/Board Setup/i, /Step-by-Step Solution/i],
  },
  {
    id: "calc2-list",
    description: "Calc 2 should list Calc 2 lectures.",
    body: {
      message: "Calc 2",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Calculus2/i, /Watch:/i],
  },
  {
    id: "calculus1-nospace-list",
    description: "No-space Calculus1 alias should list Calculus 1 lectures.",
    body: {
      message: "Calculus1",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Calculus1/i, /Watch:/i],
    reject: [/Board Setup/i, /Step-by-Step Solution/i],
  },
  {
    id: "calc3-list",
    description: "Calc 3 should list Calc 3 lectures.",
    body: {
      message: "Calc 3",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Calculus3/i, /Watch:/i],
  },
  {
    id: "precalc-list",
    description: "PreCalc alias should list PreCalc lectures.",
    body: {
      message: "PreCalc",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/PreCalc/i, /Watch:/i],
  },
  {
    id: "precalc1-question-mark-list",
    description: "Precalc 1 with punctuation should not be mistaken for Calculus 1.",
    body: {
      message: "Precalc 1?",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/PreCalc1/i, /Precalculus/i, /Watch:/i],
    reject: [/Calculus1 2\.2 Intro to Limits/i, /Derivative as a Function/i],
  },
  {
    id: "elementary-algebra-list",
    description: "Elementary Algebra should list algebra lectures.",
    body: {
      message: "Elementary Algebra",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Algebra/i, /Watch:/i],
  },
  {
    id: "course-history-followup-list",
    description: "After a course is mentioned, show all lectures should use that course instead of asking again.",
    body: {
      message: "Show me all the lectures",
      history: [
        { role: "user", content: "Calc 2" },
        {
          role: "assistant",
          content:
            "Got it. We're focusing on Calculus 2. What specific lectures or topics are you referring to?",
        },
      ],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Calculus2/i, /Watch:/i],
    reject: [/What topic or course do you want lectures for/i],
  },
  {
    id: "statistics-list",
    description: "Statistics should list statistics lectures.",
    body: {
      message: "Statistics",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Stat/i, /Watch:/i],
  },
  {
    id: "lecture-counts",
    description: "Lecture counts should return by-course counts.",
    body: {
      message: "how many lectures do you have?",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/unique lectures indexed/i, /By course/i],
  },
  {
    id: "broad-integration-clarification",
    description: "Bare broad topics should ask for a subtopic instead of guessing a lecture path.",
    body: {
      message: "integration",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Which part of integration/i, /u-substitution/i, /integration by parts/i],
    reject: [/Watch:/i, /Final Answer/i],
  },
  {
    id: "unknown-course-safe",
    description: "Unknown lecture domain should not hallucinate a course list.",
    body: {
      message: "Quantum pancake calculus lectures",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/do not invent|don't have|no lecture retrieval context|specific|No direct lecture source found|general knowledge if you want/i],
    reject: [/Quantum Pancake.*Watch:/i],
  },
  {
    id: "unsupported-organic-chemistry-source-honesty",
    description: "Lecture Mode should not fabricate lecture grounding for unrelated organic chemistry.",
    body: {
      message: "Use my lecture notes to explain organic chemistry reaction mechanisms.",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/No direct lecture source found for this topic/i, /general knowledge if you want/i],
    reject: [/\*\*Lecture Source\*\*/i, /Watch:/i, /organic chemistry lecture/i],
  },
  {
    id: "unsupported-roman-history-source-honesty",
    description: "Lecture Mode should not fabricate what Nemanja said about unrelated history.",
    body: {
      message: "What does Nemanja say about ancient Roman history?",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/No direct lecture source found for this topic/i, /general knowledge if you want/i],
    reject: [/\*\*Lecture Source\*\*/i, /Watch:/i, /Roman history lecture/i],
  },
  {
    id: "unsupported-medieval-poetry-source-honesty",
    description: "Lecture Mode should not fabricate lecture grounding for unrelated medieval poetry.",
    body: {
      message: "Use my lecture notes to explain medieval poetry.",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/No direct lecture source found for this topic/i, /general knowledge if you want/i],
    reject: [/\*\*Lecture Source\*\*/i, /Watch:/i, /medieval poetry lecture/i],
  },
  {
    id: "unsupported-quantum-mechanics-source-honesty",
    description: "Lecture Mode should not fabricate lecture grounding for unrelated quantum mechanics.",
    body: {
      message: "What does Nemanja say about quantum mechanics?",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/No direct lecture source found for this topic/i, /general knowledge if you want/i],
    reject: [/\*\*Lecture Source\*\*/i, /Watch:/i, /quantum mechanics lecture/i],
  },
  {
    id: "video-link-lookup",
    description: "Known lecture video lookup should return a usable YouTube URL.",
    body: {
      message: "what is the youtube video for Calculus1 3.2 Derivative as a Function?",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Derivative as a Function/i, /https:\/\/www\.youtube\.com\/watch\?v=/i],
    reject: [/UNKNOWN/i, /link unavailable/i],
  },
  {
    id: "lecture-recovery-exact",
    description: "Exact missed-class request should produce grounded lecture recovery.",
    body: {
      message: "please lecture me on Calculus1 3.2 Derivative as a Function I wasnt in class",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    ragQuestion: "please lecture me on Calculus1 3.2 Derivative as a Function I wasnt in class",
    expect: [/Lecture Recovery/i, /Derivative as a Function/i, /Board Setup/i, /Lecture Walkthrough/i, /Intuition/i, /Definition/i, /Shortcut/i, /Application/i, /Concept Check/i, /Visual\/Board Memory/i, /Office Hours Check/i, /Source Trail/i, /Source Evidence/i, /Timestamped Clips/i],
    reject: [/Board Setup[\s\S]{0,200}Suppose we need to find/i, /^1\.\s+Nemanja[\s\S]{0,1000}^6\.\s+Nemanja/im, /Retrieved Lecture Trail/i],
  },
  {
    id: "lecture-recovery-internal-fallback",
    description: "Exact missed-class request should recover the lecture even when the frontend did not prefetch RAG context.",
    body: {
      message: "please lecture me on Calculus1 3.2 Derivative as a Function I wasnt in class",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Lecture Recovery/i, /Derivative as a Function/i, /Board Setup/i, /Lecture Walkthrough/i, /Intuition/i, /Definition/i, /Shortcut/i, /Application/i, /Concept Check/i, /Visual\/Board Memory/i, /Office Hours Check/i, /Source Trail/i, /Source Evidence/i, /Timestamped Clips/i],
    reject: [/Board Setup[\s\S]{0,200}Suppose we need to find/i, /^1\.\s+Nemanja[\s\S]{0,1000}^6\.\s+Nemanja/im, /Retrieved Lecture Trail/i],
  },
  {
    id: "lecture-recovery-short-title",
    description: "Short title request should still recover the target lecture.",
    body: {
      message: "lecture me on 3.2 derivative as a function",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    ragQuestion: "lecture me on 3.2 derivative as a function",
    expect: [/Lecture Recovery/i, /Derivative as a Function/i, /Board Setup/i, /Lecture Walkthrough/i, /Intuition/i, /Definition/i, /Shortcut/i, /Application/i, /Concept Check/i, /Visual\/Board Memory/i, /Office Hours Check/i, /Source Trail/i],
    reject: [/Retrieved Lecture Trail/i],
  },
  {
    id: "lecture-recovery-calc2-power-series",
    description: "Course-topic lecture requests should recover a taught lesson, not list the course inventory.",
    body: {
      message: "Can we do a lecture on calc 2 power series?",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    ragQuestion: "Can we do a lecture on calc 2 power series?",
    expect: [/Lecture Recovery/i, /Power Series/i, /Board Setup/i, /Lecture Walkthrough/i, /Intuition/i, /Definition/i, /Shortcut/i, /Application/i, /Concept Check/i, /Office Hours Check/i, /Source Trail/i],
    reject: [/^1\.\s+Nemanja[\s\S]{0,1000}^6\.\s+Nemanja/im],
  },
  {
    id: "lecture-recovery-calc2-alternating-series",
    description: "Alternating Series Test requests should become a taught lesson and avoid raw transcript or red-LaTeX theorem dumps.",
    body: {
      message: "I can't figure out AST and don't understand alternating series",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    ragQuestion: "I can't figure out AST and don't understand alternating series",
    expect: [/Lecture Recovery|Alternating Series|AST/i, /Board Setup/i, /Intuition/i, /Definition/i, /Shortcut/i, /Application/i, /Concept Check/i, /Office Hours Check/i, /Source Trail/i],
    reject: [/The AST states that an alternating series \\sum/i, /\\lim_\{n \\to \\infty\} b_n = 0/i, /^1\.\s+Nemanja[\s\S]{0,1000}^6\.\s+Nemanja/im, /Retrieved Lecture Trail/i],
  },
  {
    id: "lecture-recovery-stats-probability",
    description: "Statistics lecture recovery should stay in statistics/probability instead of inheriting derivative language from noisy retrieval.",
    body: {
      message: "Lecture me on statistics probability",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    ragQuestion: "Lecture me on statistics probability",
    expect: [/Lecture Recovery/i, /Probability|Statistics/i, /Board Setup/i, /Intuition/i, /Definition/i, /Shortcut/i, /Application/i, /Concept Check/i, /Office Hours Check/i, /Source Trail/i],
    reject: [/horizontal tangent/i, /derivative value 0/i, /local maximum and minimum/i],
  },
  {
    id: "lecture-recovery-diffeq",
    description: "Differential equations lecture recovery should become a real lesson with DE structure.",
    body: {
      message: "Lecture me on differential equations separable equations",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    ragQuestion: "Lecture me on differential equations separable equations",
    expect: [/Lecture Recovery/i, /Differential|Equation|ODE/i, /Board Setup/i, /Intuition/i, /Definition/i, /Shortcut/i, /Application/i, /Concept Check/i, /Office Hours Check/i, /Source Trail/i],
    reject: [/^1\.\s+Nemanja[\s\S]{0,1000}^6\.\s+Nemanja/im],
  },
  {
    id: "course-topic-search-calc2-ibp",
    description: "Shorthand command/search should return the best Calculus 2 integration by parts match first.",
    body: {
      message: "Calc 2 IBP",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Best match for Calculus 2 integration by parts/i, /8\.2 Integration by Parts/i, /Watch:/i],
    reject: [/Board Setup/i, /Step-by-Step Solution/i],
  },
  {
    id: "course-topic-search-diffeq-separable",
    description: "Differential equations shorthand should produce a targeted best match or narrowed set, not a generic lesson.",
    body: {
      message: "Diff Eq separable",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Best match for Differential Equations separable equations|I found a few likely Differential Equations matches for separable equations/i, /Watch:/i],
    reject: [/Board Setup/i, /Step-by-Step Solution/i],
  },
  {
    id: "course-topic-search-precalc-functions",
    description: "PreCalc shorthand should return the strongest function lecture match directly.",
    body: {
      message: "PreCalc functions",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Best match for PreCalc1 functions/i, /Functions and Graphs/i, /Watch:/i],
    reject: [/Board Setup/i, /Step-by-Step Solution/i],
  },
  {
    id: "course-topic-search-elementary-linear-equations",
    description: "Elementary Algebra shorthand should narrow to a small targeted result set.",
    body: {
      message: "Elem Alg linear equations",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Best match for Elementary Algebra linear equations|I found a few likely Elementary Algebra matches for linear equations/i, /Watch:/i],
    reject: [/Board Setup/i, /Step-by-Step Solution/i],
  },
  {
    id: "wrong-exact-lecture-safe",
    description: "A made-up exact lecture number/title should not be presented as a real lecture.",
    body: {
      message: "lecture me on Calculus1 99.9 Dragon Integrals",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/no lecture retrieval context|specific lecture|provide|available|do not have/i],
    reject: [/Lecture Recovery/i, /Dragon Integrals[\s\S]{0,200}Watch:/i],
  },
  {
    id: "no-hallucinated-empty-lecture-mode",
    description: "Lecture mode without retrieval context should not invent lecture specifics.",
    body: {
      message: "lecture me on a fake lecture called Bananas 9.9",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/no lecture retrieval context|specific lecture|provide|available/i],
    reject: [/Bananas 9\.9[\s\S]{0,200}Watch:/i],
  },
];

async function postText(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: chatHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${url} request failed or timed out after ${REQUEST_TIMEOUT_MS}ms: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

async function withRagContext(scenario) {
  if (!scenario.ragQuestion) return scenario.body;

  const ragText = await postText(RAG_URL, {
    question: scenario.ragQuestion,
    lectureMode: true,
    maxChunks: 8,
    maxStyleSnippets: 4,
  });
  const rag = JSON.parse(ragText);
  return {
    ...scenario.body,
    ragContext: rag.context ?? [],
    ragStyleSnippets: rag.styleSnippets ?? [],
    ragCitations: rag.citations ?? [],
  };
}

function assertScenario(scenario, output) {
  const failures = [];
  for (const pattern of scenario.expect ?? []) {
    if (!pattern.test(output)) failures.push(`missing ${pattern}`);
  }
  for (const pattern of scenario.reject ?? []) {
    if (pattern.test(output)) failures.push(`rejected pattern present ${pattern}`);
  }
  return failures;
}

let failed = false;
for (const scenario of scenarios) {
  try {
    const body = await withRagContext(scenario);
    const output = await postText(CHAT_URL, body);
    const failures = assertScenario(scenario, output);
    if (failures.length) {
      failed = true;
      console.error(`❌ [RAG] ${scenario.id}: ${scenario.description}`);
      console.error(`   ${failures.join("; ")}`);
      console.error(output.slice(0, 1200));
    } else {
      console.log(`✅ ${scenario.id}`);
    }
  } catch (error) {
    failed = true;
    console.error(`❌ [REQ] ${scenario.id}: ${scenario.description}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed) process.exit(1);
