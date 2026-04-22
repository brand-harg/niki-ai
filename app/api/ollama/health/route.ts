import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function maskUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value.replace(/\/\/([^/@]+)@/, "//***@");
  }
}

export async function GET() {
  const ollamaBaseUrl = process.env.OLLAMA_API_URL?.trim() || "http://127.0.0.1:11434";
  const started = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/tags`, {
      cache: "no-store",
      headers: {
        "ngrok-skip-browser-warning": "true",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const body = await response.json().catch(() => null);
    const models = Array.isArray(body?.models)
      ? body.models.map((model: { name?: string }) => model.name).filter(Boolean)
      : [];

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      baseUrl: maskUrl(ollamaBaseUrl),
      elapsedMs: Date.now() - started,
      models,
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        baseUrl: maskUrl(ollamaBaseUrl),
        elapsedMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Unknown Ollama connectivity error",
      },
      { status: 502 }
    );
  }
}
