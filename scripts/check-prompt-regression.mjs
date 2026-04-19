import { readFileSync } from "node:fs";

const routeSource = readFileSync("app/api/chat/route.ts", "utf8");

const fixtures = [
  {
    name: "has-step-by-step-detector",
    pattern: /function wantsStepByStep\(/,
  },
  {
    name: "has-deeper-explanation-detector",
    pattern: /function wantsDeeperExplanation\(/,
  },
  {
    name: "has-thought-trace-detector",
    pattern: /function wantsThoughtTrace\(/,
  },
  {
    name: "has-gemini-style-layout-rule",
    pattern: /Gemini[- ]like math layout \(REQUIRED\):|Math response structure:/,  },
  {
    name: "has-multi-method-formatting-rule",
    pattern: /Method-specific formatting \(REQUIRED for all calculus methods\):/,
  },
  {
    name: "includes-integration-by-parts-example",
    pattern: /integration by parts: choose \$u\$ and \$dv\$/,
  },
  {
    name: "passes-personal-context-into-system-prompt",
    pattern: /buildSystemPrompt\([\s\S]*personalContext,[\s\S]*styleInstructions[\s\S]*\)/,
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