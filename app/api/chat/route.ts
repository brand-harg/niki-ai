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
`.trim();

  const sharedThoughtTraceRules = `
Reasoning format (REQUIRED for every response):
Before answering, wrap your reasoning in <think>...</think> tags.
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

${sharedThoughtTraceRules}

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
- If the answer is short, keep the response short.

${sharedThoughtTraceRules}

${sharedMathRules}

${sharedWritingRules}

User: ${userName}
${personalContext ? `\n${personalContext}` : ""}
${styleInstructions ? `\n${styleInstructions}` : ""}
`.trim();
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
      personalContext,
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
      const fileContext = `The user has attached a file named "${textFileName}".\n\nFile contents:\n\`\`\`\n${textFileContent}\n\`\`\`\n\n${
        message ? `User's question: ${message}` : "Please analyze this file."
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
          "I will always open my response with a <think> block of 3 to 6 labeled steps before answering. I will always close the block with </think> before writing my answer. I will format all math using proper LaTeX with one equation per line.",
      },
      ...formattedHistory,
      userMessage,
    ];

    console.log(`🤖 Routing to model: ${model}`);

    const response = await fetch(
      "https://imprudent-ardently-slicing.ngrok-free.dev/api/chat",
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
      console.log("❌ Ollama request failed:", response.status);
      return NextResponse.json({
        reply: "System Error: Local model request failed.",
      });
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
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return NextResponse.json({ reply: "System Error: Model timed out." });
    }

    console.log("❌ Fatal error:", error);
    return NextResponse.json({ reply: "System Error: Vault is jammed." });
  }
}