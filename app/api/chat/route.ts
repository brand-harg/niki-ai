export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

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

function buildSystemPrompt(
  isNikiMode: boolean,
  userName: string,
  forceStepByStep: boolean,
  wantsDeeperExplanation: boolean,
  includeThoughtTrace: boolean,
  personalContext = "",
  styleInstructions = "",
  lectureMode = false
) {
  const detailedMathLayoutRules = `
Detailed math layout (REQUIRED when user asks for full walkthrough):
- Start with a short title line naming the problem type (plain text, not markdown heading syntax).
- Add one short method sentence before the steps.
- Add a formula-intro line near the top in this pattern:
  "The formula/rule used is:"
  $$...$$
- Use explicit sections in this order:
  Step 1: ...
  Step 2: ...
  Step 3: ...
  (Step 4/5/etc when needed)
- Under Step 1 and Step 2, always include bullet points for the setup sub-work (for example choosing variables, derivatives, substitutions, constants).
- Under later steps, use bullet points whenever there are multiple sub-calculations.- Put major equations on their own lines using $$...$$.
- After the main derivation, include "Alternative Form" only if it adds value.
- End with:
  Final Answer:
  $$...$$

Method-specific formatting (REQUIRED for all calculus methods in walkthrough mode):
- Keep the same visual style across methods: numbered Step sections + bullet sub-lines + display equations.
- Adapt Step 1/Step 2 labels to the method being used:
  - u-substitution: choose substitution, compute $du$, rewrite integral.
  - integration by parts: choose $u$ and $dv$, compute $du$ and $v$.
  - partial fractions: factor denominator, decompose, solve constants.
  - trig identities/substitution: choose identity/substitution, rewrite, integrate.
- For any method, explicitly show "Let:" (or equivalent setup line) and use bullets for derived helper pieces.
- Never collapse setup details into one long sentence; keep the same structured step style.
- Add a blank line between major sections to keep spacing readable.
- Keep equations in standalone $$...$$ blocks whenever possible so they appear centered and visually separated.
`.trim();

  const conciseMathLayoutRules = `
Concise math layout (default):
-- Use this exact Gemini-like structure:
  [One short setup sentence]
  The formula for [method] is:
  $$...$$

  Step 1: [method setup]
  Let:
  - ...
  - ...

  Step 2: [differentiate/integrate/setup details]
  - ...
  - ...

  Step 3: [plug into formula]
  $$...$$

  Step 4: [evaluate/simplify]
  $$...$$

  Alternative Form (only if useful):
  $$...$$

  Final Answer:
  $$...$$
- Do not collapse this into one paragraph.
- Keep equations centered by always using standalone $$...$$ lines.
`.trim();

  const sharedMathRules = `
Math formatting rules (STRICT):
- Use plain text for simple arithmetic and short answers.
- Use $...$ for short inline math only.
- Use $$...$$ for standalone equations on their own line.
- Do not use \\( \\) or \\[ \\].
- Never put a single $ on its own line.
- Never output $$$ or more than two dollar signs in a row.
- Never output incomplete or partial LaTeX commands.
- One equation per line. Never place multiple equations on the same line.
- If a derivation would get messy, explain it in plain text instead.
- Always ensure all LaTeX expressions are complete before finishing a response.
- Do NOT use \\boxed{} in answers.

Math response structure:
${forceStepByStep
      ? `- Use explicit numbered steps: Step 1, Step 2, Step 3, ...
- Use at least ${wantsDeeperExplanation ? "5" : "3"} steps, and continue with additional steps whenever needed for clarity.
- Put each step on its own line.
- In each step, show both the operation and the intermediate result.
- Explain briefly why the step is valid (rule used, substitution, or simplification).
- Do not skip arithmetic. Write out evaluations explicitly.
- If the student asks for more help, expand the walkthrough with more steps instead of compressing.
- End with a separate line: Final Answer: [result].
- Do not skip directly to only the final result.`
      : `- Use a compact but structured walkthrough with Step 1/Step 2/Step 3.
- Include short bullet sub-lines in Step 1 and Step 2 for setup work.
- Show key equations on their own lines with $$...$$.
- End with a standalone concluding equation/result line labeled "Final Answer:".`}
${forceStepByStep ? detailedMathLayoutRules : conciseMathLayoutRules}
`.trim();

  const sharedThoughtTraceRules = `
Reasoning format (only when thought trace is requested):
When requested, add one <think>...</think> block before the answer.
Structure it as labeled lines only. Use exactly 3 to 6 lines. No more.

For math problems, use this shape:
<think>
Method: [name the approach, e.g. integration by parts, chain rule, substitution]
Why: [one sentence — why this method fits this specific problem]
Step 1: [first major move, not every algebra line]
Step 2: [next major move]
Key insight: [the one thing a student should understand or remember]
Watch out: [a common mistake or edge case, only if genuinely relevant]
</think>

For non-math questions, adapt the labels to fit:
<think>
Type: [what kind of question this is]
Structure: [how you will organize the answer]
Focus: [what matters most]
Tone: [register and style chosen]
</think>

Rules for <think> blocks:
- Do not dump raw algebra or repeat the solution inside <think>.
- Do not use vague filler like "thinking carefully" or "let me consider".
- Each line is one clear, distinct idea.
- A student reading this should understand the strategy, not re-read the answer.
- Keep every line short. If a line needs two sentences, split it into two steps.
- Never exceed 6 lines total.
`.trim();

  const sharedWritingRules = `
For general writing tasks:
- Respond in clean natural prose.
- Do not use markdown headings unless the user asks.
- Do not bold labels or section titles unless requested.
- Do not split a simple paragraph into bullet points.
`.trim();

  const lectureRules = lectureMode
    ? `
Lecture mode grounding rules (STRICT):
- Use only the provided retrieval context and citations when answering lecture-content questions.
- Do not invent lecture titles, section numbers, or video links.
- If the answer is not supported by the provided sources, say so clearly.
- For "list all lectures" style questions, use only database-backed lecture lists, not guesses.
- Do not use markdown heading markers like ### in lecture answers.
- Prefer short sections with bullets over long dense paragraphs.
`.trim()
    : "";

  if (isNikiMode) {
    return `
You are NikiAI in Professor Nemanja mode.

Persona:
- Direct, rigorous, and demanding.
- Not cheerful, casual, or overly helpful.
- No excessive praise. No filler. No "Certainly" or "Great question."
- If the student is wrong, state exactly where the logic fails.
- If the question is simple, answer briefly.
- If the question is advanced, give a structured explanation.
- You are a teacher first. Your job is to make the student understand, not just to give the answer.

${includeThoughtTrace
        ? sharedThoughtTraceRules
        : "Do not output any <think>...</think> tags unless the user explicitly asks for thought trace/reasoning trace."}

${sharedMathRules}

${lectureRules}

${sharedWritingRules}

User: ${userName}
${personalContext ? `\n${personalContext}` : ""}
${styleInstructions ? `\n${styleInstructions}` : ""}
`.trim();
  }

  return `
You are a high-level mathematical assistant in Pure Logic mode.

Persona:
- Clear, concise, and correct.
- No personality or roleplay.
- Focus on solving or explaining mathematics cleanly and efficiently.
- Match the user's requested level of detail.

${includeThoughtTrace
      ? sharedThoughtTraceRules
      : "Do not output any <think>...</think> tags unless the user explicitly asks for thought trace/reasoning trace."}

${sharedMathRules}

${lectureRules}

${sharedWritingRules}

User: ${userName}
${personalContext ? `\n${personalContext}` : ""}
${styleInstructions ? `\n${styleInstructions}` : ""}
`.trim();
}

function wantsStepByStep(message: string): boolean {
  return /(step[-\s]?by[-\s]?step|show every step|all steps|detailed steps|walk me through)/i.test(
    message
  );
}

function wantsDeeperExplanation(message: string): boolean {
  return /(i do(n't| not) understand|explain more|how did you get|why|break it down|teach me|show work)/i.test(
    message
  );
}

function wantsThoughtTrace(message: string): boolean {
  return /(thought trace|reasoning trace|show reasoning|show thought process|show your reasoning)/i.test(
    message
  );
}

function isLikelyMathQuestion(message: string): boolean {
  return /(\bintegral\b|\bderivative\b|\bdifferentiate\b|\bsolve\b|\blimit\b|\bmatrix\b|\bprobability\b|\bstatistic|\bmean\b|\bvariance\b|[\dxy]\s*[\+\-\*\/\^]\s*[\dxy]|\\int|\\frac|\$)/i.test(
    message
  );
}

/**
 * Parses complete JSON objects out of a streaming buffer.
 * Returns the parsed objects and any leftover incomplete bytes.
 * Any remaining incomplete object at end-of-stream should be flushed separately.
 */
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

  // Return remainder only if we're mid-object
  if (depth > 0 && startIndex !== -1) {
    return { objects, remainder: input.slice(startIndex) };
  }

  return { objects, remainder: "" };
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

async function getAllCalc1Lectures(): Promise<LectureSourceRow[]> {
  const { data, error } = await supabase
    .from("lecture_sources")
    .select("lecture_title, course, professor, video_url")
    .ilike("course", "%Calculus 1%")
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

  const lines = deduped.map((c, i) => {
    const title = c.lectureTitle ?? "Unknown lecture";
    const course = c.course ?? "Unknown course";
    const professor = c.professor ?? "Unknown professor";
    const watch = c.timestampUrl ? `\nWatch: ${c.timestampUrl}` : "";
    return `${i + 1}. ${title}\n${course} · ${professor}${watch}`;
  });
  return lines.join("\n\n");
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
    const ragContext = body.ragContext ?? [];
    const ragStyleSnippets = body.ragStyleSnippets ?? [];
    const ragCitations = dedupeCitations(body.ragCitations ?? []);
    const wantsMoreDetail = wantsDeeperExplanation(message);
    const likelyMathQuestion = isLikelyMathQuestion(message);
    const forceStepByStep = wantsStepByStep(message) || wantsMoreDetail || likelyMathQuestion;
    const includeThoughtTrace = wantsThoughtTrace(message);

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

    const personalContext = profile?.about_user ? `User context: ${profile.about_user}` : "";
    const styleInstructions = profile?.response_style
      ? `Response style: ${profile.response_style}`
      : "";

    const systemPrompt = buildSystemPrompt(
      isNikiMode,
      userName,
      forceStepByStep,
      wantsMoreDetail,
      includeThoughtTrace,
      personalContext,
      styleInstructions,
      lectureMode
    );

    if (lectureMode && isCalc1LectureListIntent(message)) {
      const lectures = await getAllCalc1Lectures();
      if (!lectures.length) {
        return new Response("I don't have any Calculus 1 lectures in the database.", {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
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
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    if (lectureMode) {
      const directLectureReply = buildCitationLectureReply(message, ragCitations);
      if (directLectureReply) {
        return new Response(directLectureReply, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
        });
      }
    }

    const formattedHistory = history
      .slice(0, -1)
      .map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.content,
      }));

    let userMessageContent = message;

    if (lectureMode && ragContext.length > 0) {
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

      userMessageContent = `
Lecture Mode is ON.
Use the provided retrieval context for grounded teaching.
If context is insufficient, say so clearly.

Retrieved factual context:
${factual || "No retrieved chunks."}

Retrieved style context:
${style || "No style snippets."}

Citations:
${citations || "No citations."}

User question:
${message}
`.trim();
    }

    if (hasTextFile) {
      const fileContext = `The user has attached a file named "${textFileName}".\n\nFile contents:\n\`\`\`\n${textFileContent}\n\`\`\`\n\n${message ? `User's question: ${message}` : "Please analyze this file."
        }`;
      userMessageContent = userMessageContent
        ? `${userMessageContent}\n\nAttached file context:\n${fileContext}`
        : fileContext;
    }

    const model = hasImage ? "llava:latest" : "qwen2.5:7b";

    const userMessage: Record<string, unknown> = {
      role: "user",
      content: userMessageContent || "Please analyze this image.",
    };
    if (hasImage) userMessage.images = [base64Image];

    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      {
        role: "assistant",
        content: "I will format all math using proper LaTeX with one equation per line.",
      },
      ...formattedHistory,
      userMessage,
    ];

    if (isDevLog) console.log(`🤖 Routing to model: ${model}`);

    const ollamaBaseUrl = process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434";
    const ollamaResponse = await fetch(
      `${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          keep_alive: "2h",
          options: { num_predict: hasImage ? 1000 : 1500, temperature: 0.2 },
          messages: ollamaMessages,
        }),
      }
    );

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
              if (parsed.done) return true; // signal done
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
              // Flush any remaining buffer content before closing
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
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ reply: "System Error: Model timed out." });
    }
    if (process.env.NODE_ENV !== "production") console.log("❌ Fatal error:", error);
    return NextResponse.json(
      {
        reply:
          "System Error: Could not reach model backend. Verify OLLAMA_API_URL and server connectivity.",
      },
      { status: 500 }
    );
  }
}