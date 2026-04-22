import { appendFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const logPath = join(root, "overnight_log.txt");
const checkpointPath = join(root, "CHECKPOINT.md");
const commands = [
  ["npm", "run", "test:math-stability"],
  ["npm", "run", "test:math-sanitizer"],
  ["npm", "run", "test:math-followups"],
  ["npm", "run", "test:prompt"],
  ["npm", "run", "test:persona-extraction"],
  ["npm", "run", "test:frontend-contract"],
  ["npm", "run", "test:api-route"],
  ["npm", "run", "test:diagnostics"],
  ["npm", "run", "test:rag-route"],
  ["npm", "run", "test:rag-citations"],
  ["npm", "run", "test:rag-nightmares"],
  ["npm", "run", "test:response-audit"],
  ["npm", "run", "test:rag-quality:core-courses"],
  [
    "node",
    "scripts/check-live-math-output.mjs",
    "--repeat=6",
    "--out=scripts/response_logs/live-clean-streak.json",
  ],
  ["node", "scripts/audit-response-logs.mjs", "scripts/response_logs/live-clean-streak.json"],
  ["npm", "run", "lint"],
  ["npx", "tsc", "--noEmit"],
];

function writeWithRetry(path, content, writeFn, attempts = 8) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      writeFn(path, content);
      return;
    } catch (error) {
      lastError = error;
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      if (code !== "EBUSY" && code !== "EPERM") break;
      sleep(Math.min(250 * attempt, 1500));
    }
  }
  throw lastError;
}

function appendLog(content) {
  writeWithRetry(logPath, content, appendFileSync);
}

function writeCheckpointFile(content) {
  writeWithRetry(checkpointPath, content, writeFileSync);
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendLog(`${line}\n`);
}

function writeCheckpoint({
  loop,
  phase,
  command = "",
  status = "active",
  detail = "",
}) {
  const lines = [
    "# NikiAI Overnight Checkpoint",
    "",
    `Updated: ${new Date().toISOString()}`,
    `Loop: ${loop}`,
    `Status: ${status}`,
    `Phase: ${phase}`,
    command ? `Command: \`${command}\`` : "Command: none",
    detail ? `Detail: ${detail}` : "Detail: none",
    "",
    "## Resume Protocol",
    "1. Read `PLANS.md` for the master task order.",
    "2. Read `AGENTS.md` for non-negotiable constraints.",
    "3. Read this checkpoint to find the last active phase and command.",
    "4. If the last command failed, rerun that command first and fix failures before moving forward.",
    "5. If the last command passed, continue with the next incomplete item in `PLANS.md`.",
    "",
    "## Current Guardrails",
    "- Do not mark a task complete unless implementation and tests support it.",
    "- Do not rerun already-passing long stress suites unless the related code changed or a clean-streak reset is required.",
    "- Do not commit generated logs or temporary files.",
  ];
  writeCheckpointFile(`${lines.join("\n")}\n`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(command, options = {}) {
  if (options.loop) {
    writeCheckpoint({
      loop: options.loop,
      phase: options.phase ?? "command",
      command: command.join(" "),
      status: "running",
    });
  }
  log(`RUN ${command.join(" ")}`);
  const started = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: options.timeoutMs ?? 600000,
  });
  if (result.stdout) appendLog(result.stdout);
  if (result.stderr) appendLog(result.stderr);
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  log(`EXIT ${result.status ?? 1} after ${elapsed}s`);
  if (options.loop) {
    writeCheckpoint({
      loop: options.loop,
      phase: options.phase ?? "command",
      command: command.join(" "),
      status: (result.status ?? 1) === 0 ? "passed" : "failed",
      detail: `Exit code ${result.status ?? 1} after ${elapsed}s`,
    });
  }
  return result.status ?? 1;
}

function healthCheck(loop) {
  if (process.env.SKIP_OLLAMA_HEALTH === "1") return true;
  const healthUrl = process.env.OLLAMA_HEALTH_URL ?? "http://localhost:11434/api/tags";
  return run(["curl", "-f", healthUrl], {
    timeoutMs: 15000,
    loop,
    phase: "health-check",
  }) === 0;
}

function runAgentCommand(loop) {
  const command = (process.env.NIKIAI_AGENT_COMMAND ?? "").trim();
  if (!command) {
    log("NO_AGENT_COMMAND configured; running verification loop only");
    return 0;
  }
  return run(command.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, "")), {
    timeoutMs: 0,
    loop,
    phase: "agent-command",
  });
}

function runIteration(loop) {
  writeCheckpoint({ loop, phase: "iteration-start", status: "running" });
  const agentCode = runAgentCommand(loop);
  if (agentCode !== 0) return agentCode;
  for (const command of commands) {
    const timeoutMs = command.includes("scripts/check-live-math-output.mjs")
      ? 7200000
      : command.includes("test:rag-quality:core-courses")
        ? 1800000
      : 600000;
    const code = run(command, { loop, phase: "verification", timeoutMs });
    if (code !== 0) return code;
  }
  if (process.env.RUN_BUILD_EACH_LOOP !== "0") {
    return run(["npm", "run", "build"], {
      timeoutMs: 900000,
      loop,
      phase: "production-build",
    });
  }
  return 0;
}

const maxLoops = Number(process.env.NIKIAI_MAX_LOOPS ?? 0);
const sleepOkMs = Number(process.env.NIKIAI_SLEEP_OK_SECONDS ?? 30) * 1000;
const sleepFailBaseMs = Number(process.env.NIKIAI_SLEEP_FAIL_SECONDS ?? 30) * 1000;
const sleepFailMaxMs = Number(process.env.NIKIAI_SLEEP_FAIL_MAX_SECONDS ?? 300) * 1000;

function failureDelayMs(failureStreak) {
  const multiplier = Math.max(1, 2 ** Math.max(0, failureStreak - 1));
  return Math.min(sleepFailBaseMs * multiplier, sleepFailMaxMs);
}

log("OVERNIGHT_RUN_START");
let loop = 0;
let failureStreak = 0;
while (true) {
  loop += 1;
  writeCheckpoint({ loop, phase: "loop-start", status: "running" });
  if (maxLoops && loop > maxLoops) {
    writeCheckpoint({ loop, phase: "loop-stop", status: "complete", detail: "Max loops reached" });
    log("MAX_LOOPS_REACHED");
    process.exit(0);
  }
  if (!healthCheck(loop)) {
    failureStreak += 1;
    const sleepFailMs = failureDelayMs(failureStreak);
    writeCheckpoint({
      loop,
      phase: "health-check",
      status: "waiting",
      detail: `Health check failed; failure streak ${failureStreak}; retrying in ${sleepFailMs / 1000}s`,
    });
    log(`HEALTH_FAILED sleeping ${sleepFailMs / 1000}s`);
    sleep(sleepFailMs);
    continue;
  }
  const code = runIteration(loop);
  if (code !== 0) {
    failureStreak += 1;
    const sleepFailMs = failureDelayMs(failureStreak);
    writeCheckpoint({
      loop,
      phase: "iteration",
      status: "waiting",
      detail: `Iteration failed with code ${code}; failure streak ${failureStreak}; retrying in ${sleepFailMs / 1000}s`,
    });
    log(`ITERATION_FAILED code=${code}; sleeping ${sleepFailMs / 1000}s`);
    sleep(sleepFailMs);
    continue;
  }
  failureStreak = 0;
  writeCheckpoint({
    loop,
    phase: "iteration",
    status: "passed",
    detail: `All configured checks passed; next loop starts after ${sleepOkMs / 1000}s`,
  });
  log(`ITERATION_OK sleeping ${sleepOkMs / 1000}s`);
  sleep(sleepOkMs);
}
