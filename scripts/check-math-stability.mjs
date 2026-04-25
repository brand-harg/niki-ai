import { readFileSync } from "node:fs";

const chatRoute = readFileSync("app/api/chat/route.ts", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
const mathFormatting = readFileSync("lib/mathFormatting.ts", "utf8");
const deterministicMath = readFileSync("lib/deterministicMath.ts", "utf8");
const ragHelpers = readFileSync("lib/ragHelpers.ts", "utf8");
const chatPrompts = readFileSync("lib/chatPrompts.ts", "utf8");

const fixtures = [
  {
    name: "frontend-preserves-latex-commands",
    pass:
      !/replace\(\/\\\\ln\/g,\s*"ln"\)/.test(mathFormatting) &&
      !/replace\(\/\\\\cdot\/g,\s*"·"\)/.test(mathFormatting) &&
      /displayBlocks/.test(mathFormatting) &&
      /sanitizeMathContent/.test(page),
  },
  {
    name: "frontend-wraps-raw-latex-lines",
    pass: /frac\|sqrt\|int\|sum\|lim/.test(mathFormatting) && /@@MATH_BLOCK_/.test(mathFormatting),
  },
  {
    name: "frontend-does-not-collapse-aligned-row-breaks",
    pass: !page.includes(".replace(/\\\\\\\\([a-zA-Z]+)/g"),
  },
  {
    name: "frontend-repairs-nested-display-fences",
    pass: /function collapseNestedDisplayMath/.test(mathFormatting) && /function repairLooseMathLines/.test(mathFormatting),
  },
  {
    name: "frontend-wraps-whole-latex-environments",
    pass: /function wrapBareLatexEnvironments/.test(mathFormatting) && /bmatrix/.test(mathFormatting),
  },
  {
    name: "backend-has-stable-math-postprocessor",
    pass: /normalizeModelMathOutput/.test(chatRoute) && /function normalizeModelMathOutput/.test(mathFormatting),
  },
  {
    name: "backend-repairs-nested-display-fences",
    pass:
      /function collapseNestedDisplayMath/.test(mathFormatting) &&
      /function repairLooseMathLines/.test(mathFormatting),
  },
  {
    name: "backend-wraps-whole-latex-environments",
    pass: /function wrapBareLatexEnvironments/.test(mathFormatting) && /bmatrix/.test(mathFormatting),
  },
  {
    name: "backend-protects-display-math-before-repair",
    pass: /@@MATH_BLOCK_/.test(mathFormatting) && /displayBlocks/.test(mathFormatting),
  },
  {
    name: "backend-buffers-qwen-math-for-repair",
    pass: /forceStructuredMath && !hasImage/.test(chatRoute) && /stream: false/.test(chatRoute),
  },
  {
    name: "backend-asks-for-missing-procedural-expression",
    pass:
      /incompleteProceduralMathRequest/.test(chatRoute) &&
      /missingExpressionReply/.test(chatRoute) &&
      /\\b\(limit\|lim\|approaches\)\\b/.test(deterministicMath) &&
      /limit expression and the value x approaches/.test(deterministicMath),
  },
  {
    name: "backend-contextual-math-followups-avoid-qwen-fallback",
    pass:
      /function extractBareMathFollowupExpression/.test(chatRoute) &&
      /function detectRecentMathIntentFromHistory/.test(chatRoute) &&
      /function ambiguousMathFollowupReply/.test(chatRoute) &&
      /function contextualLimitFollowupReply/.test(chatRoute) &&
      /function buildContextualMathMessage/.test(chatRoute) &&
      /bareMathFollowupExpression/.test(chatRoute) &&
      /recentMathIntent === "limit"/.test(chatRoute) &&
      chatRoute.includes("ln|log|sqrt|sin|cos|tan|sec|csc|cot") &&
      /buildDeterministicMathReply\(\{\s*message: contextualMathMessage/.test(chatRoute),
  },
  {
    name: "long-form-mode-lock-is-buffered",
    pass:
      /LONG-FORM MODE LOCK/.test(chatPrompts) &&
      /longFormNonDeterministic && !hasImage/.test(chatRoute),
  },
  {
    name: "long-form-buffered-output-is-sanitized",
    pass:
      /sanitizeMathContent\(normalizeBufferedModelOutput\(lectureSafeStableContent\)\)/.test(chatRoute) &&
      /function sanitizeMathContent/.test(mathFormatting),
  },
  {
    name: "power-series-lecture-has-deterministic-template",
    pass:
      /function buildPowerSeriesLectureReply/.test(deterministicMath) &&
      /Power Series and Radius of Convergence/.test(deterministicMath) &&
      /powerSeriesLectureReply/.test(deterministicMath) &&
      /Efficiency Tip/.test(deterministicMath) &&
      /Concept Check/.test(deterministicMath),
  },
  {
    name: "alternating-series-test-has-deterministic-template",
    pass:
      /function buildAlternatingSeriesTestReply/.test(deterministicMath) &&
      deterministicMath.includes("\\\\sum_{n=1}^{\\\\infty}(-1)^{n-1}b_n") &&
      deterministicMath.includes("\\\\lim_{n\\\\to\\\\infty}b_n=0") &&
      /Alternating Series Test/.test(deterministicMath) &&
      /alternatingSeriesTestReply/.test(deterministicMath),
  },
  {
    name: "deterministic-covers-core-symbolic-actions",
    pass:
      /"derivative" \| "integral" \| "limit" \| "factor" \| "expand" \| "simplify" \| "solve"/.test(deterministicMath) &&
      /factor\(\$\{normalized\}\)/.test(deterministicMath) &&
      /expand\(\$\{normalized\}\)/.test(deterministicMath) &&
      /solve\(/.test(deterministicMath),
  },
  {
    name: "procedural-math-requires-formula-display",
    pass: /FORMULA\/RULE REQUIREMENT/.test(chatPrompts) && /Formula used:/.test(chatPrompts),
  },
  {
    name: "natural-log-integral-uses-layered-by-parts-template",
    pass: /function buildNaturalLogIntegralReply/.test(deterministicMath) &&
      /Step 1: Choose u and dv/.test(deterministicMath) &&
      /\\begin\{aligned\}[\s\S]*u&=/.test(deterministicMath) &&
      /Choose u and dv:/.test(deterministicMath),
  },
  {
    name: "natural-log-integral-avoids-fragile-inline-latex",
    pass:
      !/`- \$u=/.test(deterministicMath) &&
      !/`- \$du=/.test(deterministicMath) &&
      !/Differentiating \$\$\{casResult\}/.test(deterministicMath),
  },
  {
    name: "linear-derivative-shows-all-core-rules",
    pass:
      /function derivativeFormulaForExpression/.test(deterministicMath) &&
      deterministicMath.includes("\\\\frac{d}{dx}\\\\left(c f(x)\\\\right)&=c f'(x)") &&
      deterministicMath.includes("\\\\frac{d}{dx}\\\\left(x^{n}\\\\right)&=n x^{n-1}") &&
      deterministicMath.includes("\\\\frac{d}{dx}(cx)&=c"),
  },
  {
    name: "removable-limit-has-deterministic-template",
    pass:
      /function buildDifferenceOfSquaresLimitReply/.test(deterministicMath) &&
      /a\^\{2\}-b\^\{2\}=\(a-b\)\(a\+b\)/.test(deterministicMath) &&
      /Cancel the common factor/.test(deterministicMath),
  },
  {
    name: "row-reduction-handles-variable-right-hand-sides",
    pass:
      /function buildRowReductionReply/.test(deterministicMath) &&
      deterministicMath.includes("compact.match(/x\\+y\\+z=([+-]?\\d+)/)") &&
      /row3FinalNumerator = b \+ 3 \* c - 5 \* a/.test(deterministicMath) &&
      /formatRationalLatex\(xNumerator, 7\)/.test(deterministicMath),
  },
  {
    name: "finite-summation-has-deterministic-template",
    pass:
      /function buildFiniteSummationReply/.test(deterministicMath) &&
      /\\sum_\{i=1\}\^\{n\} i\^\{2\}/.test(deterministicMath) &&
      /sumSquares = \(n \* \(n \+ 1\) \* \(2 \* n \+ 1\)\) \/ 6/.test(deterministicMath) &&
      /finiteSummationReply/.test(deterministicMath),
  },
  {
    name: "definite-sine-integral-has-deterministic-template",
    pass:
      /function buildDefiniteSineIntegralReply/.test(deterministicMath) &&
      deterministicMath.includes("\\\\int_a^b f(x)\\\\,dx=F(b)-F(a)") &&
      deterministicMath.includes("\\\\int \\\\sin(x)\\\\,dx=-\\\\cos(x)+C") &&
      /definiteSineIntegralReply/.test(deterministicMath),
  },
  {
    name: "partial-fraction-has-deterministic-template",
    pass:
      /function buildPartialFractionReply/.test(deterministicMath) &&
      /partial fraction\|decomposition/.test(deterministicMath) &&
      /Factor the denominator, set up unknown constants, then match coefficients/.test(deterministicMath) &&
      /partialFractionReply/.test(deterministicMath),
  },
  {
    name: "complex-division-has-deterministic-template",
    pass:
      /function buildComplexDivisionReply/.test(deterministicMath) &&
      /\(c\+di\)\(c-di\)=c\^2\+d\^2/.test(deterministicMath) &&
      /parseSignedNumber\(match\[2\], 1\)/.test(deterministicMath) &&
      /complexDivisionReply/.test(deterministicMath),
  },
  {
    name: "matrix-multiplication-has-deterministic-template",
    pass:
      /function buildMatrixMultiplicationReply/.test(deterministicMath) &&
      /function extractMatrixLiterals/.test(deterministicMath) &&
      /multiply matrices\|matrix product\|product\\s\+AB\|find\\s\+AB/.test(deterministicMath) &&
      /row\.reduce\(\(sum, value, rowIndex\) => sum \+ value \* b\[rowIndex\]\[columnIndex\]/.test(deterministicMath),
  },
  {
    name: "descriptive-statistics-use-population-template",
    pass:
      /function buildDescriptiveStatsReply/.test(deterministicMath) &&
      deterministicMath.includes("\\\\sigma^2&=\\\\frac{\\\\sum (x_i-\\\\mu)^2}{n}") &&
      /variance = squaredDeviations\.reduce\(\(sum, value\) => sum \+ value, 0\) \/ n/.test(deterministicMath) &&
      /standardDeviation = Math.sqrt\(variance\)/.test(deterministicMath),
  },
  {
    name: "determinant-equation-has-deterministic-template",
    pass:
      /function buildGenericDeterminantThenEquationReply/.test(deterministicMath) &&
      /rhsMatch/.test(deterministicMath) &&
      /const determinant = a \* d - b \* c/.test(deterministicMath) &&
      /finalValue = determinant === 0 \? null : formatRationalValueLatex/.test(deterministicMath),
  },
  {
    name: "recursive-substitution-has-deterministic-template",
    pass:
      /function buildRecursiveSubstitutionReply/.test(deterministicMath) &&
      /const simpleA = message.match/.test(deterministicMath) &&
      /const derivativeThenEvaluate = message.match/.test(deterministicMath) &&
      /const slopeThenPoint = message.match/.test(deterministicMath),
  },
  {
    name: "lecture-count-flow-exists",
    pass:
      /isLectureCountIntent/.test(chatRoute) &&
      /getLectureCourseCounts/.test(chatRoute) &&
      /supabaseAdmin[\s\S]*\.from\("lecture_sources"\)/.test(ragHelpers),
  },
  {
    name: "mode-separation-has-visible-structures",
    pass:
      /For longer answers, use this visible structure: \*\*Goal\*\*, \*\*Steps\*\*/.test(chatPrompts) &&
      /For longer answers, use this visible structure: \*\*Board Setup\*\*/.test(chatPrompts) &&
      /Lecture Source/.test(chatPrompts) &&
      /Concept Check/.test(chatPrompts),
  },
  {
    name: "two-by-two-system-has-deterministic-template",
    pass:
      /function buildTwoByTwoSystemReply/.test(deterministicMath) &&
      deterministicMath.includes("3x\\+4y=10") &&
      deterministicMath.includes("2x-y=3") &&
      deterministicMath.includes("\\\\begin{cases}") &&
      /twoByTwoSystemReply/.test(deterministicMath),
  },
  {
    name: "cylinder-volume-has-deterministic-template",
    pass:
      /function buildCylinderVolumeReply/.test(deterministicMath) &&
      /cylinder/i.test(deterministicMath) &&
      deterministicMath.includes("V=\\\\pi r^{2}h") &&
      /const coefficient = radius \* radius \* height/.test(deterministicMath) &&
      /cylinderVolumeReply/.test(deterministicMath),
  },
  {
    name: "polynomial-definite-integral-has-deterministic-template",
    pass:
      /function buildPolynomialDefiniteIntegralReply/.test(deterministicMath) &&
      /integratePolynomialTerms/.test(deterministicMath) &&
      deterministicMath.includes("\\\\int_a^b f(x)\\\\,dx=F(b)-F(a)") &&
      /polynomialDefiniteIntegralReply/.test(deterministicMath),
  },
  {
    name: "domain-radical-rational-has-deterministic-template",
    pass:
      /function buildDomainSqrtRationalReply/.test(deterministicMath) &&
      deterministicMath.includes("sqrt\\(x-3\\)\\/\\(x\\^2-9\\)") &&
      deterministicMath.includes("x-3\\\\ge 0") &&
      deterministicMath.includes("x^{2}-9\\\\ne 0") &&
      /domainSqrtRationalReply/.test(deterministicMath),
  },
  {
    name: "vertex-intercepts-has-deterministic-template",
    pass:
      /function buildVertexInterceptsReply/.test(deterministicMath) &&
      deterministicMath.includes("h=-\\\\frac{b}{2a}") &&
      /rootsLatex/.test(deterministicMath) &&
      /vertexInterceptsReply/.test(deterministicMath),
  },
  {
    name: "scientific-notation-has-deterministic-template",
    pass:
      /function buildScientificNotationReply/.test(deterministicMath) &&
      /value = coefficient \* Math\.pow\(10, exponent\)/.test(deterministicMath) &&
      deterministicMath.includes("a\\\\times 10^{n}") &&
      /scientificNotationReply/.test(deterministicMath),
  },
  {
    name: "taylor-exp-has-deterministic-template",
    pass:
      /function buildTaylorExpReply/.test(deterministicMath) &&
      deterministicMath.includes("P_n(x)=\\\\sum_{k=0}^{n}") &&
      deterministicMath.includes("1+x+\\\\frac{x^2}{2}+\\\\frac{x^3}{6}") &&
      /taylorExpReply/.test(deterministicMath),
  },
  {
    name: "arcsin-derivative-has-deterministic-template",
    pass:
      /function buildArcsinDerivativeReply/.test(deterministicMath) &&
      deterministicMath.includes("\\\\frac{d}{dx}\\\\arcsin(x)=\\\\frac{1}{\\\\sqrt{1-x^2}}") &&
      /arcsinDerivativeReply/.test(deterministicMath),
  },
  {
    name: "tangent-line-has-deterministic-template",
    pass:
      /function buildTangentLineReply/.test(deterministicMath) &&
      deterministicMath.includes("y-y_1=m(x-x_1)") &&
      /tangentline/.test(deterministicMath) &&
      /tangentLineReply/.test(deterministicMath),
  },
  {
    name: "critical-points-has-deterministic-template",
    pass:
      /function buildCriticalPointsReply/.test(deterministicMath) &&
      deterministicMath.includes("f'(x)=0") &&
      /critical points?/.test(deterministicMath) &&
      /criticalPointsReply/.test(deterministicMath),
  },
  {
    name: "inverse-two-by-two-has-deterministic-template",
    pass:
      /function buildInverse2x2Reply/.test(deterministicMath) &&
      /function inverse2/.test(deterministicMath) &&
      deterministicMath.includes("=\\\\frac{1}{ad-bc}\\\\begin{bmatrix}d&-b\\\\\\\\-c&a\\\\end{bmatrix}") &&
      /inverse2x2Reply/.test(deterministicMath),
  },
  {
    name: "separable-xy-ode-has-deterministic-template",
    pass:
      /function buildSeparableXyReply/.test(deterministicMath) &&
      deterministicMath.includes("\\\\frac{1}{y}\\\\,dy=x\\\\,dx") &&
      deterministicMath.includes("y=Ce^{x^2/2}") &&
      /separableXyReply/.test(deterministicMath),
  },
  {
    name: "geometric-recurrence-has-deterministic-template",
    pass:
      /function buildGeometricRecurrenceReply/.test(deterministicMath) &&
      deterministicMath.includes("a_n=a_0r^n") &&
      /recurrence/i.test(deterministicMath) &&
      /geometricRecurrenceReply/.test(deterministicMath),
  },
];

let failed = false;
for (const fixture of fixtures) {
  if (fixture.pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
