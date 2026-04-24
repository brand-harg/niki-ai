import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync("lib/mathFormatting.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});

const sandbox = {
  exports: {},
  module: { exports: {} },
  require,
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(compiled.outputText, sandbox, {
  filename: "lib/mathFormatting.ts",
});

const { normalizeModelMathOutput, sanitizeMathContent } = sandbox.module.exports;

if (typeof normalizeModelMathOutput !== "function") {
  throw new Error("normalizeModelMathOutput was not exported correctly.");
}

const RAW_LATEX_OUTSIDE = /\\(?:frac|sqrt|int|sum|lim|begin|left|right|ln|log|sin|cos|tan|sec|csc|cot|cdot|vec|bar|hat|overline|underline|alpha|beta|theta|pi|infty|leq|geq|neq|text|operatorname)\b/;
const FORBIDDEN_DELIMITERS = /\\\[|\\\]|\\\(|\\\)|\\boxed\s*\{/;
const BROKEN_MARKDOWN = /\*\s+\*\s*Step\s*-\s*by\s*-\s*Step|\*\*\s*Step\s+-\s+by\s+-\s+Step|^\s*\$\s*$/m;
const INVALID_BACKSLASH_NUMBER = /(?<!\\)\\[0-9]/;

function stripDisplayMath(text) {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^\n$]+\$/g, "");
}

function hasProseInsideDisplayMath(text) {
  return [...text.matchAll(/\$\$([\s\S]*?)\$\$/g)].some((match) => {
    const expr = match[1] ?? "";
    const proseWords =
      expr.match(/\b(?:we|this|that|because|since|therefore|remember|answer|result|slope|function|written|converges|means|where|for)\b/gi) ?? [];
    const normalWords = expr.match(/[A-Za-z]{3,}/g) ?? [];
    return proseWords.length >= 1 && normalWords.length >= 5;
  });
}

function assertClean(name, input, { ensureFinal = true, contains = [], rejects = [] } = {}) {
  const output = ensureFinal ? normalizeModelMathOutput(input) : sanitizeMathContent(input);
  const outsideMath = stripDisplayMath(output);
  const failures = [];

  if (RAW_LATEX_OUTSIDE.test(outsideMath)) failures.push("raw LaTeX command outside display math");
  if (FORBIDDEN_DELIMITERS.test(output)) failures.push("forbidden delimiter or boxed answer");
  if (BROKEN_MARKDOWN.test(output)) failures.push("broken markdown or loose single-dollar fence");
  if (INVALID_BACKSLASH_NUMBER.test(output)) failures.push("invalid backslash-number escape");
  if (hasProseInsideDisplayMath(output)) failures.push("prose inside display math");
  if (ensureFinal && !/## Final Answer|FINAL ANSWER/i.test(output)) failures.push("missing final answer");
  if ((output.match(/\$\$/g) ?? []).length % 2 !== 0) failures.push("unbalanced display math fences");
  for (const pattern of contains) {
    if (!pattern.test(output)) failures.push(`missing expected pattern ${pattern}`);
  }
  for (const pattern of rejects) {
    if (pattern.test(output)) failures.push(`unexpected pattern present ${pattern}`);
  }

  if (failures.length) {
    console.error(`❌ ${name}`);
    console.error(failures.map((f) => `   - ${f}`).join("\n"));
    console.error("--- output ---");
    console.error(output);
    return false;
  }

  console.log(`✅ ${name}`);
  return true;
}

const fixtures = [
  {
    name: "derivative-line-with-raw-frac-and-prose",
    input: `** Step - by - Step Solution **
Step 2: Apply the rule f'(x) = 5 \\cdot \\frac{d}{dx}(x) = 5. Therefore the derivative is constant.
## Final Answer
\\boxed{f'(x)=5}`,
  },
  {
    name: "integral-by-parts-formula-in-prose",
    input: `Formula used: \\int u\\,dv = uv - \\int v\\,du
Step 1: Choose u and dv.
\\int \\ln(5x)\\,dx = x\\ln(5x)-x+C`,
  },
  {
    name: "limit-cancellation-with-neq-and-frac",
    input: `For x \\neq 2, we cancel the common factor:
\\frac{x^2-4}{x-2}=x+2
## Final Answer
\\lim_{x\\to2}\\frac{x^2-4}{x-2}=4`,
  },
  {
    name: "matrix-environment-without-fences",
    input: `Step 1: Multiply the matrices.
\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\begin{bmatrix}5&6\\\\7&8\\end{bmatrix}=\\begin{bmatrix}19&22\\\\43&50\\end{bmatrix}
## Final Answer
\\begin{bmatrix}19&22\\\\43&50\\end{bmatrix}`,
  },
  {
    name: "single-dollar-inline-model-output",
    input: `The expression is $ f(x)=5x $.
Step 1: The derivative is $ f'(x)=5 $.
## Final Answer
$ f'(x)=5 $`,
    contains: [/\$f\(x\)=5x\$/, /\$f'\(x\)=5\$/],
  },
  {
    name: "artifact-inline-parentheses-delimiters-normalize",
    input: `Worked example: The derivative of \\(x^2\\) is \\(2x\\).`,
    ensureFinal: false,
    contains: [/\$x\^2\$/, /\$2x\$/],
    rejects: [/\\\(/, /\\\)/],
  },
  {
    name: "artifact-block-bracket-delimiters-normalize",
    input: `Formula:\n\\[\n\\int u\\,dv = uv - \\int v\\,du\n\\]\nApply it below.`,
    ensureFinal: false,
    contains: [/\$\$\n\\int u\\,dv = uv - \\int v\\,du\n\$\$/],
    rejects: [/\\\[/, /\\\]/],
  },
  {
    name: "bare-inline-math-in-prose",
    input: `The derivative of x^2 is 2x.
The function is f(x)=5x.`,
    ensureFinal: false,
    contains: [/\$x\^2\$/, /\$2x\$/, /\$f\(x\)=5x\$/],
  },
  {
    name: "mixed-inline-assignments-with-trig",
    input: `Choose u(x) = x^2, v(x) = sin(x), and keep f(x) ready.`,
    ensureFinal: false,
    contains: [/\$u\(x\) = x\^2\$/, /\$v\(x\)\$\s*=\s*\$\\sin\(x\)\$/, /\$f\(x\)\$/],
  },
  {
    name: "mixed-inline-exponential-and-substitution",
    input: `Using product rule with e^(x) and sin(x), then substitute x^3 into f(x).`,
    ensureFinal: false,
    contains: [/\$e\^\{x\}\$/, /\$\\sin\(x\)\$/, /\$x\^3\$/, /\$f\(x\)\$/],
  },
  {
    name: "probability-basic-fraction-stays-in-one-inline-math",
    input: `P(first heart) = 13/52`,
    ensureFinal: false,
    contains: [/\$P\(\\text\{first heart\}\) = \\frac\{13\}\{52\}\$/],
    rejects: [/P\(first heart\)/],
  },
  {
    name: "probability-conditional-stays-in-one-inline-math",
    input: `P(second heart | first heart) = 12/51`,
    ensureFinal: false,
    contains: [/\$P\(\\text\{second heart\} \\mid \\text\{first heart\}\) = \\frac\{12\}\{51\}\$/],
    rejects: [/P\(second heart \| first heart\)/],
  },
  {
    name: "probability-product-stays-in-one-inline-math",
    input: `P(two hearts) = P(first heart) × P(second heart | first heart)`,
    ensureFinal: false,
    contains: [/\$P\(\\text\{two hearts\}\) = P\(\\text\{first heart\}\) \\times P\(\\text\{second heart\} \\mid \\text\{first heart\}\)\$/],
    rejects: [/P\(two hearts\) = P\(first heart\) × P\(second heart \| first heart\)/],
  },
  {
    name: "implicit-product-inline-expression-stays-readable",
    input: `Differentiate sin(x)e^(2x) using the product rule.`,
    ensureFinal: false,
    contains: [/\$\\sin\(x\)e\^\{2x\}\$/],
    rejects: [/sin\(x\)e\^\(2x\)/],
  },
  {
    name: "adjacent-inline-expressions-get-spacing",
    input: `Choose u(x)=x^2,v(x)=sin(x), then continue.`,
    ensureFinal: false,
    contains: [/\$u\(x\)=x\^2\$, \$v\(x\)=\\sin\(x\)\$/],
    rejects: [/\$u\(x\)=x\^2\$,?\$v\(x\)=\\sin\(x\)\$/],
  },
  {
    name: "title-and-intro-inline-chain-rule",
    input: `**Derivative of sin(x^2)**\n\nSo now we take the derivative of sin(x^2).`,
    ensureFinal: false,
    contains: [/\*\*Derivative of \$\\sin\(x\^2\)\$\*\*/, /derivative of \$\\sin\(x\^2\)\$/],
  },
  {
    name: "title-inline-product-factors",
    input: `**Derivative of e^(x^2) ln(x)**`,
    ensureFinal: false,
    contains: [/\*\*Derivative of \$e\^\{x\^2\}\$ \$\\ln\(x\)\$\*\*/],
  },
  {
    name: "raw-text-command-outside-display",
    input: `Method used: \\text{Factor by finding the common pattern.}
Step 1: Use the pattern.
## Final Answer
x^2 - 9 = (x - 3)(x + 3)`,
  },
  {
    name: "currency-backslash-number-repair",
    input: `**Discount and Sales Tax**
The final price is \\34.02.
## Final Answer
\\34.02`,
  },
  {
    name: "display-block-splits-trailing-prose-after-fraction",
    input: `The geometric series is:
$$
\\frac{1}{1-x} for |x| < 1 can be written as:
$$
## Final Answer
$$
\\sum_{n=0}^{\\infty} x^n
$$`,
  },
  {
    name: "display-block-splits-comma-prose-after-infinity",
    input: `Since the ratio limit is:
$$
\\infty, this means the series converges for all x
$$
## Final Answer
$$
R=\\infty
$$`,
  },
  {
    name: "alternating-series-test-raw-latex-prose",
    input: `**Alternating Series Test**
The AST states that an alternating series \\sum_{n=1}^{\\infty} (-1)^{n-1} b_n converges if the following two conditions are met.

1. b_n is decreasing, i.e., b_{n+1} \\leq b_n for all n.
2. The limit of b_n as n approaches infinity is zero, i.e., \\lim_{n \\to \\infty} b_n = 0.

## Final Answer
Alternating Series Test (AST): An alternating series \\sum_{n=1}^{\\infty} (-1)^{n-1} \\frac{1}{n} converges if \\lim_{n \\to \\infty} b_n = 0.`,
  },
  {
    name: "exponential-e-caret-parentheses",
    input: `Find the derivative of e^(2x) + 3x.
$$
f(x) = e^(2x) + 3x
$$
$$
f'(x) = 2e^(2x) + 3
$$
## Final Answer
$$
f'(x) = 2e^(2x) + 3
$$`,
    contains: [/e\^\{2x\}/],
  },
  {
    name: "exponential-e-caret-negative-exponent",
    input: `Laplace transform: L{e^(-st)} where s > 0.
$$
L\\{e^{-st}\\} = \\frac{1}{s}
$$
## Final Answer
$$
L\\{e^{-st}\\} = \\frac{1}{s}
$$`,
    contains: [/e\^\{-st\}/],
  },
  {
    name: "trig-sin-unnormalized",
    input: `Product rule with sin(x):
$$
f(x) = x \\cdot sin(x)
$$
$$
f'(x) = sin(x) + x \\cdot cos(x)
$$
## Final Answer
$$
f'(x) = sin(x) + x \\cdot cos(x)
$$`,
    contains: [/\\sin\(x\)/, /\\cos\(x\)/],
  },
  {
    name: "trig-already-valid-latex",
    input: `Verified trigonometric functions:
$$
\\sin(x) + \\cos(x) + \\tan(x)
$$
## Final Answer
$$
\\sin(x) + \\cos(x) + \\tan(x)
$$`,
    contains: [/\\sin\(x\)/, /\\cos\(x\)/, /\\tan\(x\)/],
  },
  {
    name: "mixed-exponential-and-trig-product-rule",
    input: `Find the derivative of e^(2x) * sin(x).
$$
f(x) = e^(2x) \\cdot sin(x)
$$
$$
f'(x) = 2e^(2x) \\cdot sin(x) + e^(2x) \\cdot cos(x)
$$
## Final Answer
$$
f'(x) = 2e^(2x) \\cdot sin(x) + e^(2x) \\cdot cos(x)
$$`,
    contains: [/e\^\{2x\}/, /\\sin\(x\)/, /\\cos\(x\)/],
  },
];

let failed = false;
for (const fixture of fixtures) {
  if (!assertClean(fixture.name, fixture.input, fixture)) failed = true;
}

if (failed) process.exit(1);
