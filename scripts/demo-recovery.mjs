import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function readLines(path) {
  const text = readFileSync(join(root, path), "utf8");
  return text.split(/\r?\n/);
}

function findLine(lines, pattern) {
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? null : { line: index + 1, text: lines[index] };
}

function findAllTaskLines(lines, max = 5) {
  return lines
    .map((text, index) => ({ line: index + 1, text }))
    .filter((item) => /^\d+\.\s+/.test(item.text.trim()))
    .slice(0, max);
}

function section(title) {
  console.log(`\n## ${title}`);
}

function printLine(label, item) {
  if (!item) {
    console.log(`- ${label}: not found`);
    return;
  }
  console.log(`- ${label}: ${item.text.trim()} (line ${item.line})`);
}

const plans = readLines("PLANS.md");
const agents = readLines("AGENTS.md");
const runner = readLines("scripts/overnight-run.mjs");
let checkpoint = [];
try {
  checkpoint = readLines("CHECKPOINT.md");
} catch {
  checkpoint = [
    "# NikiAI Overnight Checkpoint",
    "",
    "Updated: simulated",
    "Loop: simulated",
    "Status: simulated-crash",
    "Phase: Task 14 final-answer parity check",
    "Command: `npm run test:math-stability`",
    "Detail: Simulated crash during Task 14; no files were mutated by this demo.",
  ];
}

section("State Persistence Audit");
console.log("Simulated event: crash during Task 14, Final Answer Parity Check.");
printLine("Task 14 in PLANS.md", findLine(plans, /^14\.\s+/));
printLine("Checkpoint status", findLine(checkpoint, /^Status:/));
printLine("Checkpoint phase", findLine(checkpoint, /^Phase:/));
printLine("Checkpoint command", findLine(checkpoint, /^Command:/));
printLine("Resume protocol anchor", findLine(checkpoint, /Resume Protocol/i));
console.log("- Resume behavior: rerun the checkpoint command first if it failed; if it passed, continue at the next incomplete PLANS.md item. Do not restart the whole checklist.");

section("Service Heartbeat Recovery");
printLine("Health check function", findLine(runner, /function healthCheck/));
printLine("Configurable health URL", findLine(runner, /OLLAMA_HEALTH_URL/));
printLine("Health failure branch", findLine(runner, /HEALTH_FAILED sleeping/));
printLine("Backoff function", findLine(runner, /function failureDelayMs/));
printLine("Retry base", findLine(runner, /sleepFailBaseMs/));
printLine("Retry cap", findLine(runner, /sleepFailMaxMs/));
console.log("- Failure behavior: the runner does not exit when Ollama/ngrok health fails. It writes a checkpoint, logs the failure, sleeps, and retries.");

section("Context Refill Check");
printLine("Primary objective", findLine(agents, /Primary Objective/i));
printLine("Math integrity", findLine(agents, /Math Integrity/i));
printLine("RAG discipline", findLine(agents, /RAG Discipline/i));
console.log("- First five PLANS.md task anchors to preserve after context compaction:");
for (const item of findAllTaskLines(plans, 5)) {
  console.log(`  - line ${item.line}: ${item.text.trim()}`);
}
console.log("- Context refill behavior: reload AGENTS.md for rules, PLANS.md for task order, CHECKPOINT.md for active phase, and overnight_log.txt only for recent command history.");

section("Safe Demo Result");
console.log("This demo only reads files and prints the recovery plan. It does not mark any PLANS.md task complete.");
