import { readFileSync } from "node:fs";

const chatRoute = readFileSync("app/api/chat/route.ts", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
const mathFormatting = readFileSync("lib/mathFormatting.ts", "utf8");
const deterministicMath = readFileSync("lib/deterministicMath.ts", "utf8");
const ragHelpers = readFileSync("lib/ragHelpers.ts", "utf8");
const chatPrompts = readFileSync("lib/chatPrompts.ts", "utf8");

const fixtures = [
  {
    name: "frontend-preserves-latex-commands",
    pass:
      !/replace\(\/\\\\ln\/g,\s*"ln"\)/.test(mathFormatting) &&
      !/replace\(\/\\\\cdot\/g,\s*"·"\)/.test(mathFormatting) &&
      /displayBlocks/.test(mathFormatting) &&
      /sanitizeMathContent/.test(page),
  },
  {
    name: "frontend-wraps-raw-latex-lines",
    pass: /frac\|sqrt\|int\|sum\|lim/.test(mathFormatting) && /@@MATH_BLOCK_/.test(mathFormatting),
  },
  {
    name: "frontend-does-not-collapse-aligned-row-breaks",
    pass: !page.includes(".replace(/\\\\\\\\([a-zA-Z]+)/g"),
  },
  {
    name: "frontend-repairs-nested-display-fences",
    pass: /function collapseNestedDisplayMath/.test(mathFormatting) && /function repairLooseMathLines/.test(mathFormatting),
  },
  {
    name: "frontend-wraps-whole-latex-environments",
    pass: /function wrapBareLatexEnvironments/.test(mathFormatting) && /bmatrix/.test(mathFormatting),
  },
  {
    name: "backend-has-stable-math-postprocessor",
    pass: /normalizeModelMathOutput/.test(chatRoute) && /function normalizeModelMathOutput/.test(mathFormatting),
  },
  {
    name: "backend-repairs-nested-display-fences",
    pass:
      /function collapseNestedDisplayMath/.test(mathFormatting) &&
      /function repairLooseMathLines/.test(mathFormatting),
  },
  {
    name: "backend-wraps-whole-latex-environments",
    pass: /function wrapBareLatexEnvironments/.test(mathFormatting) && /bmatrix/.test(mathFormatting),
  },
  {
    name: "backend-protects-display-math-before-repair",
    pass: /@@MATH_BLOCK_/.test(mathFormatting) && /displayBlocks/.test(mathFormatting),
  },
  {
    name: "backend-buffers-qwen-math-for-repair",
    pass: /forceStructuredMath && !hasImage/.test(chatRoute) && /stream: false/.test(chatRoute),
  },
  {
    name: "backend-asks-for-missing-procedural-expression",
    pass:
      /incompleteProceduralMathRequest/.test(chatRoute) &&
      /missingExpressionReply/.test(chatRoute) &&
      /\\b\(limit\|lim\|approaches\)\\b/.test(deterministicMath) &&
      /limit expression and the value x approaches/.test(deterministicMath),
  },
  {
    name: "long-form-mode-lock-is-buffered",
    pass:
      /LONG-FORM MODE LOCK/.test(chatPrompts) &&
      /longFormNonDeterministic && !hasImage/.test(chatRoute),
  },
  {
    name: "deterministic-covers-core-symbolic-actions",
    pass:
      /"derivative" \| "integral" \| "limit" \| "factor" \| "expand" \| "simplify" \| "solve"/.test(deterministicMath) &&
      /factor\(\$\{normalized\}\)/.test(deterministicMath) &&
      /expand\(\$\{normalized\}\)/.test(deterministicMath) &&
      /solve\(/.test(deterministicMath),
  },
  {
    name: "procedural-math-requires-formula-display",
    pass: /FORMULA\/RULE REQUIREMENT/.test(chatPrompts) && /Formula used:/.test(chatPrompts),
  },
  {
    name: "natural-log-integral-uses-layered-by-parts-template",
    pass: /function buildNaturalLogIntegralReply/.test(deterministicMath) &&
      /Step 1: Choose u and dv/.test(deterministicMath) &&
      /\\begin\{aligned\}[\s\S]*u&=/.test(deterministicMath) &&
      /Alternative Form/.test(deterministicMath),
  },
  {
    name: "natural-log-integral-avoids-fragile-inline-latex",
    pass:
      !/`- \$u=/.test(deterministicMath) &&
      !/`- \$du=/.test(deterministicMath) &&
      !/Differentiating \$\$\{casResult\}/.test(deterministicMath),
  },
  {
    name: "linear-derivative-shows-all-core-rules",
    pass:
      /function derivativeFormulaForExpression/.test(deterministicMath) &&
      deterministicMath.includes("\\\\frac{d}{dx}\\\\left(c f(x)\\\\right)&=c f'(x)") &&
      deterministicMath.includes("\\\\frac{d}{dx}\\\\left(x^{n}\\\\right)&=n x^{n-1}") &&
      deterministicMath.includes("\\\\frac{d}{dx}(cx)&=c"),
  },
  {
    name: "removable-limit-has-deterministic-template",
    pass:
      /function buildDifferenceOfSquaresLimitReply/.test(deterministicMath) &&
      /a\^\{2\}-b\^\{2\}=\(a-b\)\(a\+b\)/.test(deterministicMath) &&
      /Cancel the common factor/.test(deterministicMath),
  },
  {
    name: "lecture-count-flow-exists",
    pass:
      /isLectureCountIntent/.test(chatRoute) &&
      /getLectureCourseCounts/.test(chatRoute) &&
      /supabaseAdmin[\s\S]*\.from\("lecture_sources"\)/.test(ragHelpers),
  },
  {
    name: "mode-separation-has-visible-structures",
    pass:
      /For longer answers, use this visible structure: \*\*Goal\*\*, \*\*Steps\*\*/.test(chatPrompts) &&
      /For longer answers, use this visible structure: \*\*Board Setup\*\*/.test(chatPrompts) &&
      /Lecture Connection/.test(chatPrompts),
  },
];

let failed = false;
for (const fixture of fixtures) {
  if (fixture.pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
