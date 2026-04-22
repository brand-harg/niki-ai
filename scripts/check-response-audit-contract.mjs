import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "niki-audit-contract-"));

function writeJson(name, data) {
  const filePath = join(tempDir, name);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

function runAudit(filePath) {
  const result = spawnSync("node", ["scripts/audit-response-logs.mjs", filePath], {
    cwd: root,
    encoding: "utf8",
  });

  const jsonText = result.stdout.split(/\nAudit failures detected:/)[0].trim();
  let summary;
  try {
    summary = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Audit output was not valid JSON.\n${result.stdout}\n${result.stderr}\n${error}`);
  }

  return { status: result.status ?? 0, stdout: result.stdout, stderr: result.stderr, summary };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const cleanLog = writeJson("clean.json", [
  {
    id: "clean-pure",
    pass: 0,
    mode: "pure",
    category: "derivative",
    prompt: "derivative of 5x",
    output: "## Final Answer\nf'(x) = 5",
  },
  {
    id: "clean-nemanja",
    pass: 0,
    mode: "nemanja",
    category: "derivative",
    prompt: "derivative of 5x",
    output: "## Final Answer\nf'(x) = 5",
  },
  {
    id: "clean-limit-pure",
    pass: 1,
    mode: "pure",
    category: "limit",
    prompt: "Evaluate the limit as x approaches infinity of (3x^2 + 1)/(2x^2 - 5)",
    output: "## Final Answer\nThe limit is\n$$\n\\frac{3}{2}\n$$",
  },
  {
    id: "clean-limit-lecture",
    pass: 1,
    mode: "nemanja-lecture",
    category: "limit",
    prompt: "Evaluate the limit as x approaches infinity of (3x^2 + 1)/(2x^2 - 5)",
    output:
      "## Final Answer\n$$\n\\lim_{x \\to \\infty} \\frac{3x^2 + 1}{2x^2 - 5} = \\frac{3}{2}\n$$",
  },
]);

const badLog = writeJson("bad.json", [
  {
    id: "san-text",
    pass: 0,
    mode: "pure",
    category: "algebra",
    prompt: "factor x^2 - 9",
    output: "Method used: \\text{Factor the difference of squares}\n\n## Final Answer\nx^2 - 9 = (x - 3)(x + 3)",
  },
  {
    id: "san-series",
    pass: 0,
    mode: "nemanja-lecture",
    category: "series",
    prompt: "I can't figure out AST",
    output:
      "The AST states that an alternating series \\sum_{n=1}^{\\infty} (-1)^{n-1} b_n converges if \\lim_{n \\to \\infty} b_n = 0.\n\n## Final Answer\nIt converges.",
  },
  {
    id: "ui-money",
    pass: 0,
    mode: "pure",
    category: "percent",
    prompt: "discount and tax",
    output: "## Final Answer\n\\34.02",
  },
  {
    id: "disc-pure",
    pass: 1,
    mode: "pure",
    category: "derivative",
    prompt: "derivative of 5x",
    output: "## Final Answer\nf'(x) = 5",
  },
  {
    id: "disc-nemanja",
    pass: 1,
    mode: "nemanja",
    category: "derivative",
    prompt: "derivative of 5x",
    output: "## Final Answer\nf'(x) = 6",
  },
  {
    id: "rag-grounding",
    pass: 2,
    mode: "nemanja-lecture",
    category: "rag",
    prompt: "lecture me on Calculus1 3.2 Derivative as a Function",
    expectedGroundingKeywords: ["Derivative as a Function"],
    output: "This is a generic calculus explanation with no retrieved lecture anchor.",
  },
]);

try {
  const clean = runAudit(cleanLog);
  expect(clean.status === 0, `Clean log should pass, got status ${clean.status}.\n${clean.stdout}`);
  expect(clean.summary.current_clean_streak_entries === 4, "Clean log should report a four-entry clean streak.");
  expect(Object.keys(clean.summary.failures_by_code).length === 0, "Clean log should not report failure codes.");

  const bad = runAudit(badLog);
  expect(bad.status !== 0, "Bad log should fail.");
  expect(bad.summary.failures_by_code.SAN?.count === 2, "Bad log should report two [SAN] failures.");
  expect(bad.summary.failures_by_code.UI?.count === 1, "Bad log should report one [UI] failure.");
  expect(bad.summary.failures_by_code.DISC?.count === 1, "Bad log should report one [DISC] failure.");
  expect(bad.summary.failures_by_code.RAG?.count === 1, "Bad log should report one [RAG] failure.");
  expect(
    bad.summary.unique_failure_patterns_last_window.some((failure) => failure.startsWith("SAN:")),
    "Bad log should expose SAN in the saturation window.",
  );

  console.log("response-audit contract checks passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
