import { readFileSync } from "node:fs";

const routeSource = readFileSync("app/api/chat/route.ts", "utf8");
const promptSource = readFileSync("lib/chatPrompts.ts", "utf8");
const combinedSource = `${routeSource}\n${promptSource}`;

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
    name: "has-pretty-math-format-rule",
    pattern: /PRETTY MATH FORMAT \(ALL MATH\):/,
  },
  {
    name: "has-pure-logic-default-mode",
    pattern: /MODE — PURE LOGIC:[\s\S]*Default math and technical mode\./,
  },
  {
    name: "has-nemanja-style-only-mode",
    pattern: /MODE — NEMANJA:[\s\S]*Only the teaching style changes\./,
  },
  {
    name: "lecture-mode-is-grounding-layer",
    pattern: /Lecture Mode can run on top of either Pure Logic Mode or Nemanja Mode\.[\s\S]*changes content emphasis and teaching flow, not formatting\./,
  },
  {
    name: "code-supported-in-every-mode",
    pattern: /Work well for both math and code help in every mode\./,
  },
  {
    name: "pure-logic-api-default",
    pattern: /const isNikiMode = body\.isNikiMode \?\? false;/,
  },
  {
    name: "uses-bold-step-labels",
    pattern: /\*\*Step 1: \.\.\.\*\*, \*\*Step 2: \.\.\.\*\*, \*\*Step 3: \.\.\.\*\*/,
  },
  {
    name: "forbids-template-placeholder-output",
    pattern: /Never print placeholder\/template words like "Short Topic Title"/,
  },
  {
    name: "asks-for-missing-math-expression",
    pattern: /If the user asks something incomplete like "do a derivative" without giving a function, ask for the missing expression/,
  },
  {
    name: "uses-display-math-only-when-needed",
    pattern: /Only use display math when it is actually needed/,
  },
  {
    name: "forbids-boxed-final-answer",
    pattern: /Do not use \\\\boxed\{\}; the website visually highlights this section\./,
  },
  {
    name: "has-grok-style-math-layering",
    pattern: /GROK-STYLE MATH LAYERING:[\s\S]*Layer the explanation like a polished mainstream AI answer/,
  },
  {
    name: "has-long-form-mode-lock",
    pattern: /LONG-FORM MODE LOCK:[\s\S]*Do not drift into/,
  },
  {
    name: "passes-personal-context-into-system-prompt",
    pattern: /buildSystemPrompt\([\s\S]*personalContext,[\s\S]*styleInstructions[\s\S]*\)/,
  },
];

let failed = false;
for (const fixture of fixtures) {
  const pass = fixture.pattern.test(combinedSource);
  if (pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
