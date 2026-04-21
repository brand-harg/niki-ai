import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const API_URL = process.env.NIKI_CHAT_URL ?? "http://localhost:3000/api/chat";

const basePrompts = [
  "Solve for n: 144 / (12 * 3) + 7^2 - 15 = n",
  "Simplify 3/4 + 5/8 - 0.125",
  "A shirt costs $45 and is 20% off. What is the final price after 7% sales tax?",
  "Find the roots using the quadratic formula: 2x^2 - 7x + 3 = 0",
  "Solve the system: 3x + 4y = 10 and 2x - y = 3",
  "Find the volume of a cylinder with radius 5 cm and height 12 cm.",
  "Evaluate the limit as x approaches 0 of sin(5x)/x",
  "Evaluate the limit as x approaches 2 of (x^2 - 4)/(x - 2)",
  "Evaluate the limit as x approaches 2 of 3x^2 - 4x + 1",
  "Find dy/dx for y = e^(x^2) * ln(x)",
  "Solve the definite integral from 1 to 3 of 3x^2 - 2x + 5 dx",
  "Multiply matrices A=[[1,2],[3,4]] and B=[[5,6],[7,8]]",
  "Evaluate sum from i=1 to 5 of i^2 + 2i",
  "Simplify (5 + 2i)/(3 - i) into a + bi form",
  "Derivative of 5x",
  "Do the integral on ln5x",
  "Factor x^2 - 9",
  "Expand (2x - 3)(x + 4)",
  "Simplify 2x + 3x - 4 + 7",
  "Solve x^2 - 5x + 6 = 0",
  "Do synthetic division for 2x^3 - 5x^2 + 3x + 1 by x - 2",
  "Complete the square for x^2 + 6x + 5",
  "Find the derivative of sin(x^2)",
  "Find the derivative of ln(3x^2 + 1)",
  "Integrate x^2 sin(x^3)",
  "Evaluate integral from 0 to pi of sin(x) dx",
  "Solve dy/dx = 3y with y(0)=2",
  "Find eigenvalues of [[2,1],[1,2]]",
  "Find determinant of [[1,2,3],[0,4,5],[1,0,6]]",
  "Write f(x)=x^2 for x<0 and 2x+1 for x>=0 as a piecewise function",
  "Find the domain of sqrt(x-3)/(x^2-9)",
  "Use the identity sin^2(x)+cos^2(x)=1 to simplify 1-cos^2(x)",
  "Find the mean and standard deviation of 2, 4, 4, 4, 5, 5, 7, 9",
  "If P(A)=0.4, P(B)=0.5, and P(A and B)=0.2, find P(A|B)",
  "Find the z-score for x=85, mean=70, standard deviation=10",
  "Find the vertex and intercepts of y=x^2-4x+3",
  "Convert 3.2*10^5 into standard form and explain scientific notation",
  "Find the Taylor polynomial of degree 3 for e^x at x=0",
  "Use the ratio test on sum n!/5^n",
  "Find the cross product of <1,2,3> and <4,5,6>",
  "Find the gradient of f(x,y)=x^2y+sin(y)",
  "Use row reduction to solve x+y+z=6, 2x-y+z=3, x+2y-z=3",
  "Evaluate the limit as x approaches infinity of (3x^2 + 1)/(2x^2 - 5)",
  "Use L'Hopital's rule for the limit as x approaches 0 of (e^x - 1)/x",
  "Find the derivative of arcsin(x)",
  "Integrate sec^2(x)",
  "Find the equation of the tangent line to y=x^2 at x=3",
  "Find the critical points of f(x)=x^3-3x^2+2",
  "Find the inverse of matrix [[1,2],[3,5]]",
  "Find the partial fraction decomposition of (3x+5)/(x^2+x-2)",
  "Solve the separable differential equation dy/dx = x y",
  "Solve the recurrence a_n = 2a_{n-1}, a_0 = 3",
];

function argValue(name, fallback = "") {
  const arg = process.argv.find((item) => item.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function loadProblemSet() {
  const file = argValue("--problems", "");
  if (file) {
    return JSON.parse(readFileSync(file, "utf8"));
  }

  if (hasArg("--stress")) {
    return JSON.parse(readFileSync("scripts/math-stress-problems.json", "utf8"));
  }

  return basePrompts.map((prompt, index) => ({
    id: `base-${String(index + 1).padStart(3, "0")}`,
    category: "base",
    prompt,
  }));
}

const modes = [
  { name: "pure", isNikiMode: false, lectureMode: false },
  { name: "nemanja", isNikiMode: true, lectureMode: false },
  { name: "nemanja-lecture", isNikiMode: true, lectureMode: true },
];

const repeat = Number(argValue("--repeat", "1"));
const limitArg = argValue("--limit", "");
const outPath = argValue("--out", "scripts/response_logs.json");
const problemSet = loadProblemSet();
const limit = limitArg ? Number(limitArg) : problemSet.length;
const prompts = problemSet.slice(0, Number.isFinite(limit) ? limit : problemSet.length);
const logs = [];

function displayFenceCount(text) {
  return (text.match(/\$\$/g) ?? []).length;
}

function stripDisplayMath(text) {
  return text.replace(/\$\$[\s\S]*?\$\$/g, "");
}

function hasEmptyDisplayMath(text) {
  return [...text.matchAll(/\$\$([\s\S]*?)\$\$/g)].some((match) => !match[1]?.trim());
}

function validateOutput(text) {
  const failures = [];
  const outsideDisplay = stripDisplayMath(text);
  const inlineLatexCommands = /\$[^$\n]*\\(?:frac|sqrt|int|sum|lim|begin|left|right|ln|log|sin|cos|tan|sec|csc|cot|cdot|vec|bar|hat|overline|pi|infty)[^$\n]*\$/;

  if (displayFenceCount(text) % 2 !== 0) failures.push("unbalanced display math fences");
  if (hasEmptyDisplayMath(text)) failures.push("empty display math block");
  if (/^\s*\$(?!\$)\s*$/m.test(text)) failures.push("standalone single dollar");
  if (/\\\[|\\\]|\\\(|\\\)/.test(text)) failures.push("unsupported latex delimiters");
  if (/\\boxed\s*\{/.test(text)) failures.push("boxed output");
  if (/\*\s+\*\s*Step\s+\d|\*\*\s*Step\s+-\s+by\s+-\s+Step|\*\*\s*Step\d|\*\*\s+Step\s+\d/i.test(text)) {
    failures.push("broken step markdown");
  }
  if (/(Short Topic Title|Specific Title)/i.test(text)) failures.push("template placeholder leaked");
  if (inlineLatexCommands.test(text)) failures.push("fragile inline latex command");
  if (/\\(?:frac|sqrt|int|sum|lim|begin|left|right|cdot)\b/.test(outsideDisplay.replace(/\$[^$\n]*\$/g, ""))) {
    failures.push("raw latex command outside math block");
  }
  for (const block of text.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
    const expr = block[1] ?? "";
    const proseWords = (expr.match(/\b(?:we|this|that|because|since|therefore|remember|answer|result|slope|function)\b/gi) ?? []).length;
    const wordCount = (expr.match(/[A-Za-z]{3,}/g) ?? []).length;
    if (wordCount >= 8 && proseWords >= 2) {
      failures.push("prose inside display math");
      break;
    }
  }
  if (!/Final Answer/i.test(text)) failures.push("missing final answer");

  return failures;
}

function failureCode(failure) {
  if (/prose inside display math|raw latex command outside math block|broken step markdown|template placeholder/i.test(failure)) {
    return "SAN";
  }
  if (/boxed|unsupported latex delimiters|standalone single dollar|unbalanced display math fences|empty display math block/i.test(failure)) {
    return "UI";
  }
  if (/missing final answer/i.test(failure)) {
    return "LOGIC";
  }
  if (/request failed/i.test(failure)) {
    return "REQ";
  }
  return "UNK";
}

function codedFailures(failures) {
  return failures.map((failure) => `[${failureCode(failure)}] ${failure}`);
}

async function callChat(prompt, mode) {
  const started = Date.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prompt,
      history: [],
      isNikiMode: mode.isNikiMode,
      lectureMode: mode.lectureMode,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return { text, elapsedMs: Date.now() - started };
}

let failed = false;
let count = 0;
const started = Date.now();

for (let pass = 1; pass <= repeat; pass++) {
  for (const mode of modes) {
    for (const problem of prompts) {
      const prompt = typeof problem === "string" ? problem : problem.prompt;
      const id = typeof problem === "string" ? undefined : problem.id;
      const category = typeof problem === "string" ? "uncategorized" : problem.category;
      count++;
      const label = `[${count}] pass ${pass}/${repeat} ${mode.name}: ${prompt}`;
      try {
        const { text: output, elapsedMs } = await callChat(prompt, mode);
        const failures = validateOutput(output);
        const coded = codedFailures(failures);
        logs.push({
          id,
          pass,
          mode: mode.name,
          category,
          prompt,
          output,
          failures,
          codedFailures: coded,
          elapsedMs,
          ok: failures.length === 0,
        });
        if (failures.length) {
          failed = true;
          console.error(`❌ ${label}`);
          console.error(`   ${coded.join(", ")}`);
          console.error(output.slice(0, 1200));
        } else {
          console.log(`✅ ${label}`);
        }
      } catch (error) {
        failed = true;
        logs.push({
          id,
          pass,
          mode: mode.name,
          category,
          prompt,
          output: "",
          failures: ["request failed"],
          codedFailures: ["[REQ] request failed"],
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: 0,
          ok: false,
        });
        console.error(`❌ ${label}`);
        console.error(error instanceof Error ? error.message : error);
      }
    }
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(logs, null, 2)}\n`);
console.log(`\nChecked ${count} live math responses in ${seconds}s.`);
console.log(`Wrote response log to ${outPath}.`);
if (failed) process.exit(1);
