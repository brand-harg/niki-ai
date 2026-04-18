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
};

function buildSystemPrompt(
  isNikiMode: boolean,
  userName: string,
  forceStepByStep: boolean,
  wantsDeeperExplanation: boolean,
  includeThoughtTrace: boolean,
  personalContext = "",
  styleInstructions = ""
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
      : `- Prefer clean explanatory prose (not rigid numbered steps).
- Show key equations on their own lines with $$...$$.
- Briefly state the rule used, then apply it.
- End with a standalone concluding equation/result line.
- Only use explicit Step 1/Step 2 labels if the user asks for step-by-step.`}

Output template (STRICT):
${forceStepByStep
    ? `Given: [what is known]
Goal: [what to find]
Step 1: ...
Step 2: ...
...
Final Answer: [result only]
Optional: Alternative form or quick check (only if useful).`
    : `Start with one short setup sentence.
Step 1: [choose method/rule]
- [short bullet if needed]
Step 2: [apply the method]
$$...$$
Step 3: [simplify/evaluate]
$$...$$
Final Answer: [result only]`}

Method-specific formatting (REQUIRED for all calculus methods):
- Keep the same visual style across methods: numbered Step sections + bullet sub-lines + display equations.
- Adapt Step 1/Step 2 labels to the method being used:
  - u-substitution: choose substitution, compute $du$, rewrite integral.
  - integration by parts: choose $u$ and $dv$, compute $du$ and $v$.
  - partial fractions: factor denominator, decompose, solve constants.
  - trig identities/substitution: choose identity/substitution, rewrite, integrate.
- For any method, explicitly show "Let:" (or equivalent setup line) and use bullets for derived helper pieces.
- Never collapse setup details into one long sentence; keep the same structured step style.

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
- Even if the problem is simple, still provide clear step-by-step structure.
- Match the user's requested level of detail.

${sharedThoughtTraceRules}

${sharedMathRules}

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
      if (depth === 0) {
        startIndex = i;
      }
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
    return {
      objects,
      remainder: input.slice(startIndex),
    };
  }

  return {
    objects,
    remainder: "",
  };
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
    if (hasImage && imageMediaType) {
      console.log(`🖼️ Image type: ${imageMediaType}`);
    }
    console.log("🌊 STREAMING ONLINE: Connecting to Ollama...");

    let personalContext = "";
    let styleInstructions = "";

    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("about_user, response_style")
        .eq("id", userId)
        .maybeSingle();

      if (profile) {
        personalContext = profile.about_user
          ? `User context: ${profile.about_user}`
          : "";
        styleInstructions = profile.response_style
          ? `Response style: ${profile.response_style}`
          : "";
      }
    }

    const systemPrompt = buildSystemPrompt(
      isNikiMode,
      userName,
      forceStepByStep,
      wantsMoreDetail,
      includeThoughtTrace,
      styleInstructions
    );

    const formattedHistory = history
      .slice(0, -1)
      .map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.content,
      }));

    let userMessageContent = message;

    if (hasTextFile) {
      const fileContext = `The user has attached a file named "${textFileName}".\n\nFile contents:\n\`\`\`\n${textFileContent}\n\`\`\`\n\n${message ? `User's question: ${message}` : "Please analyze this file."
        }`;
      userMessageContent = fileContext;
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
        content:
          "I will format all math using proper LaTeX with one equation per line.",
      },
      ...formattedHistory,
      userMessage,
    ];

    console.log(`🤖 Routing to model: ${model}`);

    const ollamaBaseUrl =
      process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434";
    const response = await fetch(
      `${ollamaBaseUrl.replace(/\/$/, "")}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          keep_alive: "2h",
          options: {
            num_predict: hasImage ? 1000 : 1500,
            temperature: 0.2,
          },
          messages: ollamaMessages,
        }),
      }
    );

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