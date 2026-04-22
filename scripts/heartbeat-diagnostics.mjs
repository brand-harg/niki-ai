import { existsSync, readFileSync } from "node:fs";

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_NGROK_API_URL = "http://127.0.0.1:4040/api/tunnels";
const DEFAULT_INTERVAL_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10_000;

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return;
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function maskUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "***";
      url.password = "***";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").replace(/\/\/([^/@]+)@/, "//***@");
  }
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const getValue = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith("--")) return fallback;
    return argv[index + 1];
  };

  return {
    once: argv.includes("--once"),
    intervalSeconds: Number(getValue("--interval", DEFAULT_INTERVAL_SECONDS)),
  };
}

async function checkAppHealth(appBaseUrl) {
  const url = `${normalizeBaseUrl(appBaseUrl)}/api/ollama/health`;
  const result = await fetchJsonWithTimeout(url);
  return {
    name: "app-health",
    ok: result.ok,
    detail: `${url} -> HTTP ${result.status}`,
  };
}

async function checkOllamaBackend(ollamaBaseUrl) {
  const url = `${normalizeBaseUrl(ollamaBaseUrl)}/api/tags`;
  const result = await fetchJsonWithTimeout(url, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  const models = Array.isArray(result.body?.models)
    ? result.body.models.map((model) => model.name).filter(Boolean).slice(0, 5)
    : [];
  return {
    name: "ollama-backend",
    ok: result.ok,
    detail: `${maskUrl(url)} -> HTTP ${result.status}; models=${models.join(", ") || "none listed"}`,
  };
}

async function checkNgrokTunnel(ngrokApiUrl) {
  const result = await fetchJsonWithTimeout(ngrokApiUrl);
  const tunnels = Array.isArray(result.body?.tunnels) ? result.body.tunnels : [];
  const ollamaTunnel = tunnels.find((tunnel) => /11434\b/.test(tunnel?.config?.addr ?? ""));
  return {
    name: "ngrok-tunnel",
    ok: result.ok && !!ollamaTunnel?.public_url,
    detail: result.ok
      ? `${ngrokApiUrl} -> ${ollamaTunnel?.public_url ?? "no tunnel to port 11434"}`
      : `${ngrokApiUrl} -> HTTP ${result.status}`,
  };
}

async function runHeartbeat() {
  loadDotEnvLocal();
  const appBaseUrl = process.env.NIKIAI_APP_URL || process.env.VERCEL_URL || DEFAULT_APP_URL;
  const ollamaBaseUrl = process.env.OLLAMA_API_URL || DEFAULT_OLLAMA_URL;
  const ngrokApiUrl = process.env.NGROK_API_URL || DEFAULT_NGROK_API_URL;
  const checks = [
    () => checkAppHealth(appBaseUrl),
    () => checkOllamaBackend(ollamaBaseUrl),
    () => checkNgrokTunnel(ngrokApiUrl),
  ];

  const results = [];
  for (const check of checks) {
    try {
      results.push(await check());
    } catch (error) {
      results.push({
        name: "heartbeat-check",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const stamp = new Date().toISOString();
  for (const result of results) {
    console.log(`[${stamp}] ${result.ok ? "OK" : "FAIL"} ${result.name}: ${result.detail}`);
  }

  return results.every((result) => result.ok);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  do {
    const ok = await runHeartbeat();
    if (args.once) process.exit(ok ? 0 : 1);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, args.intervalSeconds) * 1000));
  } while (true);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
