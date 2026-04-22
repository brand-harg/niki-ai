import { readFileSync } from "node:fs";

const routeSource = readFileSync("app/api/chat/route.ts", "utf8");
const ollamaHealthSource = readFileSync("app/api/ollama/health/route.ts", "utf8");

const fixtures = [
  {
    name: "has-post-handler",
    pattern: /export async function POST\(req: Request\)/,
  },
  {
    name: "empty-input-returns-400",
    pattern: /Please enter a message or attach a file\./,
  },
  {
    name: "uses-ollama-api-url-env",
    pattern: /process\.env\.OLLAMA_API_URL/,
  },
  {
    name: "has-local-fallback-url",
    pattern: /http:\/\/127\.0\.0\.1:11434/,
  },
  {
    name: "backend-failure-returns-502",
    pattern: /\{ status: 502 \}/,
  },
  {
    name: "chat-skips-ngrok-browser-warning",
    pattern: /ngrok-skip-browser-warning[\s\S]*true/,
  },
  {
    name: "chat-error-explains-vercel-ngrok-url",
    pattern: /Vercel[\s\S]*public ngrok HTTPS URL[\s\S]*not localhost/,
  },
  {
    name: "fatal-failure-returns-500",
    pattern: /\{ status: 500 \}/,
  },
  {
    name: "ollama-health-has-get-handler",
    source: ollamaHealthSource,
    pattern: /export async function GET\(\)/,
  },
  {
    name: "ollama-health-checks-tags-endpoint",
    source: ollamaHealthSource,
    pattern: /\/api\/tags/,
  },
  {
    name: "ollama-health-skips-ngrok-browser-warning",
    source: ollamaHealthSource,
    pattern: /ngrok-skip-browser-warning[\s\S]*true/,
  },
  {
    name: "ollama-health-masks-backend-url",
    source: ollamaHealthSource,
    pattern: /maskUrl\(ollamaBaseUrl\)/,
  },
  {
    name: "ollama-health-times-out",
    source: ollamaHealthSource,
    pattern: /setTimeout\(\(\) => controller\.abort\(\), 5000\)/,
  },
  {
    name: "ollama-health-failure-returns-502",
    source: ollamaHealthSource,
    pattern: /\{ status: 502 \}/,
  },
];

let failed = false;
for (const fixture of fixtures) {
  const pass = fixture.pattern.test(fixture.source ?? routeSource);
  if (pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
