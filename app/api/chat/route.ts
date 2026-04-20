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
    timestampStartSeconds?: number;
    timestampUrl?: string | null;
    course?: string;
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
- Do NOT use \boxed{} in answers.

Math response structure:
${
  forceStepByStep
    ? `- Use explicit numbered steps: Step 1, Step 2, Step 3, ...
- Use at least ${wantsDeeperExplanation ? "5" : "3"} steps, and continue when needed.
- Put each step on its own line.
- Show both the operation and intermediate result.
- Explain briefly why the step is valid.
- End with: Final Answer: [result].`
    : `- Prefer clean explanatory prose unless the user asked for steps.
- Show key equations on their own lines with $$...$$.
- End with Final Answer: [result only].`
}

Method formatting:
- For substitution, show the substitution and rewritten integral.
- For integration by parts, show u, dv, du, and v.
- For partial fractions, show factorization and constants.
- For trig identities or substitution, show the chosen identity first.
`.trim();

  const sharedThoughtTraceRules = `
Reasoning format (only when requested):
When requested, add one <think>...</think> block before the answer.
Use exactly 3 to 6 labeled lines.

For math:
<think>
Method: [approach]
Why: [why it fits]
Step 1: [major move]
Step 2: [next move]
Key insight: [main takeaway]
Watch out: [common mistake if relevant]
</think>

Rules:
- Do not dump raw algebra inside <think>.
- Do not repeat the full solution there.
- Keep each line short.
`.trim();

  const lectureRules = lectureMode
    ? `
Lecture mode grounding rules (STRICT):
- Use only the provided retrieval context and citations when answering lecture-content questions.
- Do not invent lecture titles, section numbers, or video links.
- If the answer is not supported by the provided sources, say so clearly.
- For "list all lectures" style questions, use only database-backed lecture lists, not guesses.
`.trim()
    : "";

  if (isNikiMode) {
    return `
You are NikiAI in Professor Nemanja mode.

Persona:
- Direct, rigorous, and demanding.
- No filler.
- If the student is wrong, state exactly where the logic fails.
- Teach for understanding, not just answers.

${
  includeThoughtTrace
    ? sharedThoughtTraceRules
    : "Do not output <think>...</think> unless explicitly requested."
}

${sharedMathRules}

${lectureRules}

User: ${userName}
${personalContext ? `\n${personalContext}` : ""}
${styleInstructions ? `\n${styleInstructions}` : ""}
`.trim();
  }

  return `
You are a high-level mathematical assistant in Pure Logic mode.

Persona:
- Clear, concise, correct.
- No roleplay.
- Match the user's requested level of detail.

${includeThoughtTrace ? sharedThoughtTraceRules : ""}

${sharedMathRules}

${lectureRules}

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
    const key = [
      cite.lectureTitle ?? "",
      cite.course ?? "",
      cite.professor ?? "",
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      out.push(cite);
    }
  }

  return out;
}

function isLectureListIntent(message: string): boolean {
  return /(what lectures do you have|list .*lectures|list me .*lectures|all the calc 1 lectures|all calc 1 lectures|all calculus 1 lectures|list all calc 1 lectures|list all calculus 1 lectures)/i.test(
    message
  );
}

function isCalc1LectureListIntent(message: string): boolean {
  return /(calc 1|calculus 1)/i.test(message) && /(list|lectures|all)/i.test(message);
}

function isVideoLookupIntent(message: string): boolean {
  return /(what is the youtube video|what's the youtube video|youtube video|video link|what is the video|what's the video)/i.test(
    message
  );
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

function buildCitationLectureReply(message: string, citations: LectureCitation[]): string | null {
  if (!isLectureListIntent(message) && !isVideoLookupIntent(message)) {
    return null;
  }

  const deduped = uniqueLectures(dedupeCitations(citations));

  if (deduped.length === 0) {
    return "I don’t have any matching lecture metadata in my database for that request.";
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
    const forceStepByStep = wantsStepByStep(message) || wantsMoreDetail;
    const includeThoughtTrace = wantsThoughtTrace(message);

    const hasImage = !!base64Image;
    const hasTextFile = !!textFileContent;

    if (!message && !hasImage && !hasTextFile) {
      return NextResponse.json(
        { reply: "Please enter a message or attach a file." },
        { status: 400 }
      );
    }

    console.log("\n=============================");
    console.log(`🧠 User asked: "${message || "[file only]"}"`);
    console.log(`📎 Image: ${hasImage} | Text file: ${hasTextFile}`);

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
        return new Response("I don’t have any Calculus 1 lectures in the database.", {
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

    const formattedHistory = history.slice(0, -1).map((msg) => ({
      role: msg.role === "ai" ? "assistant" : "user",
      content: msg.content,
    }));

    let userMessageContent = message;

    if (lectureMode) {
      const factual = ragContext
        .slice(0, 8)
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
        .slice(0, 8)
        .map((cite, i) => {
          const title = cite.lectureTitle ?? "Unknown lecture";
          const professor = cite.professor ?? "Unknown professor";
          const course = cite.course ?? "Unknown course";
          const ts = formatSeconds(cite.timestampStartSeconds);
          const url = cite.timestampUrl ? `URL: ${cite.timestampUrl}` : "URL: unavailable";
          return `Source ${i + 1}:
Title: ${title}
Course: ${course}
Professor: ${professor}
Time: ${ts}
${url}`;
        })
        .join("\n\n");

      userMessageContent = `
Lecture Mode is ON.

Use only the provided retrieval context and citations.
Do not invent lecture titles, section numbers, or video links.
If the answer is not supported by the provided sources, say so clearly.

Retrieved factual context:
${factual || "No retrieved chunks."}

Retrieved teaching style examples:
${style || "No style snippets."}

Available citations:
${citations || "No citations."}

User question:
${message}
`.trim();
    }

    if (hasTextFile) {
      userMessageContent = `The user attached a file named "${textFileName}".

File contents:
\`\`\`
${textFileContent}
\`\`\`

${message ? `User question: ${message}` : "Please analyze this file."}`;
    }

    const model = hasImage ? "llava:latest" : "qwen2.5:7b";

    const userMessage: Record<string, unknown> = {
      role: "user",
      content: userMessageContent || "Please analyze this image.",
    };

    if (hasImage) {
      userMessage.images = [base64Image];
    }

    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      {
        role: "assistant",
        content: lectureMode
          ? "I will answer using only the provided lecture context and citations when available. I will not invent lectures or links."
          : "I will format all math using proper LaTeX with one equation per line.",
      },
      ...formattedHistory,
      userMessage,
    ];

    const ollamaBaseUrl =
      process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434";

    const response = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: "2h",
        options: {
          num_predict: hasImage ? 1000 : 1500,
          temperature: lectureMode ? 0.1 : 0.2,
        },
        messages: ollamaMessages,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.log(
        "❌ Ollama request failed:",
        response.status,
        response.statusText,
        responseText
      );

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
        const reader = response.body?.getReader();
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

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const { objects, remainder } = extractJsonObjects(buffer);
            buffer = remainder;

            for (const obj of objects) {
              try {
                const parsed = JSON.parse(obj);

                if (parsed.message?.content) {
                  controller.enqueue(encoder.encode(parsed.message.content));
                }

                if (parsed.done) {
                  safeClose();
                  return;
                }
              } catch {
                // ignore malformed partial objects
              }
            }
          }
        } catch (err) {
          console.log("❌ Stream error:", err);
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

    console.log("❌ Fatal error:", error);

    return NextResponse.json(
      {
        reply:
          "System Error: Could not reach model backend. Verify OLLAMA_API_URL and server connectivity.",
      },
      { status: 500 }
    );
  }
}