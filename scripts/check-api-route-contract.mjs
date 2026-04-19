import { readFileSync } from "node:fs";

const routeSource = readFileSync("app/api/chat/route.ts", "utf8");

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
    name: "fatal-failure-returns-500",
    pattern: /\{ status: 500 \}/,
  },
];

let failed = false;
for (const fixture of fixtures) {
  const pass = fixture.pattern.test(routeSource);
  if (pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);