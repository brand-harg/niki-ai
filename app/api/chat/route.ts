export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { detectCourseFilter } from "@/lib/courseFilters";

type Difficulty = "easy" | "exam" | "challenge";

type ChatRequest = {
  message?: string;
  isNikiMode?: boolean;
  userName?: string;
  userId?: string;
  chatId?: string;
  trainConsent?: boolean;
  history?: { role: string; content: string }[];
  base64Image?: string;
  imageMediaType?: string;
  textFileContent?: string;
  textFileName?: string;
  lectureMode?: boolean;
  difficulty?: Difficulty;
  practiceMode?: boolean;

  ragContext?: string[];
  ragStyleSnippets?: { text: string; personaTag?: string }[];
  ragCitations?: {
    lectureTitle?: string;
    professor?: string;
    course?: string;
    timestampStartSeconds?: number;
    timestampUrl?: string | null;
  }[];
};

type LectureCitation = NonNullable<ChatRequest["ragCitations"]>[number];

type LectureSourceRow = {
  lecture_title: string | null;
  course: string | null;
  professor: string | null;
  video_url: string | null;
};

function wantsStepByStep(message: string): boolean {
  return /(step[-\s]?by[-\s]?step|show every step|all steps|detailed steps|walk me through|show work)/i.test(
    message
  );
}

function wantsDeeperExplanation(message: string): boolean {
  return /(i do(n't| not) understand|explain more|how did you get|why|break it down|teach me|more detail|i('| a)?m lost)/i.test(
    message
  );
}

function wantsThoughtTrace(message: string): boolean {
  return /(thought trace|reasoning trace|show reasoning|show thought process)/i.test(message);
}

function isExpansionRequest(message: string): boolean {
  return /(more steps|explain more|more detail|i('| a)?m lost|break it down more|expand this)/i.test(
    message
  );
}

function isPracticeRequest(message: string): boolean {
  return /(give me practice|make practice problems|similar problems|more problems|quiz me|test me|generate problems)/i.test(
    message
  );
}

function isLectureSummaryRequest(message: string): boolean {
  return /(summarize the lecture|teach me the lecture|i missed the lecture|what did the lecture cover|explain the lecture)/i.test(
    message
  );
}

function isLikelyMathQuestion(message: string): boolean {
  return /(\bintegral\b|\bderivative\b|\bdifferentiate\b|\bsolve\b|\blimit\b|\bmatrix\b|\bprobability\b|\bstatistic\b|\bmean\b|\bvariance\b|\bstandard deviation\b|\btrig\b|\bsin\b|\bcos\b|\btan\b|\bproof\b|\bequation\b|\bfunction\b|\bvector\b|\bdeterminant\b|\beigen\b|\bdistribution\b|[\dxy]\s*[\+\-\*\/\^]\s*[\dxy]|\\int|\\frac|\$)/i.test(
    message
  );
}

function isCodingQuestion(message: string, textFileName?: string, textFileContent?: string): boolean {
  if (textFileName && /\.(ts|tsx|js|jsx|py|java|cpp|c|cs|go|rs|php|rb|swift|kt|sql|html|css|json|yaml|yml|md)$/i.test(textFileName)) {
    return true;
  }

  if (textFileContent && /(?:function|const|let|var|class|def |import |export |return |if\s*\(|for\s*\(|while\s*\(|SELECT |INSERT |UPDATE |CREATE TABLE)/.test(textFileContent)) {
    return true;
  }

  return /(\bcode\b|\bprogram\b|\bdebug\b|\berror\b|\btypescript\b|\bjavascript\b|\bpython\b|\bjava\b|\breact\b|\bnext\.js\b|\bsql\b|\balgorithm\b|\bfunction\b|\bclass\b|\bcomponent\b|\bapi\b|\broute\b|\bstack trace\b|\bcompiler\b|\bsyntax\b)/i.test(
    message
  );
}

function isLectureListIntent(message: string): boolean {
  return /(what lectures do you have|list .*lectures|list me .*lectures|all .*lectures)/i.test(message);
}

function isVideoLookupIntent(message: string): boolean {
  return /(what is the youtube video|what's the youtube video|youtube video|video link|what is the video|what's the video)/i.test(
    message
  );
}

function isCalc1LectureListIntent(message: string): boolean {
  return /(calc 1|calculus 1)/i.test(message) && /(list|lectures|all)/i.test(message);
}

function formatSeconds(seconds?: number): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "unknown time";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function dedupeCitations(citations: LectureCitation[]): LectureCitation[] {
  const seen = new Set<string>();
  const out: LectureCitation[] = [];

  for (const cite of citations) {
    const key = [
      cite.lectureTitle ?? "",
      cite.course ?? "",
      cite.professor ?? "",
      cite.timestampStartSeconds ?? "",
      cite.timestampUrl ?? "",
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      out.push(cite);
    }
  }

  return out;
}

function uniqueLectures(citations: LectureCitation[]): LectureCitation[] {
  const seen = new Set<string>();
  const out: LectureCitation[] = [];

  for (const cite of citations) {
    const key = [cite.lectureTitle ?? "", cite.course ?? "", cite.professor ?? ""].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cite);
    }
  }

  return out;
}

async function getLecturesByCourse(courseFilter: string): Promise<LectureSourceRow[]> {
  const { data, error } = await supabase
    .from("lecture_sources")
    .select("lecture_title, course, professor, video_url")
    .ilike("course", `%${courseFilter}%`)
    .order("lecture_title", { ascending: true });

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const deduped: LectureSourceRow[] = [];

  for (const row of (data ?? []) as LectureSourceRow[]) {
    const key = [
      row.lecture_title ?? "",
      row.course ?? "",
      row.professor ?? "",
      row.video_url ?? "",
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  return deduped;
}

function buildCitationLectureReply(
  message: string,
  citations: LectureCitation[]
): string | null {
  if (!isLectureListIntent(message) && !isVideoLookupIntent(message)) return null;

  const deduped = uniqueLectures(dedupeCitations(citations));
  if (deduped.length === 0) {
    return "I don't have any matching lecture metadata in my database for that request.";
  }

  if (isVideoLookupIntent(message)) {
    const firstWithUrl = deduped.find((c) => c.timestampUrl);
    if (!firstWithUrl) {
      return "I found lecture context, but I do not have a usable video link for it in the database.";
    }

    return [
      `${firstWithUrl.lectureTitle ?? "Unknown lecture"}`,
      `${firstWithUrl.course ?? "Unknown course"} · ${firstWithUrl.professor ?? "Unknown professor"} · ${formatSeconds(firstWithUrl.timestampStartSeconds)}`,
      `Watch: ${firstWithUrl.timestampUrl}`,
    ].join("\n");
  }

  return deduped
    .map((c, i) => {
      const title = c.lectureTitle ?? "Unknown lecture";
      const course = c.course ?? "Unknown course";
      const professor = c.professor ?? "Unknown professor";
      const watch = c.timestampUrl ? `\nWatch: ${c.timestampUrl}` : "";
      return `${i + 1}. ${title}\n${course} · ${professor}${watch}`;
    })
    .join("\n\n");
}

function buildDifficultyRules(difficulty: Difficulty): string {
  switch (difficulty) {
    case "easy":
      return `
DIFFICULTY — EASY:
- Prefer approachable explanations.
- Use simpler numbers/examples when generating practice.
- Emphasize intuition and setup.
- Avoid jumping steps.
`.trim();
    case "challenge":
      return `
DIFFICULTY — CHALLENGE:
- Use more rigorous explanations.
- Allow more advanced problem variations.
- Include subtle pitfalls or non-trivial twists when generating practice.
- Keep the solution precise and not over-simplified.
`.trim();
    case "exam":
    default:
      return `
DIFFICULTY — EXAM:
- Aim for typical quiz/test level.
- Be clear, efficient, and solution-focused.
- Prioritize what a student would need under exam conditions.
`.trim();
  }
}

function buildSystemPrompt({
  isProfessorMode,
  userName,
  includeThoughtTrace,
  personalContext,
  styleInstructions,
  lectureMode,
  forceStructuredMath,
  isCoding,
  difficulty,
  practiceMode,
}: {
  isProfessorMode: boolean;
  userName: string;
  includeThoughtTrace: boolean;
  personalContext?: string;
  styleInstructions?: string;
  lectureMode: boolean;
  forceStructuredMath: boolean;
  isCoding: boolean;
  difficulty: Difficulty;
  practiceMode: boolean;
}) {
  const modeLayer = isProfessorMode
    ? `
MODE — PROFESSOR:
- You are NikiAI in Professor Mode.
- Keep the same correctness and formatting discipline as Pure Logic mode.
- Change only the teaching style: more instructor-like, more pedagogical, more pointed.
- Be direct, rigorous, and structured.
- No fake enthusiasm, no filler, no unnecessary praise.
- If the student is wrong, state clearly where the logic breaks.
`
    : `
MODE — PURE LOGIC:
- You are a high-level reasoning assistant in Pure Logic mode.
- Be concise, neutral, and precise.
- Focus on solving and explaining clearly and efficiently.
- No roleplay or personality-heavy language.
`;

  const thoughtTraceLayer = includeThoughtTrace
    ? `
THOUGHT TRACE:
- Only include one <think>...</think> block before the answer.
- Keep it brief and strategy-level.
- Do not dump raw algebra or large code traces inside it.
- Keep it under 6 short lines.
`
    : `
THOUGHT TRACE:
- Do not output any <think>...</think> tags unless explicitly requested.
`;

  const lectureLayer = lectureMode
    ? `
LECTURE MODE:
- Lecture mode is a content and teaching enhancement layer, not a formatting layer.
- If lecture context is provided separately, use it as the primary grounding source when relevant.
- Use lecture-aligned terminology, ordering, emphasis, examples, and pacing when supported.
- Help the user recover missed lecture material, reconstruct lesson flow, and connect this problem to prior lecture patterns.
- When appropriate, identify what prerequisite idea the user may have missed.
- If asked, generate similar practice problems aligned to the retrieved lecture style and level.
- If no lecture context supports a lecture-specific claim, say so plainly and do not invent details.
`
    : "";

  const mathLayer = forceStructuredMath
    ? `
MATH RESPONSE STRUCTURE (ALL MATH):
- Use this structure for all math topics, including algebra, calculus, trig, linear algebra, statistics, proofs, and word problems:
  1) ## Specific Title
  2) Short intro (1–2 sentences)
  3) One $$...$$ formula block if relevant
  4) ---
  5) ## Step-by-Step Solution
  6) ### Step 1
  7) ### Step 2
  8) Continue with more steps only as needed
  9) ---
  10) ## Final Answer
  11) Final result in ONE standalone $$...$$ block
  12) One short closing sentence

STEP RULES:
- Each step should represent one meaningful transformation.
- Combine very small sub-steps when they naturally belong together.
- Do not over-fragment simple algebra.
- Do not compress several meaningful transformations into one long step.
- Use bullets for setup, definitions, variable choices, helper values, or case setup.
- Use $$...$$ for formulas, transformations, and final results.
- Use $...$ for short expressions inside sentences.
- If the user asks for more steps, expand the same structure instead of rewriting from scratch.

ALL-MATH ADAPTATION:
- Procedural problems: solve step by step.
- Conceptual questions: explain clearly with fewer calculations.
- Word problems: define variables, translate to math, solve, interpret.
- Multi-part problems: break into Part (a), (b), (c) while keeping the same layout.
- Proof-style questions: keep a logical structured flow without forcing fake algebraic steps where they do not belong.

LATEX RULES (STRICT):
- Inline math MUST use $...$
- Display math MUST use $$...$$
- Never output raw LaTeX outside delimiters
- Never output a single "$" on its own line
- Never mix plain text with raw LaTeX on the same math line
- Never use \\( \\) or \\[ \\]
- Never use \\boxed{}
- Do not place multiple unrelated equations on the same line
- If a line contains LaTeX commands like \\int, \\ln, \\frac, or \\sqrt, wrap the full expression correctly
`
    : `
GENERAL RESPONSE STRUCTURE:
- Be clear, readable, and consistent.
- If the question is technical or analytical, break it into logical sections when useful.
`;

  const codingLayer = isCoding
    ? `
CODE EXPLANATION + WRITING:
- Be strong at writing, explaining, and debugging code in every mode.
- When explaining code, be precise and practical.
- For code help, clearly identify:
  1) what the code does
  2) what is wrong, if anything
  3) how to fix it
  4) why the fix works
- When writing code:
  - prefer correctness, readability, and maintainability
  - avoid unnecessary cleverness
  - preserve the user's architecture unless a redesign is clearly needed
  - include comments only where they actually help
- If the user asks for debugging, explain the root cause, not just the patch.
- If the user asks for a rewrite, provide code that is directly usable.
- If the user asks for explanation, explain like a strong TA or professor, depending on mode.
`
    : "";

  const practiceLayer = practiceMode
    ? `
PRACTICE MODE:
- The user wants learning support, not just the answer.
- When appropriate, generate practice problems that match the current topic and requested difficulty.
- If lecture mode is on and lecture context exists, make practice similar to the lecture style and level.
- Prefer a small, useful set of practice problems over a huge dump.
- If giving practice, separate problems from solutions clearly.
`
    : "";

  const difficultyLayer = buildDifficultyRules(difficulty);

  return `
You are a high-level assistant focused on math, technical reasoning, and code explanation.

CORE RULES:
- Prioritize correctness, consistency, clarity, and stable formatting.
- Do not change layout style randomly between similar responses.
- Be good at both math and code explanation.

${modeLayer}

${lectureLayer}

${difficultyLayer}

${practiceLayer}

${thoughtTraceLayer}

${mathLayer}

${codingLayer}

GENERAL WRITING RULES:
- For non-math, non-code writing tasks, respond in clean natural prose.
- Do not over-format simple responses.
- Use markdown only when it improves readability.

User: ${userName}
${personalContext ? `\n${personalContext}` : ""}
${styleInstructions ? `\n${styleInstructions}` : ""}
`.trim();
}

function buildLectureContextSystemMessage({
  ragContext,
  ragStyleSnippets,
  ragCitations,
}: {
  ragContext: string[];
  ragStyleSnippets: { text: string; personaTag?: string }[];
  ragCitations: LectureCitation[];
}): string {
  const factual = ragContext
    .slice(0, 6)
    .map((chunk, i) => `Context ${i + 1}:\n${chunk}`)
    .join("\n\n");

  const style = ragStyleSnippets
    .slice(0, 3)
    .map(
      (snippet, i) =>
        `Style ${i + 1} (${snippet.personaTag ?? "teaching_style"}):\n${snippet.text}`
    )
    .join("\n\n");

  const citations = ragCitations
    .slice(0, 6)
    .map((cite, i) => {
      const ts = formatSeconds(cite.timestampStartSeconds);
      return `${i + 1}. ${cite.lectureTitle ?? "Unknown lecture"} (${cite.course ?? "Unknown course"} · ${cite.professor ?? "Unknown professor"}) @ ${ts}${cite.timestampUrl ? ` -> ${cite.timestampUrl}` : ""}`;
    })
    .join("\n");

  return `
LECTURE CONTEXT (STRICT):
- Use this as the primary lecture grounding source when relevant.
- Prioritize lecture terminology, phrasing, examples, method order, and emphasis when supported.
- If the context does not support a lecture-specific claim, say so clearly.
- Do not invent lecture titles, section numbers, timestamps, or professor-specific details beyond what is provided here.

=== LECTURE FACTS START ===
${factual || "No retrieved chunks."}
=== LECTURE FACTS END ===

=== LECTURE STYLE START ===
${style || "No style snippets."}
=== LECTURE STYLE END ===

=== LECTURE CITATIONS START ===
${citations || "No citations."}
=== LECTURE CITATIONS END ===
`.trim();
}

function buildUserMessageContent({
  message,
  textFileContent,
  textFileName,
  latestAssistantMessage,
  practiceMode,
}: {
  message: string;
  textFileContent?: string;
  textFileName?: string;
  latestAssistantMessage?: string;
  practiceMode: boolean;
}): string {
  let userMessageContent = message;

  if (textFileContent) {
    const fileContext = `The user attached a file named "${textFileName}".\n\nFile contents:\n\`\`\`\n${textFileContent}\n\`\`\``;
    userMessageContent = userMessageContent
      ? `${userMessageContent}\n\nAttached file context:\n${fileContext}`
      : fileContext;
  }

  if (practiceMode && !isPracticeRequest(userMessageContent)) {
    userMessageContent = `${userMessageContent}\n\nThe user would like practice support when useful.`;
  }

  if (isExpansionRequest(message) && latestAssistantMessage) {
    const previousAnswer = latestAssistantMessage.slice(0, 6000);

    userMessageContent = `
EXPANSION TASK:
- Expand the previous answer with more detail.
- Preserve the same structure, numbering, and flow.
- Keep prior wording where possible.
- Insert missing intermediate steps instead of rewriting from scratch.

Previous answer:
<previous_answer>
${previousAnswer}
</previous_answer>

User follow-up:
${message}
`.trim();
  }

  return userMessageContent || "Please respond to the user's request.";
}

function extractJsonObjects(input: string): {
  objects: string[];
  remainder: string;
} {
  const objects: string[] = [];

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let startIndex = -1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      if (depth === 0) startIndex = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        objects.push(input.slice(startIndex, i + 1));
        startIndex = -1;
      }
    }
  }

  if (depth > 0 && startIndex !== -1) {
    return { objects, remainder: input.slice(startIndex) };
  }

  return { objects, remainder: "" };
}

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json();

    const message = body.message?.trim() || "";
    const history = body.history || [];
    const isNikiMode = body.isNikiMode ?? true;
    const userName = body.userName?.trim() || "User";
    const userId = body.userId?.trim() || "";
    const base64Image = body.base64Image;
    const imageMediaType = body.imageMediaType;
    const textFileContent = body.textFileContent;
    const textFileName = body.textFileName;
    const lectureMode = body.lectureMode ?? false;
    const difficulty = body.difficulty ?? "exam";
    const practiceMode = body.practiceMode ?? false;

    const ragContext = body.ragContext ?? [];
    const ragStyleSnippets = body.ragStyleSnippets ?? [];
    const ragCitations = dedupeCitations(body.ragCitations ?? []);

    const hasImage = !!base64Image;
    const hasTextFile = !!textFileContent;
    const isDevLog = process.env.NODE_ENV !== "production";

    if (!message && !hasImage && !hasTextFile) {
      return NextResponse.json(
        { reply: "Please enter a message or attach a file." },
        { status: 400 }
      );
    }

    if (isDevLog) {
      console.log("\n=============================");
      console.log(`🧠 User asked: "${message || "[file only]"}"`);
      console.log(`📎 Image: ${hasImage} | Text file: ${hasTextFile}`);
      if (hasImage && imageMediaType) console.log(`🖼️ Image type: ${imageMediaType}`);
      console.log("🌊 STREAMING ONLINE: Connecting to Ollama...");
    }

    const profile = userId
      ? (
        await supabase
          .from("profiles")
          .select("about_user, response_style")
          .eq("id", userId)
          .maybeSingle()
      ).data
      : null;

    const personalContext = profile?.about_user
      ? `User context: ${profile.about_user}`
      : "";

    const styleInstructions = profile?.response_style
      ? `Response style: ${profile.response_style}`
      : "";

    const detectedCourse = detectCourseFilter(message);
    const isDetectedCourseLectureIntent =
      !!detectedCourse && /(list|lectures|all|show)/i.test(message);

    if (lectureMode && (isCalc1LectureListIntent(message) || isDetectedCourseLectureIntent)) {
      const courseFilter = detectedCourse ?? "Calculus 1";
      const lectures = await getLecturesByCourse(courseFilter);

      if (!lectures.length) {
        return new Response(`I don't have any ${courseFilter} lectures in the database.`, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      const reply = lectures
        .map((lecture, i) => {
          const title = lecture.lecture_title ?? "Unknown lecture";
          const course = lecture.course ?? "Unknown course";
          const professor = lecture.professor ?? "Unknown professor";
          const watch =
            lecture.video_url && !lecture.video_url.includes("UNKNOWN")
              ? `\nWatch: ${lecture.video_url}`
              : "";
          return `${i + 1}. ${title}\n${course} · ${professor}${watch}`;
        })
        .join("\n\n");

      return new Response(reply, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (lectureMode) {
      const directLectureReply = buildCitationLectureReply(message, ragCitations);
      if (directLectureReply) {
        return new Response(directLectureReply, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    const formattedHistory = history
      .filter((msg) => msg.content?.trim() && msg.content !== "What do you need help with?")
      .slice(-8)
      .map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.content,
      }));

    const latestAssistantMessage = [...history]
      .reverse()
      .find(
        (msg) =>
          msg.role === "ai" &&
          typeof msg.content === "string" &&
          msg.content.trim().length > 0
      )?.content;

    const includeThoughtTrace = wantsThoughtTrace(message);
    const forceStructuredMath =
      isLikelyMathQuestion(message) ||
      wantsStepByStep(message) ||
      wantsDeeperExplanation(message);

    const isCoding =
      isCodingQuestion(message, textFileName, textFileContent) ||
      /```/.test(message) ||
      /route|api|supabase|ollama/i.test(message);

    const systemPrompt = buildSystemPrompt({
      isProfessorMode: isNikiMode,
      userName,
      includeThoughtTrace,
      personalContext,
      styleInstructions,
      lectureMode,
      forceStructuredMath,
      isCoding,
      difficulty,
      practiceMode,
    });

    const lectureContextSystemContent =
      lectureMode &&
        (ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0)
        ? buildLectureContextSystemMessage({
          ragContext,
          ragStyleSnippets,
          ragCitations,
        })
        : "";

    const userMessageContent = buildUserMessageContent({
      message,
      textFileContent,
      textFileName,
      latestAssistantMessage,
      practiceMode: practiceMode || isPracticeRequest(message) || isLectureSummaryRequest(message),
    });

    const userMessage: Record<string, unknown> = {
      role: "user",
      content: userMessageContent || "Please respond to the user's request.",
    };

    if (hasImage) {
      userMessage.images = [base64Image];
    }

    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      ...(lectureContextSystemContent
        ? [{ role: "system" as const, content: lectureContextSystemContent }]
        : lectureMode
          ? [
            {
              role: "system" as const,
              content:
                "Lecture mode is enabled, but no lecture retrieval context is available. Do not invent lecture-specific details.",
            },
          ]
          : []),
      ...formattedHistory,
      userMessage,
    ];

    const model = hasImage ? "llava:latest" : "qwen2.5:7b";

    if (isDevLog) {
      console.log(`🤖 Routing to model: ${model}`);
      console.log("FINAL MESSAGES", JSON.stringify(ollamaMessages, null, 2));
    }

    const ollamaBaseUrl =
      process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434";

    const ollamaResponse = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: "2h",
        options: {
          num_predict: hasImage ? 1200 : 1800,
          temperature: 0,
        },
        messages: ollamaMessages,
      }),
    });

    if (!ollamaResponse.ok) {
      const responseText = await ollamaResponse.text().catch(() => "");
      if (isDevLog) {
        console.log(
          "❌ Ollama request failed:",
          ollamaResponse.status,
          ollamaResponse.statusText,
          responseText
        );
      }

      return NextResponse.json(
        {
          reply:
            "System Error: Local model request failed. Check OLLAMA_API_URL and model availability.",
        },
        { status: 502 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";
        let closed = false;

        const safeClose = () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        };

        const processObjects = (objects: string[]) => {
          for (const obj of objects) {
            try {
              const parsed = JSON.parse(obj);
              if (parsed.message?.content) {
                controller.enqueue(encoder.encode(parsed.message.content));
              }
              if (parsed.done) return true;
            } catch {
              // ignore malformed partial objects
            }
          }
          return false;
        };

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              if (buffer.trim()) {
                const { objects } = extractJsonObjects(buffer);
                processObjects(objects);
              }
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const { objects, remainder } = extractJsonObjects(buffer);
            buffer = remainder;

            const isDone = processObjects(objects);
            if (isDone) {
              safeClose();
              return;
            }
          }
        } catch (err) {
          if (isDevLog) console.log("❌ Stream error:", err);
        } finally {
          reader.releaseLock();
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ reply: "System Error: Model timed out." });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("❌ Fatal error:", error);
    }

    return NextResponse.json(
      {
        reply:
          "System Error: Could not reach model backend. Verify OLLAMA_API_URL and server connectivity.",
      },
      { status: 500 }
    );
  }
}