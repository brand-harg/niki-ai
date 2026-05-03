import { readFileSync } from "node:fs";

const pageSource = readFileSync("app/page.tsx", "utf8");
const gitignoreSource = readFileSync(".gitignore", "utf8");
const eslintConfigSource = readFileSync("eslint.config.mjs", "utf8");
const performanceChecklistSource = readFileSync("docs/PERFORMANCE_CHECKLIST.md", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const PAGE_LINE_BUDGET = 2600;
const pageLineCount = pageSource.split(/\r?\n/).length;

function hasAll(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
}

const checks = [
  {
    name: `app/page.tsx stays under ${PAGE_LINE_BUDGET} lines`,
    pass: pageLineCount <= PAGE_LINE_BUDGET,
    detail: `${pageLineCount} lines`,
  },
  {
    name: "html2canvas stays lazy-loaded for screenshot capture",
    pass:
      !/import\s+html2canvas\s+from\s+["']html2canvas["']/.test(pageSource) &&
      pageSource.includes("await import(\"html2canvas\")") &&
      pageSource.includes("captureElementCanvas"),
  },
  {
    name: "server-only heavy dependencies are not imported into app/page.tsx",
    pass: !/from\s+["'](?:openai|nerdamer|fs|node:fs|@\/lib\/supabaseAdmin)["']/.test(pageSource),
  },
  {
    name: "Playwright output folders are ignored by Git and ESLint",
    pass:
      hasAll(gitignoreSource, ["/test-results/", "/playwright-report/"]) &&
      hasAll(eslintConfigSource, ["test-results/**", "playwright-report/**"]),
  },
  {
    name: "package exposes deterministic performance check and build script",
    pass:
      packageJson.scripts?.["test:performance"] === "node scripts/check-performance-budget.mjs" &&
      packageJson.scripts?.build === "next build",
  },
  {
    name: "performance checklist covers manual Lighthouse and mobile checks",
    pass: hasAll(performanceChecklistSource, [
      "Manual Lighthouse Checks",
      "Mobile Responsiveness",
      "npm run build",
      "Artifact workspace open",
      "Knowledge Base panel open",
    ]),
  },
];

let failed = false;
for (const check of checks) {
  if (check.pass) {
    console.log(`✅ ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  } else {
    failed = true;
    console.error(`❌ ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("✅ performance-budget");
}
