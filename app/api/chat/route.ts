export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

type ChatRequest = {
  message?: string;
  isNikiMode?: boolean;
  userName?: string;
  history?: { role: string; content: string }[];
};

function buildSystemPrompt(isNikiMode: boolean, userName: string) {
  if (isNikiMode) {
    return `
You are NikiAI in Professor Nemanja mode.

Be direct, rigorous, and demanding.
Do not sound cheerful, casual, or overly helpful.
Do not over-praise.
Do not say "Certainly", "Great question", or similar filler.
Do not spoon-feed unless the user clearly asks for a full solution.
If the student is wrong, state exactly where the logic fails.
If the question is simple, answer briefly.
If the question is advanced, give a structured explanation.

Math rules:
- Keep math formatting simple and readable.
- Use plain text for simple arithmetic and short answers.
- Use $...$ only for short inline math that stays on one line.
- Use $$...$$ only for short complete equations on their own line.
- Do not use \\( \\) or \\[ \\].
- Never put a single $ on its own line.
- Never leave equations unfinished.
- Never output partial LaTeX commands.
- If a derivation would get too messy, explain it in plain text instead.

Thought trace rules:
- If helpful, output a short <think>...</think> block before the final answer.
- Inside <think>, write short labeled lines like:
  Plan: ...
  Step 1: ...
  Step 2: ...
- Keep the <think> block concise.
- After </think>, give the normal answer for the user.

User: ${userName}
`.trim();
  }

  return `
You are a high-level mathematical assistant.

Be clear, concise, and correct.
Focus on solving or explaining math cleanly.
Avoid personality or roleplay.

Math rules:
- Keep math formatting simple and readable.
- Use plain text for simple arithmetic and short answers.
- Use $...$ only for short inline math that stays on one line.
- Use $$...$$ only for short complete equations on their own line.
- Do not use \\( \\) or \\[ \\].
- Never put a single $ on its own line.
- Never leave equations unfinished.
- Never output partial LaTeX commands.
- If a derivation would get too messy, explain it in plain text instead.

Thought trace rules:
- If helpful, output a short <think>...</think> block before the final answer.
- Inside <think>, write short labeled lines like:
  Plan: ...
  Step 1: ...
  Step 2: ...
- Keep the <think> block concise.
- After </think>, give the normal answer for the user.

User: ${userName}
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

  return {
    objects,
    remainder: depth > 0 && startIndex !== -1 ? input.slice(startIndex) : "",
  };
}

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json();

    const message = body.message?.trim() || "";
    const history = body.history || [];
    const isNikiMode = body.isNikiMode ?? true;
    const userName = body.userName?.trim() || "User";

    if (!message) {
      return NextResponse.json(
        { reply: "Please enter a message first." },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(isNikiMode, userName);

    const formattedHistory = history.map((msg) => ({
      role: msg.role === "ai" ? "assistant" : "user",
      content: msg.content,
    }));

    const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b",
        stream: true,
        keep_alive: "2h",
        options: {
          num_predict: 1500,
          temperature: 0.2,
        },
        messages: [
          { role: "system", content: systemPrompt },
          ...formattedHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("❌ Ollama request failed:", errorText);

      return NextResponse.json(
        { reply: `System Error: Local model request failed. ${errorText}` },
        { status: 500 }
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

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const { objects, remainder } = extractJsonObjects(buffer);
            buffer = remainder;

            for (const obj of objects) {
              try {
                const parsed = JSON.parse(obj);

                if (parsed.message?.content) {
                  controller.enqueue(encoder.encode(parsed.message.content));
                }

                if (parsed.done) {
                  controller.close();
                  return;
                }
              } catch (chunkError) {
                console.log("⚠️ Skipping malformed chunk:", chunkError);
              }
            }
          }
        } catch (streamError) {
          console.log("❌ Stream error:", streamError);
          controller.error(streamError);
        } finally {
          reader.releaseLock();
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
      return NextResponse.json(
        { reply: "System Error: Model timed out." },
        { status: 504 }
      );
    }

    console.log("❌ Fatal error:", error);

    return NextResponse.json(
      { reply: `System Error: ${error?.message || "Vault is jammed."}` },
      { status: 500 }
    );
  }
}