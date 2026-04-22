const CHAT_URL = process.env.NIKI_CHAT_URL ?? "http://localhost:3000/api/chat";
const RAG_URL = process.env.NIKI_RAG_URL ?? "http://localhost:3000/api/rag/query";

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
    id: "unknown-course-safe",
    description: "Unknown lecture domain should not hallucinate a course list.",
    body: {
      message: "Quantum pancake calculus lectures",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/do not invent|don't have|no lecture retrieval context|specific/i],
    reject: [/Quantum Pancake.*Watch:/i],
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
    ragQuestion: "what is the youtube video for Calculus1 3.2 Derivative as a Function?",
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
    expect: [/Lecture Recovery/i, /Derivative as a Function/i, /Lecture Trail/i, /Timestamped Clips/i],
    reject: [/Board Setup[\s\S]{0,200}Suppose we need to find/i],
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
    expect: [/Lecture Recovery/i, /Derivative as a Function/i, /Lecture Trail/i, /Timestamped Clips/i],
    reject: [/Board Setup[\s\S]{0,200}Suppose we need to find/i],
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
    expect: [/Lecture Recovery/i, /Derivative as a Function/i],
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
  const response = await fetch(url, {
    method: "POST",
    headers: chatHeaders,
    body: JSON.stringify(body),
  });
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
