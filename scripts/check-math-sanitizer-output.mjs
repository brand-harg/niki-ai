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
  return text.replace(/\$\$[\s\S]*?\$\$/g, "");
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

function assertClean(name, input, { ensureFinal = true } = {}) {
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
];

let failed = false;
for (const fixture of fixtures) {
  if (!assertClean(fixture.name, fixture.input, fixture)) failed = true;
}

if (failed) process.exit(1);
