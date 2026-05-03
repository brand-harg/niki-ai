import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const commands = [
  {
    label: "npx tsc --noEmit",
    expected: "TypeScript passes",
    bin: npxBin,
    args: ["tsc", "--noEmit"],
  },
  { label: "npm run lint", expected: "Lint passes", bin: npmBin, args: ["run", "lint"] },
  {
    label: "npm run test",
    expected: "Full local contract suite passes",
    bin: npmBin,
    args: ["run", "test"],
  },
  {
    label: "npm run test:e2e",
    expected: "Playwright smoke suite passes",
    bin: npmBin,
    args: ["run", "test:e2e"],
  },
  {
    label: "npm run build",
    expected: "Production build passes",
    bin: npmBin,
    args: ["run", "build"],
  },
  {
    label: "npm run test:privacy-boundaries",
    expected: "Privacy/data-boundary contracts pass",
    bin: npmBin,
    args: ["run", "test:privacy-boundaries"],
  },
  {
    label: "npm run test:session-boundaries",
    expected: "Session-boundary contracts pass",
    bin: npmBin,
    args: ["run", "test:session-boundaries"],
  },
  {
    label: "npm run test:safe-logging",
    expected: "Safe-logging contracts pass",
    bin: npmBin,
    args: ["run", "test:safe-logging"],
  },
  {
    label: "npm run test:performance",
    expected: "Performance guardrails pass",
    bin: npmBin,
    args: ["run", "test:performance"],
  },
  {
    label: "npm run test:frontend-contract",
    expected: "Frontend contracts pass",
    bin: npmBin,
    args: ["run", "test:frontend-contract"],
  },
];

const manualChecks = [
  "Supabase Auth Site URL and Redirect URLs in the dashboard",
  "Real email confirmation and password reset inbox flows",
  "Visual Supabase RLS policy review for user-owned tables",
  "Visual Supabase Storage policy review for upload/avatar buckets",
  "Two-user live isolation checks for chats, artifacts, uploads, and logout boundaries",
  "Vercel dashboard environment variable scope review",
  "Production deployment health and rollback target confirmation",
  "Human beta go/no-go sign-off in docs/BETA_AUDIT_RESULTS.md",
];

const envNames = readLocalEnvNames();
const envChecks = [
  checkEnvName("NEXT_PUBLIC_SUPABASE_URL", envNames),
  checkEnvName("NEXT_PUBLIC_SUPABASE_ANON_KEY", envNames),
  checkEnvName("SUPABASE_SERVICE_ROLE_KEY", envNames),
  checkEnvName("OPENAI_API_KEY", envNames, true),
  checkEnvName("OLLAMA_API_URL", envNames, true),
];

const startedAt = new Date();
const results = [];

console.log("Starting NIKIAI beta audit automation.");
console.log("Secret values will not be printed or written to the report.");

for (const command of commands) {
  const started = Date.now();
  console.log(`\n> ${command.label}`);
  const runResult = await runCommand(command);
  const durationMs = Date.now() - started;
  results.push({
    label: command.label,
    expected: command.expected,
    status: runResult.status,
    exitCode: runResult.exitCode,
    durationMs,
  });
}

const finishedAt = new Date();
const hasFailures = results.some((result) => result.status !== "Pass");
writeReport({
  startedAt,
  finishedAt,
  results,
  envChecks,
  manualChecks,
  hasFailures,
});
updateAuditResults({ results, hasFailures });

if (hasFailures) {
  process.exitCode = 1;
} else {
  console.log("\nBeta audit automation completed successfully.");
}

function runCommand(command) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      const childCommand =
        process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : command.bin;
      const childArgs =
        process.platform === "win32"
          ? ["/d", "/s", "/c", command.bin, ...command.args]
          : command.args;

      child = spawn(childCommand, childArgs, {
        cwd: repoRoot,
        env: process.env,
        shell: false,
        stdio: "inherit",
      });
    } catch {
      resolvePromise({ status: "Blocked", exitCode: null });
      return;
    }

    child.on("error", () => resolvePromise({ status: "Blocked", exitCode: null }));
    child.on("close", (code) => {
      if (code === null) {
        resolvePromise({ status: "Blocked", exitCode: null });
        return;
      }

      resolvePromise({ status: code === 0 ? "Pass" : "Fail", exitCode: code });
    });
  });
}

function readLocalEnvNames() {
  const names = new Set(Object.keys(process.env));
  const envPath = resolve(repoRoot, ".env.local");

  if (!existsSync(envPath)) return names;

  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (match) names.add(match[1]);
  }

  return names;
}

function checkEnvName(name, names, optional = false) {
  const present = names.has(name);
  return {
    name,
    required: !optional,
    status: present ? "Pass" : optional ? "N/A" : "Fail",
    note: present
      ? "Name present; value not recorded"
      : optional
        ? "Optional name not present locally"
        : "Required name missing locally",
  };
}

function formatDuration(durationMs) {
  return `${Math.round(durationMs / 100) / 10}s`;
}

function formatExitCode(exitCode) {
  return exitCode === null ? "N/A" : String(exitCode);
}

function validationActual(status) {
  if (status === "Pass") return "Passed by npm run audit:beta";
  if (status === "Fail") return "Failed by npm run audit:beta";
  return "Blocked by npm run audit:beta";
}

function validationEvidence(status) {
  if (status === "Pass") return "See docs/BETA_AUDIT_AUTO_REPORT.md; no secret values recorded";
  if (status === "Fail") return "See docs/BETA_AUDIT_AUTO_REPORT.md; manual verification still required";
  return "Command could not run; see docs/BETA_AUDIT_AUTO_REPORT.md";
}

function writeReport({ startedAt, finishedAt, results, envChecks, manualChecks, hasFailures }) {
  const reportPath = resolve(repoRoot, "docs/BETA_AUDIT_AUTO_REPORT.md");
  const target = process.env.BETA_BASE_URL
    ? "BETA_BASE_URL configured; value redacted"
    : "Local Playwright/webServer behavior";

  const lines = [
    "# NIKIAI Beta Audit Auto Report",
    "",
    "Generated by `npm run audit:beta`.",
    "",
    "> Safety: This report records command status and environment variable names only. It does not include secrets, private prompts, uploads, artifacts, tokens, cookies, API keys, service-role keys, URLs, or full user data.",
    "",
    "## Run Metadata",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Started | ${startedAt.toISOString()} |`,
    `| Finished | ${finishedAt.toISOString()} |`,
    `| Environment target | ${target} |`,
    `| Overall status | ${hasFailures ? "Fail" : "Pass"} |`,
    "",
    "## Automated Command Results",
    "",
    "| Status | Command | Exit code | Duration | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.status} | \`${result.label}\` | ${formatExitCode(result.exitCode)} | ${formatDuration(
          result.durationMs
        )} | Output was shown in terminal only; not copied into this report |`
    ),
    "",
    "## Local Environment Name Checks",
    "",
    "Values are intentionally not printed or saved.",
    "",
    "| Status | Name | Required | Notes |",
    "| --- | --- | --- | --- |",
    ...envChecks.map(
      (check) =>
        `| ${check.status} | \`${check.name}\` | ${check.required ? "Yes" : "Optional"} | ${
          check.note
        } |`
    ),
    "",
    "## Automated Coverage Mapping",
    "",
    "| Area from beta tracker | Automated coverage in this run | Still manual? |",
    "| --- | --- | --- |",
    "| Automated Validation Results | TypeScript, lint, tests, E2E, build, privacy, session, safe logging, performance, frontend contracts | No |",
    "| Quick 30-Minute Audit Results | Local smoke/E2E coverage and env-name presence checks | Yes, production dashboard/browser proof remains manual |",
    "| Supabase Auth checks | Local env-name checks only | Yes, dashboard settings and email inbox flows are manual |",
    "| Supabase RLS checks | Code-level privacy-boundary contracts | Yes, live dashboard policy verification is manual |",
    "| Supabase Storage checks | Code-level upload path/privacy contracts | Yes, live bucket policy and cross-user access checks are manual |",
    "| Lecture/Knowledge Data checks | Code-level privacy/RAG boundary checks and frontend contracts | Yes, live lecture count/source behavior smoke remains manual |",
    "| Vercel Environment checks | Local env-name checks only | Yes, Vercel scope verification is manual |",
    "| Deployment Verification | Local build and E2E commands | Yes, live deployment health and rollback confirmation are manual |",
    "| Production Browser Smoke | Local Playwright smoke tests | Yes, real production browser smoke remains manual unless separately run against production |",
    "| Two-User Isolation Checks | Session/privacy contract checks | Yes, live two-user Supabase/browser verification remains manual |",
    "",
    "## Still Manual",
    "",
    ...manualChecks.map((check) => `- ${check}`),
    "",
    "## Notes",
    "",
    "- `docs/BETA_AUDIT_RESULTS.md` remains the human sign-off file. This script updates only script-owned automated blocks.",
    "- This script is read-only with respect to production data and does not require live Supabase or Vercel credentials.",
    "- If `BETA_BASE_URL` is set, its value is treated as sensitive and redacted in this report.",
    "",
  ];

  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`\nWrote safe beta audit report: ${reportPath}`);
}

function updateAuditResults({ results, hasFailures }) {
  const auditResultsPath = resolve(repoRoot, "docs/BETA_AUDIT_RESULTS.md");
  if (!existsSync(auditResultsPath)) return;

  let source = readFileSync(auditResultsPath, "utf8");
  source = upsertValidationBlock(source, buildValidationBlock(results));
  source = upsertIssuesBlock(source, buildIssuesBlock(results));
  source = upsertDecisionAutomationBlock(source, buildDecisionAutomationBlock(hasFailures));

  writeFileSync(auditResultsPath, source, "utf8");
  console.log("Updated script-owned automated blocks in docs/BETA_AUDIT_RESULTS.md");
}

function buildValidationBlock(results) {
  const rows = [
    "<!-- audit:auto:validation:start -->",
    "| Status | Check | Expected | Actual | Evidence/notes |",
    "| --- | --- | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.status} | \`${result.label}\` | ${result.expected} | ${validationActual(
          result.status
        )} | ${validationEvidence(result.status)} |`
    ),
    "<!-- audit:auto:validation:end -->",
  ];

  return rows.join("\n");
}

function buildIssuesBlock(results) {
  const failedResults = results.filter((result) => result.status !== "Pass");
  const rows = [
    "### Automated Gate Issues",
    "",
    "<!-- audit:auto:issues:start -->",
    "| ID | Severity | Area | Description | Steps to reproduce | Expected | Actual | Status | Fix/decision |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  if (failedResults.length === 0) {
    rows.push(
      "| N/A | N/A | Automated gates | No failed or blocked automated checks in latest run | `npm run audit:beta` | Automated gates pass | Automated gates passed | N/A | No automated action required |"
    );
  } else {
    failedResults.forEach((result, index) => {
      const id = `AUTO-${String(index + 1).padStart(3, "0")}`;
      rows.push(
        `| ${id} | High | Automated gate | \`${result.label}\` ${result.status.toLowerCase()} | \`npm run audit:beta\` | ${result.expected} | ${validationActual(
          result.status
        )} | ${result.status} | Review terminal output locally and rerun after fixing; do not paste private output into docs |`
      );
    });
  }

  rows.push("<!-- audit:auto:issues:end -->");
  return rows.join("\n");
}

function buildDecisionAutomationBlock(hasFailures) {
  const note = hasFailures
    ? "Automated gates failed or were blocked. Treat beta as No-go until the automated issues are resolved and the audit is rerun."
    : "Automated gates passed by `npm run audit:beta`. Manual Supabase/Vercel checks still require human sign-off.";

  return [
    "### Automated Gate Status",
    "",
    "<!-- audit:auto:decision:start -->",
    note,
    "<!-- audit:auto:decision:end -->",
  ].join("\n");
}

function upsertValidationBlock(source, block) {
  if (source.includes("<!-- audit:auto:validation:start -->")) {
    return replaceMarkedBlock(
      source,
      "<!-- audit:auto:validation:start -->",
      "<!-- audit:auto:validation:end -->",
      block
    );
  }

  return replaceSectionContent(source, "## 2. Automated Validation Results", "## 3.", `\n${block}\n`);
}

function upsertIssuesBlock(source, block) {
  if (source.includes("<!-- audit:auto:issues:start -->")) {
    return replaceMarkedBlock(
      source,
      "### Automated Gate Issues",
      "<!-- audit:auto:issues:end -->",
      block
    );
  }

  const severityLine = "Severity options: Low, Medium, High, Critical.";
  const index = source.indexOf(severityLine);
  if (index === -1) return `${source.trimEnd()}\n\n${block}\n`;

  const insertAt = index + severityLine.length;
  return `${source.slice(0, insertAt)}\n\n${block}${source.slice(insertAt)}`;
}

function upsertDecisionAutomationBlock(source, block) {
  if (source.includes("<!-- audit:auto:decision:start -->")) {
    return replaceMarkedBlock(
      source,
      "### Automated Gate Status",
      "<!-- audit:auto:decision:end -->",
      block
    );
  }

  const decisionChecklistHeading = "### Decision Checklist";
  const index = source.indexOf(decisionChecklistHeading);
  if (index === -1) return `${source.trimEnd()}\n\n${block}\n`;

  return `${source.slice(0, index)}${block}\n\n${source.slice(index)}`;
}

function replaceMarkedBlock(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start === -1) return source;

  const end = source.indexOf(endMarker, start);
  if (end === -1) return source;

  return `${source.slice(0, start)}${replacement}${source.slice(end + endMarker.length)}`;
}

function replaceSectionContent(source, sectionHeading, nextHeadingPrefix, replacement) {
  const sectionStart = source.indexOf(sectionHeading);
  if (sectionStart === -1) return `${source.trimEnd()}\n\n${sectionHeading}\n\n${replacement}\n`;

  const contentStart = sectionStart + sectionHeading.length;
  const nextHeading = source.indexOf(`\n${nextHeadingPrefix}`, contentStart);
  if (nextHeading === -1) {
    return `${source.slice(0, contentStart)}\n${replacement}`;
  }

  return `${source.slice(0, contentStart)}\n${replacement}${source.slice(nextHeading)}`;
}
