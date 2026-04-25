import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
let source = readFileSync("lib/deterministicMath.ts", "utf8");
source = source.replace(
  /import\.meta\.url/g,
  JSON.stringify(new URL("file:///C:/Users/BrandonHargadon/niki-ai/lib/deterministicMath.ts").href)
);

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
  console,
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(compiled.outputText, sandbox, {
  filename: "lib/deterministicMath.ts",
});

const { buildDeterministicMathReply } = sandbox.module.exports;

if (typeof buildDeterministicMathReply !== "function") {
  throw new Error("buildDeterministicMathReply was not exported correctly.");
}

function assertReply(name, message, { expect = [], reject = [] } = {}) {
  const output = buildDeterministicMathReply({
    message,
    isProfessorMode: false,
    lectureMode: false,
    hasLectureContext: false,
  });

  const failures = [];
  if (!output) failures.push("no deterministic reply returned");
  for (const pattern of expect) {
    if (!pattern.test(output ?? "")) failures.push(`missing ${pattern}`);
  }
  for (const pattern of reject) {
    if (pattern.test(output ?? "")) failures.push(`unexpected ${pattern}`);
  }

  if (failures.length) {
    console.error(`❌ ${name}`);
    console.error(failures.map((failure) => `   - ${failure}`).join("\n"));
    console.error("--- output ---");
    console.error(output ?? "<null>");
    return false;
  }

  console.log(`✅ ${name}`);
  return true;
}

const checks = [
  {
    name: "product rule factors shared positive exponential cleanly",
    message: "derivative of e^(2x)sin(x)",
    expect: [
      /\*\*Formula used:\*\*[\s\S]*u\(x\)v\(x\)/i,
      /e\^\{2x\}\(2\\sin\(x\)\+\\cos\(x\)\)/,
      /Derivative of sin\(x\) e\^\(2x\)/,
    ],
    reject: [/ln\(e\)/i],
  },
  {
    name: "product rule with negative exponential uses standard factored form",
    message: "derivative of sin(x)e^(-2x)",
    expect: [
      /\*\*Formula used:\*\*[\s\S]*u\(x\)v\(x\)/i,
      /e\^\{-2x\}\\left\(\\cos\(x\)-2\\sin\(x\)\\right\)/,
    ],
    reject: [/\/e\^\{2x\}/, /ln\(e\)/i],
  },
  {
    name: "integral of x e^x uses integration by parts result",
    message: "integral of x e^x",
    expect: [
      /\*\*Formula used:\*\*[\s\S]*\\int u\\,dv=uv-\\int v\\,du/i,
      /e\^\{x\}\(x-1\)\s*\+\s*C/,
    ],
    reject: [/ln\(xe\)/i, /\\frac\{xe\^\{x\}\}\{\\ln\(xe\)\}/i],
  },
  {
    name: "sine over x limit still uses the standard identity cleanly",
    message: "limit as x -> 0 of sin(x)/x",
    expect: [
      /Using the standard limit:/i,
      /\\lim_\{u\\to 0\}\\frac\{\\sin\(u\)\}\{u\}=1/,
      /\\lim_\{x\\to 0\}\\frac\{\\sin\(x\)\}\{x\}=1/,
    ],
  },
  {
    name: "natural-language probability without replacement solves directly",
    message: "probability of 2 hearts without replacement",
    expect: [
      /Probability of Two Hearts Without Replacement/i,
      /P\(\\text\{first heart\}\)=\\frac\{13\}\{52\}/,
      /P\(\\text\{second heart\}\\mid \\text\{first heart\}\)=\\frac\{12\}\{51\}/,
      /P\(\\text\{two hearts\}\)=\\frac\{1\}\{17\}/,
    ],
  },
];

let failed = false;
for (const check of checks) {
  if (!assertReply(check.name, check.message, check)) failed = true;
}

if (failed) process.exit(1);
