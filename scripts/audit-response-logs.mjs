import fs from "node:fs";

const FAILURE_TAXONOMY = {
  SAN: "Sanitizer Leak",
  DISC: "Discrepancy",
  RAG: "RAG Route",
  UI: "UI Breaking",
  LOGIC: "Math/Answer Logic",
  REQ: "Request Failure",
  UNK: "Uncategorized",
};

const UI_BREAK_PATTERNS = {
  boxed: /\\boxed\s*\{/,
  bracket_display: /\\\[|\\\]/,
  paren_inline: /\\\(|\\\)/,
  single_dollar_line: /^\s*\$(?!\$)\s*$/m,
  raw_latex_outside_display:
    /\\(?:frac|sqrt|int|sum|lim|prod|begin|end|left|right|cdot|times|text|operatorname|ln|log|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|pi|theta|alpha|beta|gamma|delta|lambda|mu|sigma|infty|to|leq|geq|neq|le|ge|pm|nabla|partial|vec|bar|hat|overline|underline)\b/,
  invalid_backslash_number: /(?<!\\)\\[0-9]/,
};

const NEMANJA_MARKERS = [
  "kalk",
  "so",
  "now",
  "remember",
  "board",
  "what do we",
  "there we go",
  "that's it",
  "keep in mind",
  "does that make sense",
];

function codeForFailure(failure) {
  const text = String(failure).toLowerCase();
  if (
    [
      "prose inside display math",
      "raw latex outside",
      "raw_latex_outside",
      "raw latex command",
      "broken step",
      "placeholder",
    ].some((token) => text.includes(token))
  ) {
    return "SAN";
  }
  if (
    [
      "boxed",
      "bracket",
      "paren",
      "single_dollar",
      "unsupported",
      "unbalanced",
      "empty_display",
      "invalid_backslash",
    ].some((token) => text.includes(token))
  ) {
    return "UI";
  }
  if (["mismatch", "final answer", "logic"].some((token) => text.includes(token))) {
    return "DISC";
  }
  if (["rag", "grounding", "lecture"].some((token) => text.includes(token))) {
    return "RAG";
  }
  return "UNK";
}

function stripDisplayMath(text) {
  return String(text).replace(/\$\$[\s\S]*?\$\$/g, "");
}

function finalAnswer(text) {
  const match = String(text).match(/(?:##\s*)?Final Answer\s*:?\s*([\s\S]*)/i);
  if (!match) return "";

  let answer = match[1];
  const mathBlocks = [...answer.matchAll(/\$\$([\s\S]*?)\$\$/g)].map((item) => item[1]);
  if (mathBlocks.length) {
    answer = mathBlocks.at(-1) ?? "";
  } else {
    const firstParagraph = answer.split(/\n\s*\n/, 1)[0] ?? "";
    const trailingValue = firstParagraph.match(
      /(?:is|equals|gives|result\s+is)\s*:?\s*(-?\d+(?:\.\d+)?)\s*\.?\s*$/i,
    );
    const equation = firstParagraph.match(
      /(?:[a-z]\s*=\s*)?(?:[a-z]\s*)?[a-z]\s*[+\-]\s*\d+(?:\.\d+)?/i,
    );
    const numbers = [...firstParagraph.matchAll(/-?\d+(?:\.\d+)?/g)].map((item) => item[0]);

    if (trailingValue) answer = trailingValue[1];
    else if (equation) answer = equation[0];
    else if (numbers.length && firstParagraph.length > 30) answer = numbers.at(-1) ?? "";
    else answer = firstParagraph;
  }

  return answer.replace(/\$\$/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function normalizeAnswer(answer) {
  let normalized = String(answer).toLowerCase();
  normalized = normalized
    .replaceAll("\\left", "")
    .replaceAll("\\right", "")
    .replaceAll("\\,", "")
    .replace(/\s+/g, "")
    .replace(/[{}]/g, "")
    .replaceAll("\\quad", "");

  const matrixMatch = normalized.match(/(?:[a-z]{1,3}=)?(\\beginbmatrix[\s\S]*?\\endbmatrix)/);
  if (matrixMatch) return matrixMatch[1];

  const yEquation = normalized.match(/y=x[+-]\d+(?:\.\d+)?/);
  if (yEquation) return yEquation[0];

  normalized = normalized.replaceAll("f'(x)=", "").replaceAll("y=", "");

  const orderedTriple = normalized.match(
    /(?:x=)?(-?\d+(?:\.\d+)?),?(?:y=)?(-?\d+(?:\.\d+)?),?(?:z=)?(-?\d+(?:\.\d+)?)/,
  );
  if (orderedTriple && (normalized.includes("x=") || normalized.includes("(x,y,z)"))) {
    return orderedTriple.slice(1, 4).join(",");
  }

  if (normalized.includes("mean") && (normalized.includes("variance") || normalized.includes("standarddeviation"))) {
    return [...normalized.matchAll(/-?\d+(?:\.\d+)?/g)].map((item) => item[0]).join(",");
  }

  if (normalized.includes("z-score") || normalized.startsWith("z=")) {
    const decimals = [...normalized.matchAll(/-?\d+\.\d+/g)].map((item) => item[0]);
    if (decimals.length) return decimals.at(-1) ?? "";
    const rhs = normalized.match(/z=(-?\d+(?:\.\d+)?)/);
    if (rhs) return rhs[1];
  }

  if (normalized.includes("sum") || normalized.includes("\\sum")) {
    const numbers = [...normalized.matchAll(/-?\d+(?:\.\d+)?/g)].map((item) => item[0]);
    if (numbers.length) return numbers.at(-1) ?? "";
  }

  const valuePhrase = normalized.match(/(?:value|price|finalprice|equals|is)(?:[^-0-9]*)(-?\d+(?:\.\d+)?)\.?$/);
  if (valuePhrase) return valuePhrase[1];

  const latexFractionRhs = normalized.match(/=(\\frac-?\d+(?:\.\d+)?-?\d+(?:\.\d+)?)\.?$/);
  if (latexFractionRhs && [...normalized.matchAll(/=/g)].length === 1) return latexFractionRhs[1];

  const simpleRhs = normalized.match(/=(-?\d+(?:\.\d+)?)\.?$/);
  if (simpleRhs && [...normalized.matchAll(/=/g)].length === 1) return simpleRhs[1];

  return normalized;
}

function uiBreaks(text) {
  const output = String(text);
  const outside = stripDisplayMath(output);
  const failures = [];

  for (const [name, pattern] of Object.entries(UI_BREAK_PATTERNS)) {
    const target = name === "raw_latex_outside_display" ? outside : output;
    if (pattern.test(target)) failures.push(name);
  }

  if ((output.match(/\$\$/g) ?? []).length % 2) failures.push("unbalanced_display_fences");
  for (const match of output.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
    if (!match[1].trim()) failures.push("empty_display_block");
  }

  return failures;
}

function addFailure(codeCounter, detailCounter, examples, code, detail, entry) {
  codeCounter[code] = (codeCounter[code] ?? 0) + 1;
  detailCounter[code] ??= {};
  detailCounter[code][detail] = (detailCounter[code][detail] ?? 0) + 1;
  examples[code] ??= [];
  if (examples[code].length < 8) {
    examples[code].push({
      id: entry.id,
      mode: entry.mode,
      category: entry.category,
      prompt: entry.prompt,
      detail,
    });
  }
}

function personaDensity(text) {
  const lower = String(text).toLowerCase();
  return NEMANJA_MARKERS.reduce((count, marker) => {
    return count + lower.split(marker).length - 1;
  }, 0);
}

function groundingHits(entry) {
  const expected = entry.expectedGroundingKeywords ?? [];
  if (!expected.length) return 0;
  const lower = String(entry.output ?? "").toLowerCase();
  return expected.filter((keyword) => lower.includes(String(keyword).toLowerCase())).length;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--json");
  const targetPath = args[0] ?? "scripts/response_logs.json";
  const entries = JSON.parse(fs.readFileSync(targetPath, "utf8"));

  const uiCounter = {};
  const failureCounter = {};
  const failureDetails = {};
  const failureExamples = {};
  const personaScores = {};
  const groundingMissing = [];
  const grouped = new Map();
  const categoriesByKey = new Map();
  const perEntryFailures = [];

  for (const entry of entries) {
    const output = entry.output ?? "";
    const entryFailures = new Set();

    const uiFailures = uiBreaks(output);
    for (const failure of uiFailures) {
      uiCounter[failure] = (uiCounter[failure] ?? 0) + 1;
      const code = codeForFailure(failure);
      entryFailures.add(`${code}:${failure}`);
      addFailure(failureCounter, failureDetails, failureExamples, code, failure, entry);
    }

    for (const failure of entry.failures ?? []) {
      const code = codeForFailure(failure);
      entryFailures.add(`${code}:${failure}`);
      addFailure(failureCounter, failureDetails, failureExamples, code, failure, entry);
    }

    const mode = entry.mode ?? "unknown";
    personaScores[mode] ??= [];
    personaScores[mode].push(personaDensity(output));

    if ((entry.expectedGroundingKeywords ?? []).length && groundingHits(entry) === 0) {
      groundingMissing.push(entry.id ?? entry.prompt);
      entryFailures.add("RAG:missing expected grounding keyword");
      addFailure(failureCounter, failureDetails, failureExamples, "RAG", "missing expected grounding keyword", entry);
    }

    perEntryFailures.push({
      id: entry.id,
      mode,
      category: entry.category,
      prompt: entry.prompt,
      failures: [...entryFailures],
    });

    const key = JSON.stringify([entry.pass, entry.prompt]);
    const modes = grouped.get(key) ?? {};
    modes[mode] = normalizeAnswer(finalAnswer(output));
    grouped.set(key, modes);
    categoriesByKey.set(key, entry.category ?? "uncategorized");
  }

  const mismatches = [];
  const byCategory = {};
  const categoryTotals = {};

  for (const [key, modes] of grouped.entries()) {
    const pure = modes.pure;
    if (!pure) continue;

    for (const [mode, answer] of Object.entries(modes)) {
      if (mode === "pure" || !answer) continue;
      const category = categoriesByKey.get(key) ?? "uncategorized";
      categoryTotals[category] = (categoryTotals[category] ?? 0) + 1;
      if (answer !== pure) {
        mismatches.push({ key: JSON.parse(key), mode, pure, other: answer, category });
        byCategory[category] = (byCategory[category] ?? 0) + 1;
        addFailure(
          failureCounter,
          failureDetails,
          failureExamples,
          "DISC",
          "Nemanja/Pure Logic final answer mismatch",
          { mode, category, prompt: JSON.parse(key)[1] },
        );
      }
    }
  }

  const mismatchDenominator = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0) || 1;
  const personaSummary = {};
  for (const [mode, scores] of Object.entries(personaScores)) {
    personaSummary[mode] = {
      count: scores.length,
      average: Number(average(scores).toFixed(3)),
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
    };
  }

  const failuresByCode = {};
  for (const code of Object.keys(FAILURE_TAXONOMY)) {
    if (!failureCounter[code]) continue;
    failuresByCode[code] = {
      label: FAILURE_TAXONOMY[code],
      count: failureCounter[code],
      details: failureDetails[code] ?? {},
      examples: failureExamples[code] ?? [],
    };
  }

  const requiresTargetedExpansion = Object.entries(categoryTotals)
    .filter(([category, total]) => total && ((byCategory[category] ?? 0) / total) > 0.03)
    .map(([category]) => category);

  let currentCleanStreak = 0;
  for (let index = perEntryFailures.length - 1; index >= 0; index--) {
    if (perEntryFailures[index].failures.length) break;
    currentCleanStreak++;
  }

  const saturationWindowSize = Math.min(250, perEntryFailures.length);
  const lastWindowFailures = perEntryFailures.slice(-saturationWindowSize).flatMap((entry) => entry.failures);
  const uniqueFailurePatternsLastWindow = [...new Set(lastWindowFailures)].sort();

  const summary = {
    entries: entries.length,
    ui_breaks: uiCounter,
    failure_taxonomy: FAILURE_TAXONOMY,
    failures_by_code: failuresByCode,
    mismatch_count: mismatches.length,
    mismatch_rate_percent: Number(((mismatches.length / mismatchDenominator) * 100).toFixed(3)),
    mismatch_by_category: byCategory,
    persona_density: personaSummary,
    grounding_missing_count: groundingMissing.length,
    grounding_missing_examples: groundingMissing.slice(0, 20),
    current_clean_streak_entries: currentCleanStreak,
    saturation_window_size: saturationWindowSize,
    unique_failure_patterns_last_window: uniqueFailurePatternsLastWindow,
    requires_targeted_expansion: requiresTargetedExpansion,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (Object.keys(failuresByCode).length) {
    console.log(
      `\nAudit failures detected: ${Object.entries(failuresByCode)
        .map(([code, info]) => `${code}=${info.count}`)
        .join(", ")}`,
    );
    process.exitCode = 1;
  }
  if (requiresTargetedExpansion.length) {
    console.log(`\nTargeted expansion needed for: ${requiresTargetedExpansion.join(", ")}`);
    process.exitCode = 1;
  }
}

main();
