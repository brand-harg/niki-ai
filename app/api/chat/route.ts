export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { detectCourseFilter, inferCourseFromMathTopic } from "@/lib/courseFilters";
import { normalizeModelMathOutput, sanitizeMathContent } from "@/lib/mathFormatting";
import {
  buildLectureContextSystemMessage,
  buildModeReminderSystemMessage,
  buildSystemPrompt,
  buildUserMessageContent,
  isPracticeRequest,
  type Difficulty,
} from "@/lib/chatPrompts";
import {
  buildCitationLectureReply,
  buildLectureRecoveryReply,
  buildLectureCountReply,
  buildLectureTopicPrompt,
  dedupeCitations,
  getAvailableLectureCourses,
  getLectureCourseCounts,
  getLecturesByCourse,
  isCalc1LectureListIntent,
  isLectureCountIntent,
  isLectureListIntent,
  isUsableVideoUrl,
} from "@/lib/ragHelpers";
import {
  buildDeterministicMathReply,
  detectSimpleMathIntent,
  incompleteProceduralMathRequest,
  missingExpressionReply,
} from "@/lib/deterministicMath";

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
    similarity?: number;
  }[];
};

type InternalRagResponse = {
  context?: string[];
  styleSnippets?: { text: string; personaTag?: string }[];
  citations?: {
    lectureTitle?: string;
    professor?: string;
    course?: string;
    timestampStartSeconds?: number;
    timestampUrl?: string | null;
    similarity?: number;
  }[];
};

const UI_GREETING_TEXTS = new Set([
  "What do you need help with?",
  "What are we solving today?",
  "Send the math, code, or technical problem.",
  "What do you want to work through?",
  "Give me the problem and I’ll keep it clean.",
  "What needs fixing, proving, solving, or explaining?",
  "Do you need help with kalk?",
  "All right, what are we working on?",
  "Bring me the problem. We will make it behave.",
  "What do we need to figure out today?",
  "Kalk, algebra, stats, code. What is the situation?",
]);

function isUiGreeting(content?: string): boolean {
  return UI_GREETING_TEXTS.has(content?.trim() ?? "");
}

function maskBackendUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value.replace(/\/\/([^/@]+)@/, "//***@");
  }
}

function ollamaErrorReply(baseUrl: string, status?: number): string {
  const statusText = status ? ` Ollama returned HTTP ${status}.` : "";
  return [
    "System Error: Could not reach the local model backend.",
    statusText.trim(),
    `Configured backend: ${maskBackendUrl(baseUrl)}.`,
    "Open /api/ollama/health on this same deployed site to test connectivity.",
    "For Vercel, OLLAMA_API_URL must be your current public ngrok HTTPS URL, not localhost.",
    "Also confirm Ollama is running, the model is installed, and the ngrok tunnel points to port 11434.",
  ]
    .filter(Boolean)
    .join(" ");
}

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

function isLectureSummaryRequest(message: string): boolean {
  return /(summarize the lecture|teach me the lecture|lecture me on|i missed the lecture|wasn'?t in class|what did the lecture cover|explain the lecture)/i.test(
    message
  );
}

function isLikelyMathQuestion(message: string): boolean {
  return /(\barithmetic\b|\boperations?\b|\bfractions?\b|\bdecimals?\b|\bpercent(?:age)?s?\b|\bsales tax\b|\bdiscount\b|\bfinal price\b|\bvolume\b|\barea\b|\bradius\b|\bheight\b|\bcylinder\b|\broot\b|\broots\b|\bintegral\b|\bintegrate\b|\bantiderivative\b|\bderivative\b|\bdifferentiate\b|\bdy\/dx\b|\bd\/dx\b|\bsolve\b|\bevaluate\b|\bsimplify\b|\bisolate\b|\blimit\b|\bmatrix\b|\bmatrices\b|\bprobability\b|\bstatistic\b|\bmean\b|\bmedian\b|\bmode\b|\bvariance\b|\bstandard deviation\b|\bz[-\s]?score\b|\bp[-\s]?value\b|\bnormal distribution\b|\bbinomial\b|\btrig\b|\bsin\b|\bcos\b|\btan\b|\bsec\b|\bcsc\b|\bcot\b|\bidentity\b|\bproof\b|\bequation\b|\binequality\b|\bfunction\b|\bdomain\b|\brange\b|\basymptote\b|\bgraph\b|\bintercepts?\b|\bvertex\b|\bslope\b|\btangent\b|\bconcavity\b|\binflection\b|\bcritical point\b|\boptimization\b|\brelated rates\b|\bimplicit\b|\bvector\b|\bdot product\b|\bcross product\b|\bgradient\b|\bdeterminant\b|\beigen\b|\bdistribution\b|\bfactor\b|\bfactoring\b|\bpolynomial\b|\bsynthetic division\b|\blong division\b|\bcomplete the square\b|\bquadratic\b|\brational expression\b|\bexponent\b|\blogarithm\b|\bseries\b|\bsequence\b|\bsummation\b|\bsum\b|\bconverge\b|\bdiverge\b|\bratio test\b|\bcomparison test\b|\btaylor\b|\bmaclaurin\b|\bdifferential equation\b|\brow reduce\b|\brow reduction\b|\bgaussian elimination\b|\bscientific notation\b|\bcomplex\b|\ba\s*\+\s*bi\b|\bln\b|\blog\b|\bsqrt\b|\bpi\b|\bdo\s+\d*\s*[a-z]\b|\d+\s*[a-z]\b|[a-z]\^\d|[\dxy]\s*[\+\-\*\/\^]\s*[\dxy]|\\int|\\frac|\\sum|\\lim|\$)/i.test(
    message
  );
}

function isLongFormNonDeterministicRequest(message: string): boolean {
  const asksForLongForm =
    /\b(explain|compare|contrast|summarize|teach|walk me through|break down|why|how|write|draft|brainstorm|analyze|argue|evaluate|recommend|plan|outline)\b/i.test(
      message
    ) ||
    /\b(in detail|deep dive|long answer|essay|paragraphs?|thorough|comprehensive)\b/i.test(
      message
    );
  const asksForExactShort =
    /\b(just the answer|one sentence|briefly|quick answer|yes or no|true or false)\b/i.test(
      message
    );

  return asksForLongForm && !asksForExactShort && message.length >= 18;
}

function sanitizeHistoryForModel(content: string): string {
  return content
    .replace(/^Current response mode:[\s\S]*?\n\nUser request:\n/i, "")
    .replace(/\\boxed\s*\{([^}]*)\}/g, "$1")
    .replace(/\\\[/g, "$$$$")
    .replace(/\\\]/g, "$$$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\${3,}/g, "$$$$")
    .replace(/^\s*\$\$\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function detectRecentCourseFromHistory(history: { role: string; content: string }[]): string | undefined {
  for (const item of [...history].reverse().slice(0, 8)) {
    if (isUiGreeting(item.content)) continue;
    const course = detectCourseFilter(item.content);
    if (course) return course;
  }
  return undefined;
}

function isInternalModeReminder(content?: string): boolean {
  return /^Current response mode:/i.test(content?.trim() ?? "");
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

function normalizeBufferedModelOutput(content: string): string {
  return String(content || "")
    .replace(/^Current response mode:[^\n]*(?:\n|$)/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json();

    const message = body.message?.trim() || "";
    const history = body.history || [];
    const isNikiMode = body.isNikiMode ?? false;
    const userName = body.userName?.trim() || "User";
    const userId = body.userId?.trim() || "";
    const base64Image = body.base64Image;
    const imageMediaType = body.imageMediaType;
    const textFileContent = body.textFileContent;
    const textFileName = body.textFileName;
    const lectureMode = body.lectureMode ?? false;
    const difficulty = body.difficulty ?? "exam";
    const practiceMode = body.practiceMode ?? false;

    let ragContext = body.ragContext ?? [];
    let ragStyleSnippets = body.ragStyleSnippets ?? [];
    let ragCitations = dedupeCitations(body.ragCitations ?? []);

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
    const recentCourseFromHistory = detectRecentCourseFromHistory(history);
    const courseForLectureList = detectedCourse ?? recentCourseFromHistory;
    const latestAssistantForLectureTopic = [...history]
      .reverse()
      .find((msg) => msg.role === "ai" || msg.role === "assistant")?.content ?? "";
    const isLectureTopicFollowup =
      !!courseForLectureList &&
      message.trim().length <= 80 &&
      /(What topic or course do you want lectures for|Tell me a course or topic|I can list lectures by topic\/course)/i.test(
        latestAssistantForLectureTopic
      );
    const isDetectedCourseLectureIntent =
      (!!detectedCourse && /(list|lectures|all|show)/i.test(message)) ||
      isLectureTopicFollowup ||
      (!!detectedCourse && message.trim().length <= 40);
    const isRecentCourseLectureFollowup =
      !detectedCourse &&
      !!recentCourseFromHistory &&
      isLectureListIntent(message) &&
      /\b(all|show|list|those|them|that course|the lectures?)\b/i.test(message);

    if (isLectureCountIntent(message)) {
      const counts = await getLectureCourseCounts();
      return new Response(buildLectureCountReply(counts), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (
      isLectureListIntent(message) &&
      !courseForLectureList &&
      !isCalc1LectureListIntent(message)
    ) {
      const courses = await getAvailableLectureCourses();
      return new Response(buildLectureTopicPrompt(courses), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (isCalc1LectureListIntent(message) || isDetectedCourseLectureIntent || isRecentCourseLectureFollowup) {
      const courseFilter = courseForLectureList ?? "Calculus 1";
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
          const watch = isUsableVideoUrl(lecture.video_url)
            ? `\nWatch: ${lecture.video_url}`
            : "\nWatch: link unavailable";
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

    if (
      lectureMode &&
      isLectureSummaryRequest(message) &&
      ragContext.length === 0 &&
      ragCitations.length === 0
    ) {
      try {
        const ragRes = await fetch(new URL("/api/rag/query", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: message,
            lectureMode: true,
            courseFilter: inferCourseFromMathTopic(message),
            minSimilarity: 0.2,
            maxChunks: 8,
            maxStyleSnippets: isNikiMode ? 6 : 3,
          }),
        });

        if (ragRes.ok) {
          const ragJson = (await ragRes.json()) as InternalRagResponse;
          ragContext = ragJson.context ?? [];
          ragStyleSnippets = ragJson.styleSnippets ?? [];
          ragCitations = dedupeCitations(ragJson.citations ?? []);
        } else if (isDevLog) {
          console.log("Lecture recovery RAG fallback failed:", ragRes.status, await ragRes.text());
        }
      } catch (error) {
        if (isDevLog) console.log("Lecture recovery RAG fallback error:", error);
      }
    }

    if (lectureMode) {
      const lectureRecoveryReply = buildLectureRecoveryReply({
        message,
        ragContext,
        citations: ragCitations,
      });
      if (lectureRecoveryReply) {
        return new Response(sanitizeMathContent(lectureRecoveryReply), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      const directLectureReply = buildCitationLectureReply(message, ragCitations);
      if (directLectureReply) {
        return new Response(directLectureReply, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      if (
        isLectureSummaryRequest(message) &&
        ragContext.length === 0 &&
        ragCitations.length === 0
      ) {
        return new Response(
          [
            "I do not have lecture retrieval context for that specific lecture.",
            "",
            "Give me a real course, topic, or lecture title from the indexed lectures and I can reconstruct it from the transcript instead of inventing details.",
          ].join("\n"),
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          }
        );
      }
    }

    if (!hasImage && !hasTextFile) {
      const proceduralMathIntent = detectSimpleMathIntent(message);
      if (
        proceduralMathIntent &&
        incompleteProceduralMathRequest(message, proceduralMathIntent)
      ) {
        return new Response(missingExpressionReply(proceduralMathIntent), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }

      const deterministicMathReply = buildDeterministicMathReply({
        message,
        isProfessorMode: isNikiMode,
        lectureMode,
        hasLectureContext: ragContext.length > 0 || ragStyleSnippets.length > 0 || ragCitations.length > 0,
      });

      if (deterministicMathReply) {
        return new Response(normalizeModelMathOutput(deterministicMathReply), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    const historyWithoutCurrent =
      history.length > 0 &&
        history[history.length - 1]?.role === "user" &&
        history[history.length - 1]?.content?.trim() === message
        ? history.slice(0, -1)
        : history;

    const formattedHistory = historyWithoutCurrent
      .filter(
        (msg) =>
          msg.content?.trim() &&
          !isUiGreeting(msg.content) &&
          !isInternalModeReminder(msg.content)
      )
      .slice(-8)
      .map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: sanitizeHistoryForModel(msg.content),
      }));

    const latestAssistantMessage = [...historyWithoutCurrent]
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
    const longFormNonDeterministic =
      !forceStructuredMath &&
      isLongFormNonDeterministicRequest(message);

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
      longFormNonDeterministic,
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
    const modeReminderSystemContent = buildModeReminderSystemMessage({
      isProfessorMode: isNikiMode,
      lectureMode,
      hasLectureContext: !!lectureContextSystemContent,
      longFormNonDeterministic,
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
      { role: "system" as const, content: modeReminderSystemContent },
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

    const shouldBufferForRepair =
      (forceStructuredMath && !hasImage) || (longFormNonDeterministic && !hasImage);
    const modelTemperature = forceStructuredMath ? 0 : longFormNonDeterministic ? 0.35 : 0.15;
    const modelNumPredict = longFormNonDeterministic ? 2600 : hasImage ? 1200 : 1800;

    if (shouldBufferForRepair) {
      const stableMathResponse = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          model,
          stream: false,
          keep_alive: "2h",
          options: {
            num_predict: modelNumPredict,
            temperature: modelTemperature,
          },
          messages: ollamaMessages,
        }),
      });

      if (!stableMathResponse.ok) {
        const responseText = await stableMathResponse.text().catch(() => "");
        if (isDevLog) {
          console.log(
            "❌ Ollama stable math request failed:",
            stableMathResponse.status,
            stableMathResponse.statusText,
            responseText
          );
        }

        return NextResponse.json(
          {
            reply: ollamaErrorReply(ollamaBaseUrl, stableMathResponse.status),
          },
          { status: 502 }
        );
      }

      const stableJson = await stableMathResponse.json().catch(() => null);
      const stableContent = String(stableJson?.message?.content ?? "");
      const stableOutput = forceStructuredMath
        ? normalizeModelMathOutput(stableContent)
        : sanitizeMathContent(normalizeBufferedModelOutput(stableContent));

      return new Response(stableOutput, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const ollamaResponse = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: "2h",
        options: {
          num_predict: modelNumPredict,
          temperature: modelTemperature,
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
          reply: ollamaErrorReply(ollamaBaseUrl, ollamaResponse.status),
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
        reply: ollamaErrorReply(process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434"),
      },
      { status: 500 }
    );
  }
}
