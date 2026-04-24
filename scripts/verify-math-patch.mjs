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

const { normalizeModelMathOutput } = sandbox.module.exports;

const regressionTests = [
  {
    name: "Derivative of e^(2x) + 3x",
    input: `Compute the derivative of e^(2x) + 3x.
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
    shouldContain: [
      { pattern: /e\^\{2x\}/, desc: "exponential normalized to braces" },
    ],
  },
  {
    name: "Product rule with sin(x)",
    input: `Apply the product rule to y = x sin(x).
$$
y = x \\cdot sin(x)
$$
$$
\\frac{dy}{dx} = sin(x) + x \\cdot cos(x)
$$
## Final Answer
$$
\\frac{dy}{dx} = sin(x) + x \\cdot cos(x)
$$`,
    shouldContain: [
      { pattern: /\\sin\(x\)/, desc: "sin normalized to LaTeX" },
      { pattern: /\\cos\(x\)/, desc: "cos normalized to LaTeX" },
    ],
  },
  {
    name: "Laplace transform with e^(-st)",
    input: `Compute the Laplace transform of e^(-st).
$$
\\mathcal{L}\\{e^(-st)\\} = \\int_0^\\infty e^(-st) f(t) \\, dt
$$
## Final Answer
$$
\\mathcal{L}\\{e^{-st}\\} = \\frac{1}{s} for s > 0
$$`,
    shouldContain: [
      { pattern: /e\^\{-st\}/, desc: "negative exponent normalized to braces" },
    ],
  },
  {
    name: "Already-valid LaTeX with \\sin(x) and e^{2x}",
    input: `Verify that \\sin(x) and e^{2x} are already valid LaTeX.
$$
\\sin(x) + e^{2x} = \\sin(x) + e^{2x}
$$
## Final Answer
$$
\\sin(x) + e^{2x}
$$`,
    shouldContain: [
      { pattern: /\\sin\(x\)/, desc: "already-valid \\sin preserved" },
      { pattern: /e\^\{2x\}/, desc: "already-valid e^{...} preserved" },
    ],
    shouldNotContain: [
      { pattern: /\\\\sin/, desc: "no double-escaping" },
    ],
  },
];

console.log("=== Math Formatting Patch Verification ===\n");

let allPassed = true;
for (const test of regressionTests) {
  const output = normalizeModelMathOutput(test.input);
  console.log(`\n📋 ${test.name}`);
  
  let testPassed = true;
  for (const { pattern, desc } of test.shouldContain) {
    if (pattern.test(output)) {
      console.log(`  ✅ ${desc}`);
    } else {
      console.log(`  ❌ ${desc} - NOT FOUND`);
      testPassed = false;
      allPassed = false;
    }
  }
  
  if (test.shouldNotContain) {
    for (const { pattern, desc } of test.shouldNotContain) {
      if (!pattern.test(output)) {
        console.log(`  ✅ ${desc}`);
      } else {
        console.log(`  ❌ ${desc} - FOUND (should not be)`);
        testPassed = false;
        allPassed = false;
      }
    }
  }
  
  console.log(`  Status: ${testPassed ? "PASS ✅" : "FAIL ❌"}`);
}

console.log(`\n${"=".repeat(45)}`);
console.log(`Overall: ${allPassed ? "ALL TESTS PASSED ✅" : "SOME TESTS FAILED ❌"}`);

if (!allPassed) process.exit(1);
