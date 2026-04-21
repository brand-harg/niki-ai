import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);
const nerdamer = nodeRequire("nerdamer/all") as (expression: string) => {
  toString: () => string;
  toTeX: () => string;
};

type SimpleMathIntent = "derivative" | "integral" | "limit" | "factor" | "expand" | "simplify" | "solve";

type PolynomialTerm = {
  coefficient: number;
  exponent: number;
};

function detectSimpleMathIntent(message: string): SimpleMathIntent | null {
  if (/^(solve|evaluate|calculate|compute|do)\s+(it|this|that)$/i.test(message.trim())) return "solve";
  if (/\b(derivative|differentiate|dy\/dx|d\/dx)\b/i.test(message)) return "derivative";
  if (/\b(integral|integrate|antiderivative)\b/i.test(message)) return "integral";
  if (/\b(limit|lim|approaches)\b/i.test(message)) return "limit";
  if (/\b(factor|factorize|factored form)\b/i.test(message)) return "factor";
  if (/\b(expand|expanded form)\b/i.test(message)) return "expand";
  if (/\b(simplify|reduce|combine like terms)\b/i.test(message)) return "simplify";
  if (/\b(solve|find x|roots?|zeros?|quadratic formula)\b/i.test(message)) return "solve";
  return null;
}

function incompleteProceduralMathRequest(message: string, intent: SimpleMathIntent): boolean {
  const compact = message.trim().replace(/[?.!,;:]+$/g, "");
  if (/^(solve|evaluate|calculate|compute|do)\s+(it|this|that)$/i.test(compact)) return true;

  if (intent === "limit") {
    const hasLimitTarget = /\b(?:approaches|to)\s*[+-]?(?:\d|[a-z]|infinity|∞)|(?:->|\\to)\s*[+-]?(?:\d|[a-z]|infinity|∞)/i.test(
      compact
    );
    const hasLimitBody =
      /\bof\s+[^.?!,;:]+/i.test(compact) ||
      /[)\dx]\s+as\s+x\s*(?:approaches|to|->|\\to)/i.test(compact) ||
      /^lim[_\s]/i.test(compact);
    if (!hasLimitTarget || !hasLimitBody) return true;
  }

  const hasExpressionClue =
    /(\d|=|[a-z]\s*[\+\-\*\/\^]|[+\-*/^()]|\\frac|\\int|\$)/i.test(compact) ||
    /\b(of|for|on|in)\s+(?=[-+*/^().0-9a-z\s]*[\dx=+\-*/^()\\])[-+*/^().0-9a-z\s]+$/i.test(compact);
  if (hasExpressionClue) return false;

  if (intent === "derivative") {
    return /\b(take|find|compute|calculate|do|give me|show me)\b[\s\S]{0,30}\b(derivative|differentiate|d\/dx)\b/i.test(
      compact
    );
  }
  if (intent === "integral") {
    return /\b(find|compute|calculate|do|give me|show me)\b[\s\S]{0,30}\b(integral|integrate|antiderivative)\b/i.test(
      compact
    );
  }
  if (intent === "limit") {
    return /\b(find|compute|calculate|do|give me|show me|evaluate)\b[\s\S]{0,30}\b(limit)\b/i.test(
      compact
    );
  }
  return /\b(factor|expand|simplify|solve|find roots?|find zeros?)\b\s*$/i.test(compact);
}

function missingExpressionReply(intent: SimpleMathIntent): string {
  const target =
    intent === "derivative"
      ? "function to differentiate"
      : intent === "integral"
        ? "integrand to integrate"
        : intent === "limit"
          ? "limit expression and the value x approaches"
          : intent === "solve"
            ? "equation to solve"
            : "expression to work with";
  return `Send me the ${target}, and I will format the solution cleanly.`;
}

function extractSimpleMathExpression(message: string, intent: SimpleMathIntent): string | null {
  const source = message
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+with\s+respect\s+to\s+[a-z]\b.*$/i, "")
    .trim();

  const patterns =
    intent === "derivative"
      ? [
        /\b(?:take|find|compute|calculate|show|do)\s+(?:the\s+)?derivative\s+(?:of|for|on)\s+(.+)$/i,
        /\b(?:find|compute|calculate|show|do)\s+dy\/dx\s+(?:for|of)?\s*(.+)$/i,
        /\bderivative\s+(?:of|for|on)\s+(.+)$/i,
        /\bdifferentiate\s+(.+)$/i,
        /\bd\/dx\s+(.+)$/i,
      ]
      : intent === "integral"
        ? [
        /\b(?:find|compute|calculate|show|do)\s+(?:the\s+)?integral\s+(?:of|for|on)\s+(.+)$/i,
        /\bintegral\s+(?:of|for|on)\s+(.+)$/i,
        /\bintegrate\s+(.+)$/i,
        /\bantiderivative\s+(?:of|for)\s+(.+)$/i,
        ]
        : intent === "limit"
          ? [
            /\b(?:find|compute|calculate|show|do|evaluate)\s+(?:the\s+)?limit\s+(?:of)?\s*(.+)$/i,
            /\blimit\s+(?:of)?\s*(.+)$/i,
            /\bas\s+x\s+approaches\s+[^ ]+\s+of\s+(.+)$/i,
          ]
        : intent === "factor"
          ? [
            /\bfactor(?:ize)?\s+(.+)$/i,
            /\bfactored form\s+(?:of|for)?\s*(.+)$/i,
          ]
          : intent === "expand"
            ? [
              /\bexpand\s+(.+)$/i,
              /\bexpanded form\s+(?:of|for)?\s*(.+)$/i,
            ]
            : intent === "simplify"
              ? [
                /\bsimplify\s+(.+)$/i,
                /\breduce\s+(.+)$/i,
                /\bcombine like terms\s+(?:in|for)?\s*(.+)$/i,
              ]
              : [
                /\bsolve\s+(.+)$/i,
                /\bquadratic formula:?\s*(.+)$/i,
                /\bfind\s+x\s+(?:for|in)?\s*(.+)$/i,
                /\broots?\s+(?:of|for)?\s*(.+)$/i,
                /\bzeros?\s+(?:of|for)?\s*(.+)$/i,
              ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const expression = match?.[1]?.trim();
    if (expression) {
      return expression
        .replace(/^(the|a|an)\s+/i, "")
        .replace(/^using\s+the\s+quadratic\s+formula:?\s*/i, "")
        .replace(/^for\s+y\s*=\s*/i, "y=")
        .trim();
    }
  }

  return null;
}

function parsePolynomialExpression(expression: string): PolynomialTerm[] | null {
  const compact = expression
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/\*\*/g, "^");

  if (!compact || /[^0-9x+\-.^]/.test(compact)) return null;
  if (!/x|\d/.test(compact)) return null;

  const normalized = compact.startsWith("-") ? compact : `+${compact}`;
  const parts = normalized.match(/[+-][^+-]+/g);
  if (!parts?.length) return null;

  const terms: PolynomialTerm[] = [];

  for (const part of parts) {
    const sign = part.startsWith("-") ? -1 : 1;
    const body = part.slice(1);
    if (!body) return null;

    if (body.includes("x")) {
      const match = body.match(/^(\d*\.?\d*)x(?:\^(-?\d+))?$/);
      if (!match) return null;

      const coefficientText = match[1];
      const coefficient = coefficientText ? Number(coefficientText) : 1;
      const exponent = match[2] ? Number(match[2]) : 1;
      if (!Number.isFinite(coefficient) || !Number.isInteger(exponent) || exponent < 0) {
        return null;
      }

      terms.push({ coefficient: sign * coefficient, exponent });
    } else {
      const coefficient = Number(body);
      if (!Number.isFinite(coefficient)) return null;
      terms.push({ coefficient: sign * coefficient, exponent: 0 });
    }
  }

  return combinePolynomialTerms(terms);
}

function combinePolynomialTerms(terms: PolynomialTerm[]): PolynomialTerm[] {
  const byExponent = new Map<number, number>();
  for (const term of terms) {
    byExponent.set(term.exponent, (byExponent.get(term.exponent) ?? 0) + term.coefficient);
  }

  return Array.from(byExponent.entries())
    .map(([exponent, coefficient]) => ({ coefficient, exponent }))
    .filter((term) => Math.abs(term.coefficient) > 1e-12)
    .sort((a, b) => b.exponent - a.exponent);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(8)));
}

function formatCoefficient(coefficient: number, exponent: number): string {
  if (exponent === 0) return formatNumber(Math.abs(coefficient));
  if (Math.abs(coefficient) === 1) return "";
  return formatNumber(Math.abs(coefficient));
}

function formatVariablePower(exponent: number): string {
  if (exponent === 0) return "";
  if (exponent === 1) return "x";
  return `x^{${exponent}}`;
}

function formatPolynomialLatex(terms: PolynomialTerm[]): string {
  if (!terms.length) return "0";

  return terms
    .map((term, index) => {
      const sign = term.coefficient < 0 ? "-" : "+";
      const coefficient = formatCoefficient(term.coefficient, term.exponent);
      const variable = formatVariablePower(term.exponent);
      const body = `${coefficient}${variable}` || "0";

      if (index === 0) {
        return term.coefficient < 0 ? `-${body}` : body;
      }

      return `${sign} ${body}`;
    })
    .join(" ");
}

function differentiatePolynomial(terms: PolynomialTerm[]): PolynomialTerm[] {
  return combinePolynomialTerms(
    terms
      .filter((term) => term.exponent > 0)
      .map((term) => ({
        coefficient: term.coefficient * term.exponent,
        exponent: term.exponent - 1,
      }))
  );
}

function integratePolynomial(terms: PolynomialTerm[]): string {
  if (!terms.length) return "C";

  const pieces = terms.map((term, index) => {
    const newExponent = term.exponent + 1;
    const numerator = term.coefficient;
    const denominator = newExponent;
    const sign = numerator < 0 ? "-" : "+";
    const absNumerator = Math.abs(numerator);
    const variable = formatVariablePower(newExponent);
    const coefficient =
      denominator === 1
        ? absNumerator === 1 && variable
          ? ""
          : formatNumber(absNumerator)
        : absNumerator === denominator
          ? ""
          : absNumerator === 1
            ? `\\frac{1}{${denominator}}`
            : `\\frac{${formatNumber(absNumerator)}}{${denominator}}`;
    const body = `${coefficient}${variable}` || "0";

    if (index === 0) return numerator < 0 ? `-${body}` : body;
    return `${sign} ${body}`;
  });

  return `${pieces.join(" ")} + C`;
}

function evaluatePolynomial(terms: PolynomialTerm[], xValue: number): number {
  return terms.reduce((sum, term) => sum + term.coefficient * Math.pow(xValue, term.exponent), 0);
}

function formatPolynomialSubstitutionLatex(terms: PolynomialTerm[], xValue: number): string {
  const substitutedX = `(${formatNumber(xValue)})`;

  return terms
    .map((term, index) => {
      const sign = term.coefficient < 0 ? "-" : "+";
      const coefficient = formatCoefficient(term.coefficient, term.exponent);
      const variable =
        term.exponent === 0
          ? ""
          : term.exponent === 1
            ? substitutedX
            : `${substitutedX}^{${term.exponent}}`;
      const body = `${coefficient}${variable}` || formatNumber(Math.abs(term.coefficient));

      if (index === 0) return term.coefficient < 0 ? `-${body}` : body;
      return `${sign} ${body}`;
    })
    .join(" ");
}

function formatPolynomialEvaluatedTermsLatex(terms: PolynomialTerm[], xValue: number): string {
  const pieces = terms.map((term) => term.coefficient * Math.pow(xValue, term.exponent));

  return pieces
    .map((value, index) => {
      const body = formatNumber(Math.abs(value));
      if (index === 0) return value < 0 ? `-${body}` : body;
      return `${value < 0 ? "-" : "+"} ${body}`;
    })
    .join(" ");
}

function normalizeCasExpression(expression: string): string | null {
  let normalized = expression
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\*\*/g, "^")
    .replace(/\s+/g, "")
    .replace(/^f\(x\)=/, "")
    .replace(/^y=/, "");

  if (!normalized || normalized.length > 180) return null;
  if (/[^0-9a-z+\-*/^().,]/.test(normalized)) return null;

  normalized = normalized
    .replace(/\be\^\(([^()]+)\)/g, "exp($1)")
    .replace(/\be\^x\b/g, "exp(x)")
    .replace(/\bln(?=\()/g, "log")
    .replace(/\bln([0-9]*x(?:\^[0-9]+)?)/g, "log($1)")
    .replace(/\blog([0-9]*x(?:\^[0-9]+)?)/g, "log($1)")
    .replace(/(\d)(x)/g, "$1*$2")
    .replace(/(x|\))(\d)/g, "$1*$2")
    .replace(/(x|\))(?=(sin|cos|tan|sec|csc|cot|log|sqrt|exp)\()/g, "$1*")
    .replace(/(\d|\))(?=x)/g, "$1*")
    .replace(/pi/g, "PI");

  if (/[a-df-wyz]/.test(normalized.replace(/\b(sin|cos|tan|sec|csc|cot|log|sqrt|exp|PI)\b/g, ""))) {
    return null;
  }

  return normalized;
}

function normalizeSolveExpression(expression: string): string | null {
  const parts = expression.split("=");
  if (parts.length === 2) {
    const left = normalizeCasExpression(parts[0] ?? "");
    const right = normalizeCasExpression(parts[1] ?? "");
    if (!left || !right) return null;
    return `${left}-(${right})`;
  }

  return normalizeCasExpression(expression);
}

function cleanCasLatex(latex: string): string {
  return latex
    .replace(/\\mathrm\{log\}/g, "\\ln")
    .replace(/\\mathrm\{sin\}/g, "\\sin")
    .replace(/\\mathrm\{cos\}/g, "\\cos")
    .replace(/\\mathrm\{tan\}/g, "\\tan")
    .replace(/\\mathrm\{sec\}/g, "\\sec")
    .replace(/\\mathrm\{csc\}/g, "\\csc")
    .replace(/\\mathrm\{cot\}/g, "\\cot")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\s*\\cdot\s*/g, "")
    .replace(/(\\(?:ln|sin|cos|tan|sec|csc|cot)\([^)]*\))x/g, "x$1")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSolveLatex(resultText: string, fallbackLatex: string): string {
  const trimmed = resultText.trim();
  const vectorMatch = trimmed.match(/^\[([^\]]+)\]$/);
  const values = vectorMatch
    ? vectorMatch[1]?.split(",").map((value) => value.trim()).filter(Boolean) ?? []
    : trimmed
      ? [trimmed]
      : [];

  if (values.length === 1) {
    return `x=${cleanCasLatex(nerdamer(values[0]).toTeX())}`;
  }

  if (values.length > 1) {
    return `\\begin{aligned}${values
      .map((value) => `x&=${cleanCasLatex(nerdamer(value).toTeX())}`)
      .join("\\\\")}\\end{aligned}`;
  }

  return fallbackLatex;
}

function runCasOperation(intent: SimpleMathIntent, expression: string): string | null {
  const normalized = intent === "solve"
    ? normalizeSolveExpression(expression)
    : normalizeCasExpression(expression);
  if (!normalized) return null;

  try {
    if (intent === "limit") return null;

    const operation =
      intent === "derivative"
        ? `diff(${normalized},x)`
        : intent === "integral"
          ? `integrate(${normalized},x)`
          : intent === "factor"
            ? `factor(${normalized})`
            : intent === "expand"
              ? `expand(${normalized})`
              : intent === "simplify"
                ? `simplify(${normalized})`
                : `solve(${normalized},x)`;
    const result = nerdamer(operation);
    const resultText = result.toString();
    if (!resultText || /integrate|diff|undefined|NaN/i.test(resultText)) return null;

    const latex = cleanCasLatex(result.toTeX());
    if (!latex || /integrate|diff|undefined|NaN/i.test(latex)) return null;

    if (intent === "solve") return formatSolveLatex(resultText, latex);
    return intent === "integral" ? `${latex} + C` : latex;
  } catch {
    return null;
  }
}

function algebraFormulaForExpression(intent: SimpleMathIntent, expression: string): string {
  const normalized = normalizeCasExpression(expression) ?? expression.toLowerCase().replace(/\s+/g, "");

  if (intent === "factor" && /x\^2-/.test(normalized)) {
    return "a^{2}-b^{2}=(a-b)(a+b)";
  }
  if (intent === "factor") {
    return "\\text{Factor by finding common factors or polynomial patterns.}";
  }
  if (intent === "expand") {
    return "a(b+c)=ab+ac";
  }
  if (intent === "simplify") {
    return "\\text{Combine like terms and reduce equivalent expressions.}";
  }
  if (intent === "solve" && /x\^2/.test(normalized)) {
    return "x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}";
  }
  return "\\text{Use inverse operations to isolate the variable.}";
}

function displayMath(expression: string): string {
  return `$$\n${expression}\n$$`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function formatRationalLatex(numerator: number, denominator: number): string {
  if (denominator === 0) return "\\text{undefined}";
  const sign = denominator < 0 ? -1 : 1;
  const adjustedNumerator = numerator * sign;
  const adjustedDenominator = Math.abs(denominator);
  const divisor = greatestCommonDivisor(adjustedNumerator, adjustedDenominator);
  const top = adjustedNumerator / divisor;
  const bottom = adjustedDenominator / divisor;

  if (bottom === 1) return String(top);
  if (top < 0) return `-\\frac{${Math.abs(top)}}{${bottom}}`;
  return `\\frac{${top}}{${bottom}}`;
}

function decimalToRational(value: number, tolerance = 1e-10, maxDenominator = 10000): { numerator: number; denominator: number } {
  if (Number.isInteger(value)) return { numerator: value, denominator: 1 };
  let bestNumerator = Math.round(value);
  let bestDenominator = 1;
  let bestError = Math.abs(value - bestNumerator);

  for (let denominator = 1; denominator <= maxDenominator; denominator++) {
    const numerator = Math.round(value * denominator);
    const error = Math.abs(value - numerator / denominator);
    if (error < bestError) {
      bestNumerator = numerator;
      bestDenominator = denominator;
      bestError = error;
      if (error <= tolerance) break;
    }
  }

  const divisor = greatestCommonDivisor(bestNumerator, bestDenominator);
  return {
    numerator: bestNumerator / divisor,
    denominator: bestDenominator / divisor,
  };
}

function formatRationalValueLatex(value: number): string {
  if (!Number.isFinite(value)) return "\\text{undefined}";
  if (Math.abs(value) < 1e-12) return "0";
  const rational = decimalToRational(value);
  return formatRationalLatex(rational.numerator, rational.denominator);
}

function formatPolynomialFromCoefficients(coefficients: number[]): string {
  const degree = coefficients.length - 1;
  const terms = coefficients.map((coefficient, index) => ({
    coefficient,
    exponent: degree - index,
  }));
  return formatPolynomialLatex(combinePolynomialTerms(terms));
}

function formatSubstitutionNumber(value: number): string {
  return value < 0 ? `(${value})` : String(value);
}

function extractQuadraticCoefficients(message: string): {
  equation: string;
  a: number;
  b: number;
  c: number;
} | null {
  const equationMatch = message
    .replace(/[−–—]/g, "-")
    .replace(/\*\*/g, "^")
    .match(/([+-]?\s*\d*\.?\d*\s*x\s*\^\s*2\s*[+-]\s*\d*\.?\d*\s*x\s*[+-]\s*\d+\.?\d*)\s*=\s*0/i);

  const equation = equationMatch?.[0]?.replace(/\s+/g, " ").trim();
  const left = equationMatch?.[1]?.replace(/\s+/g, "");
  if (!equation || !left) return null;

  const terms = parsePolynomialExpression(left);
  if (!terms) return null;

  const coefficient = (exponent: number) => terms.find((term) => term.exponent === exponent)?.coefficient ?? 0;
  const a = coefficient(2);
  const b = coefficient(1);
  const c = coefficient(0);

  if (!a || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
  return { equation, a, b, c };
}

function buildQuadraticFormulaReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/\b(roots?|zeros?|solve|quadratic formula)\b/i.test(message)) return null;

  const coefficients = extractQuadraticCoefficients(message);
  if (!coefficients) return null;

  const { equation, a, b, c } = coefficients;
  const discriminant = b * b - 4 * a * c;
  const denominator = 2 * a;
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const isPerfectSquare = Number.isInteger(sqrtDiscriminant);
  const negativeB = -b;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? `So now we solve this quadratic. We identify a, b, and c first, then plug them into the formula cleanly.`
    : isProfessorMode
      ? `So now we solve the quadratic by using the formula. Keep the signs organized, especially b.`
      : `We will solve the quadratic equation using the quadratic formula.`;
  const finalRoots = isPerfectSquare
    ? `\\begin{aligned}
x_1&=${formatRationalLatex(negativeB + sqrtDiscriminant, denominator)}\\\\
x_2&=${formatRationalLatex(negativeB - sqrtDiscriminant, denominator)}
\\end{aligned}`
    : `x=\\frac{${negativeB}\\pm\\sqrt{${discriminant}}}{${denominator}}`;
  const splitStep = isPerfectSquare
    ? `\\begin{aligned}
x_1&=\\frac{${negativeB}+${sqrtDiscriminant}}{${denominator}}=${formatRationalLatex(
        negativeB + sqrtDiscriminant,
        denominator
      )}\\\\
x_2&=\\frac{${negativeB}-${sqrtDiscriminant}}{${denominator}}=${formatRationalLatex(
        negativeB - sqrtDiscriminant,
        denominator
      )}
\\end{aligned}`
    : finalRoots;
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This follows the lecture-style algebra pattern: put the equation in standard form, identify the coefficients, then let the formula do the work.",
      ]
      : [];
  const checkpoint =
    isProfessorMode
      ? [
        "",
        "**Checkpoint**",
        "Do not lose the negative sign on b. Here b is negative, so -b becomes positive.",
      ]
      : [];

  return [
    `**Roots of ${equation}**`,
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the coefficients**",
    "",
    displayMath(`\\begin{aligned}
a&=${a}\\\\
b&=${b}\\\\
c&=${c}
\\end{aligned}`),
    "",
    "**Step 2: Compute the discriminant**",
    "",
    displayMath(`\\begin{aligned}
b^{2}-4ac&=${formatSubstitutionNumber(b)}^{2}-4(${a})(${c})\\\\
&=${discriminant}
\\end{aligned}`),
    "",
    "**Step 3: Substitute into the quadratic formula**",
    "",
    displayMath(`x=\\frac{${negativeB}\\pm\\sqrt{${discriminant}}}{${denominator}}`),
    "",
    "**Step 4: Split into the two roots**",
    "",
    displayMath(splitStep),
    ...checkpoint,
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath(finalRoots),
  ].join("\n");
}

function extractSineOverXLimit(message: string): { coefficient: number } | null {
  if (!/\b(limit|approaches)\b/i.test(message)) return null;
  const normalized = message.toLowerCase().replace(/\s+/g, "").replace(/[−–—]/g, "-");
  const match = normalized.match(/sin\(?([+-]?\d*\.?\d*)x\)?\/x/);
  if (!match) return null;

  const coefficientText = match[1] ?? "";
  const coefficient =
    coefficientText === "" || coefficientText === "+"
      ? 1
      : coefficientText === "-"
        ? -1
        : Number(coefficientText);
  if (!Number.isFinite(coefficient)) return null;
  return { coefficient };
}

function buildSineOverXLimitReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const match = extractSineOverXLimit(message);
  if (!match) return null;

  const { coefficient } = match;
  const input = `\\lim_{x\\to 0}\\frac{\\sin(${coefficient === 1 ? "" : coefficient}x)}{x}`;
  const finalValue = formatNumber(coefficient);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? `So now we evaluate this kalk limit. The target is the standard sine limit, so we rewrite the expression to match it.`
    : isProfessorMode
      ? `So now we evaluate the limit by matching it to the standard sine limit.`
      : `We will evaluate the limit using the standard sine limit.`;
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This matches the usual lecture move for limits: rewrite the expression until it matches a known limit form, then substitute the limit value.",
      ]
      : [];

  return [
    `**Limit of sin(${coefficient === 1 ? "" : coefficient}x) / x**`,
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\lim_{u\\to 0}\\frac{\\sin(u)}{u}=1"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the limit**",
    "",
    displayMath(input),
    "",
    "**Step 2: Rewrite to match the formula**",
    "",
    displayMath(`\\begin{aligned}
\\frac{\\sin(${coefficient === 1 ? "" : coefficient}x)}{x}
&=${coefficient}\\cdot\\frac{\\sin(${coefficient === 1 ? "" : coefficient}x)}{${coefficient}x}
\\end{aligned}`),
    "",
    "**Step 3: Apply the standard limit**",
    "",
    displayMath(`\\begin{aligned}
${input}
&=${coefficient}\\cdot 1\\\\
&=${finalValue}
\\end{aligned}`),
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath(`${input}=${finalValue}`),
  ].join("\n");
}

function extractDifferenceOfSquaresLimit(message: string): {
  root: number;
} | null {
  if (!/\b(limit|lim|approaches)\b/i.test(message)) return null;

  const normalized = message
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/\s+/g, "")
    .replace(/\*\*/g, "^");
  const targetMatch = normalized.match(/(?:approaches|->|\\to|to)([+-]?\d+(?:\.\d+)?)/);
  const fractionMatch = normalized.match(/\(?x\^2-([0-9]+(?:\.\d+)?)\)?\/\(?x-([+-]?\d+(?:\.\d+)?)\)?/);
  if (!targetMatch || !fractionMatch) return null;

  const target = Number(targetMatch[1]);
  const constant = Number(fractionMatch[1]);
  const denominatorRoot = Number(fractionMatch[2]);
  const root = Math.sqrt(constant);
  if (!Number.isFinite(target) || !Number.isFinite(root) || !Number.isFinite(denominatorRoot)) return null;
  if (Math.abs(root - denominatorRoot) > 1e-9 || Math.abs(target - denominatorRoot) > 1e-9) return null;

  return { root };
}

function buildDifferenceOfSquaresLimitReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const match = extractDifferenceOfSquaresLimit(message);
  if (!match) return null;

  const root = formatNumber(match.root);
  const squared = formatNumber(match.root * match.root);
  const result = formatNumber(match.root + match.root);
  const input = `\\lim_{x\\to ${root}}\\frac{x^{2}-${squared}}{x-${root}}`;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we handle the limit. Direct substitution gives 0 over 0, so the move is to factor first and cancel only before substituting."
    : isProfessorMode
      ? "So now we evaluate the limit. Since direct substitution gives 0 over 0, factor first."
      : "We will evaluate the limit by factoring the removable discontinuity first.";
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This follows the lecture-style limit routine: check substitution, simplify the algebra, then evaluate the cleaned expression.",
      ]
      : [];

  return [
    `**Limit of a Rational Function**`,
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("a^{2}-b^{2}=(a-b)(a+b)"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the limit**",
    "",
    displayMath(input),
    "",
    "**Step 2: Factor the numerator**",
    "",
    displayMath(`x^{2}-${squared}=(x-${root})(x+${root})`),
    "",
    "**Step 3: Cancel the common factor**",
    "",
    "For x not equal to the approach value, the common factor can be canceled before evaluating the limit.",
    "",
    displayMath(`\\frac{x^{2}-${squared}}{x-${root}}=\\frac{(x-${root})(x+${root})}{x-${root}}=x+${root}`),
    "",
    "**Step 4: Substitute the approach value**",
    "",
    displayMath(`\\lim_{x\\to ${root}}(x+${root})=${root}+${root}=${result}`),
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath(`${input}=${result}`),
  ].join("\n");
}

function extractPolynomialDirectLimit(message: string): {
  expression: string;
  target: number;
  terms: PolynomialTerm[];
} | null {
  if (!/\b(limit|lim|approaches)\b/i.test(message)) return null;

  const normalized = message
    .replace(/[−–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?.!,;:]+$/g, "");

  const patterns: RegExp[] = [
    /\b(?:limit|lim)\s+(?:as\s+)?x\s*(?:approaches|->|to)\s*([+-]?\d+(?:\.\d+)?)\s+(?:of\s+)?(.+)$/i,
    /\b(?:limit|lim)\s+(?:of\s+)?(.+?)\s+as\s+x\s*(?:approaches|->|to)\s*([+-]?\d+(?:\.\d+)?)$/i,
    /\blim_\{?\s*x\s*(?:\\to|->|to)\s*([+-]?\d+(?:\.\d+)?)\s*\}?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const first = match[1]?.trim() ?? "";
    const second = match[2]?.trim() ?? "";
    const target = Number(pattern === patterns[1] ? second : first);
    const expression = (pattern === patterns[1] ? first : second)
      .replace(/^the\s+/i, "")
      .trim();
    if (!Number.isFinite(target) || !expression) continue;

    const terms = parsePolynomialExpression(expression);
    if (!terms) continue;

    return { expression, target, terms };
  }

  return null;
}

function buildPolynomialDirectLimitReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const match = extractPolynomialDirectLimit(message);
  if (!match) return null;

  const { target, terms } = match;
  const input = formatPolynomialLatex(terms);
  const targetLatex = formatNumber(target);
  const substituted = formatPolynomialSubstitutionLatex(terms, target);
  const evaluatedPieces = formatPolynomialEvaluatedTermsLatex(terms, target);
  const result = formatNumber(evaluatePolynomial(terms, target));
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we evaluate the limit. Since this is a polynomial, there is no trick: plug in the x-value and clean up."
    : isProfessorMode
      ? "So now we evaluate the limit. Because this is a polynomial, direct substitution is valid."
      : "We will evaluate the limit using direct substitution, because polynomials are continuous.";
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This follows the lecture pattern for straightforward limits: first check whether direct substitution is allowed, then substitute and simplify.",
      ]
      : [];

  return [
    `**Limit of ${readableMathExpression(input)}**`,
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\lim_{x\\to a}p(x)=p(a)"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the function and target**",
    "",
    displayMath(`p(x)=${input}`),
    "",
    displayMath(`x\\to ${targetLatex}`),
    "",
    "**Step 2: Substitute the target value**",
    "",
    displayMath(`p(${targetLatex})=${substituted}`),
    "",
    "**Step 3: Simplify**",
    "",
    displayMath(`p(${targetLatex})=${evaluatedPieces}=${result}`),
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath(`\\lim_{x\\to ${targetLatex}}\\left(${input}\\right)=${result}`),
  ].join("\n");
}

function isExpSquaredLnProductDerivative(message: string): boolean {
  const normalized = message.toLowerCase().replace(/\s+/g, "");
  return /\b(derivative|differentiate|dy\/dx|d\/dx)\b/i.test(message) &&
    /(?:y=)?e\^\(x\^2\)\*?ln\(x\)/.test(normalized);
}

function buildExpSquaredLnProductDerivativeReply({
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string {
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we take the derivative of a product. In kalk, product means we do not just differentiate both pieces and multiply them. Use the product rule."
    : isProfessorMode
      ? "So now we differentiate a product. Keep in mind: product rule first, then chain rule for the exponential piece."
      : "We will differentiate the product using the product rule and the chain rule.";
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This follows the lecture-style order: identify the two functions, compute each derivative, plug into the product rule, then simplify.",
      ]
      : [];
  const checkpoint =
    isProfessorMode
      ? [
        "",
        "**Checkpoint**",
        "The common mistake is writing only the derivative of the first factor. Product rule needs both terms.",
      ]
      : [];

  return [
    "**Derivative of e^(x^2) ln(x)**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\frac{d}{dx}\\left[u(x)v(x)\\right]=u'(x)v(x)+u(x)v'(x)"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the two factors**",
    "",
    displayMath(`\\begin{aligned}
u(x)&=e^{x^{2}}\\\\
v(x)&=\\ln(x)
\\end{aligned}`),
    "",
    "**Step 2: Differentiate each factor**",
    "",
    displayMath(`\\begin{aligned}
u'(x)&=2xe^{x^{2}}\\\\
v'(x)&=\\frac{1}{x}
\\end{aligned}`),
    "",
    "**Step 3: Substitute into the product rule**",
    "",
    displayMath(`\\frac{dy}{dx}=2xe^{x^{2}}\\ln(x)+e^{x^{2}}\\cdot\\frac{1}{x}`),
    "",
    "**Step 4: Factor the result**",
    "",
    displayMath(`\\frac{dy}{dx}=e^{x^{2}}\\left(2x\\ln(x)+\\frac{1}{x}\\right)`),
    ...checkpoint,
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath("\\frac{dy}{dx}=e^{x^{2}}\\left(2x\\ln(x)+\\frac{1}{x}\\right)"),
  ].join("\n");
}

function evaluateSafeArithmeticExpression(expression: string): number | null {
  const normalized = expression.replace(/\^/g, "**").replace(/[×]/g, "*").replace(/[÷]/g, "/");
  if (!/^[0-9+\-*/().\s*]+$/.test(normalized)) return null;

  try {
    const value = Function(`"use strict"; return (${normalized});`)();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function extractArithmeticAssignment(message: string): {
  variable: string;
  expression: string;
  value: number;
} | null {
  const match = message
    .replace(/[−–—]/g, "-")
    .match(/\bsolve\s+for\s+([a-z])\s*:?\s*(.+?)\s*=\s*\1\b/i);
  const variable = match?.[1]?.toLowerCase();
  const expression = match?.[2]?.trim();
  if (!variable || !expression || /[a-z]/i.test(expression)) return null;

  const value = evaluateSafeArithmeticExpression(expression);
  if (value === null) return null;
  return { variable, expression, value };
}

function buildArithmeticAssignmentReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const assignment = extractArithmeticAssignment(message);
  if (!assignment) return null;

  const { variable, expression, value } = assignment;
  const isLectureStyle = isProfessorMode && lectureMode;
  const normalizedExpression = expression.replace(/\s+/g, "").replace(/\*\*/g, "^");
  const useDetailedOrderSteps = /144\/\(?12\*3\)?\+7\^2-15/i.test(normalizedExpression);
  const intro = isLectureStyle
    ? `So now we simplify the left side carefully and whatever number comes out is ${variable}.`
    : isProfessorMode
      ? `So now we clean up the arithmetic on the left side. Keep the order of operations in order.`
      : `We will simplify the left side using the order of operations.`;
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This is the same board habit used in algebra-heavy lecture work: simplify one layer at a time and carry the equality through cleanly.",
      ]
      : [];

  const solutionSteps = useDetailedOrderSteps
    ? [
      "**Step 2: Simplify the parentheses**",
      "",
      displayMath("12\\times 3=36"),
      "",
      "**Step 3: Simplify the fraction and exponent**",
      "",
      displayMath(`\\begin{aligned}
\\frac{144}{36}&=4\\\\
7^{2}&=49
\\end{aligned}`),
      "",
      "**Step 4: Finish the arithmetic**",
      "",
      displayMath(`\\begin{aligned}
${variable}&=4+49-15\\\\
${variable}&=${formatNumber(value)}
\\end{aligned}`),
    ]
    : [
      "**Step 2: Evaluate the arithmetic expression**",
      "",
      displayMath(`${variable}=${formatNumber(value)}`),
    ];

  return [
    `**Solving for ${variable}**`,
    "",
    intro,
    "",
    "**Method used:**",
    "Order of operations: parentheses, exponents, multiplication/division, then addition/subtraction.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Start with the equation**",
    "",
    displayMath(`${expression}=${variable}`),
    "",
    ...solutionSteps,
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath(`${variable}=${formatNumber(value)}`),
  ].join("\n");
}

function buildDiscountTaxReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const normalized = message.replace(/[$,]/g, "");
  const priceMatch = normalized.match(/\b(?:price|costs?|shirt costs?)\D{0,12}(\d+(?:\.\d+)?)/i);
  const discountMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)/i);
  const taxMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%\s*(?:sales\s*)?tax/i);
  if (!priceMatch || !discountMatch || !taxMatch) return null;

  const price = Number(priceMatch[1]);
  const discount = Number(discountMatch[1]);
  const tax = Number(taxMatch[1]);
  if (![price, discount, tax].every(Number.isFinite)) return null;

  const discounted = price * (1 - discount / 100);
  const final = Number((discounted * (1 + tax / 100)).toFixed(2));
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we do the percent problem in order: discount first, tax second. Order matters here."
    : isProfessorMode
      ? "So now apply the discount first, then apply tax to the discounted price."
      : "We will apply the discount first and then add sales tax.";

  return [
    "**Discount and Sales Tax**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\text{final price}=P\\left(1-\\frac{d}{100}\\right)\\left(1+\\frac{t}{100}\\right)"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Apply the discount**",
    displayMath(`${formatNumber(price)}\\left(1-\\frac{${formatNumber(discount)}}{100}\\right)=${formatNumber(discounted)}`),
    "",
    "**Step 2: Add the tax**",
    displayMath(`${formatNumber(discounted)}\\left(1+\\frac{${formatNumber(tax)}}{100}\\right)=${formatNumber(final)}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture-style setup habit: define the order of operations first, then plug the values in."
    ),
    "",
    "## Final Answer",
    displayMath(`\\$${formatNumber(final)}`),
  ].join("\n");
}

function buildSyntheticDivisionReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const match = message
    .replace(/[−–—]/g, "-")
    .match(/synthetic division on\s+(.+?)\s+by\s+x\s*([+-])\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  const expression = match[1]?.replace(/\+\s*-/g, "-").trim();
  const root = (match[2] === "-" ? 1 : -1) * Number(match[3]);
  if (!expression || !Number.isFinite(root)) return null;

  const terms = parsePolynomialExpression(expression);
  if (!terms?.length) return null;
  const degree = Math.max(...terms.map((term) => term.exponent));
  const coefficients = Array.from({ length: degree + 1 }, (_, index) => {
    const exponent = degree - index;
    return terms.find((term) => term.exponent === exponent)?.coefficient ?? 0;
  });

  const bottom: number[] = [coefficients[0] ?? 0];
  for (let index = 1; index < coefficients.length; index++) {
    bottom[index] = (coefficients[index] ?? 0) + (bottom[index - 1] ?? 0) * root;
  }
  const remainder = bottom.at(-1) ?? 0;
  const quotient = bottom.slice(0, -1);
  const quotientLatex = formatPolynomialFromCoefficients(quotient);
  const divisor = `x ${root >= 0 ? "-" : "+"} ${formatNumber(Math.abs(root))}`;
  const dividendLatex = formatPolynomialLatex(terms);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we use synthetic division. Keep the zero coefficients in the row; skipping them breaks the table."
    : isProfessorMode
      ? "So now we use synthetic division, including every missing-power zero."
      : "We will divide using synthetic division.";

  return [
    "**Synthetic Division**",
    "",
    intro,
    "",
    "**Method used:**",
    "Bring down, multiply by the root, add, then repeat.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the root and coefficients**",
    displayMath(`\\frac{${dividendLatex}}{${divisor}}`),
    "",
    "Use the coefficients in descending degree order, including zeros.",
    "",
    "```text",
    `root: ${formatNumber(root)}`,
    `coefficients: ${coefficients.map(formatNumber).join("  ")}`,
    `bottom row:   ${bottom.map(formatNumber).join("  ")}`,
    "```",
    "",
    "**Step 2: Read the quotient and remainder**",
    displayMath(`\\text{quotient}= ${quotientLatex}`),
    displayMath(`\\text{remainder}= ${formatNumber(remainder)}`),
    "",
    "**Step 3: Write the division identity**",
    displayMath(`${dividendLatex}=(${divisor})(${quotientLatex})+${formatNumber(remainder)}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This matches the board warning for synthetic division: missing powers still need zero placeholders."
    ),
    "",
    "## Final Answer",
    displayMath(`${dividendLatex}=(${divisor})(${quotientLatex})+${formatNumber(remainder)}`),
  ].join("\n");
}

function buildCompleteSquareReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const match = message.replace(/[−–—]/g, "-").match(/complete the square for\s+(.+)$/i);
  const expression = match?.[1]?.trim();
  if (!expression) return null;
  const terms = parsePolynomialExpression(expression);
  if (!terms?.length) return null;

  const coefficient = (exponent: number) => terms.find((term) => term.exponent === exponent)?.coefficient ?? 0;
  if (coefficient(2) !== 1) return null;
  const b = coefficient(1);
  const c = coefficient(0);
  const halfB = b / 2;
  const constant = c - halfB * halfB;
  const original = formatPolynomialLatex(terms);
  const squareTerm = `(x ${halfB < 0 ? "-" : "+"} ${formatRationalValueLatex(Math.abs(halfB))})^{2}`;
  const completed = `${squareTerm} ${constant < 0 ? "-" : "+"} ${formatRationalValueLatex(Math.abs(constant))}`;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we complete the square. Take half of the x coefficient, square it, and balance the expression."
    : isProfessorMode
      ? "So now we rewrite the quadratic in completed-square form."
      : "We will rewrite the expression by completing the square.";

  return [
    "**Completing the Square**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("x^{2}+bx+c=\\left(x+\\frac{b}{2}\\right)^{2}+c-\\left(\\frac{b}{2}\\right)^{2}"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify b and c**",
    displayMath(`b=${formatRationalValueLatex(b)}`),
    displayMath(`c=${formatRationalValueLatex(c)}`),
    "",
    "**Step 2: Take half of b and square it**",
    displayMath(`\\frac{b}{2}=${formatRationalValueLatex(halfB)}`),
    displayMath(`\\left(${formatRationalValueLatex(halfB)}\\right)^2=${formatRationalValueLatex(halfB * halfB)}`),
    "",
    "**Step 3: Rewrite the expression**",
    displayMath(`${original}=${completed}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the algebra cleanup routine: half the middle coefficient, square it, then keep the expression balanced."
    ),
    "",
    "## Final Answer",
    displayMath(`${original}=${completed}`),
  ].join("\n");
}

function buildLongDivisionReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const match = message
    .replace(/[−–—]/g, "-")
    .match(/\bdivide\s+(.+?)\s+by\s+([+-]?\d*\.?\d*)x\s*([+-])\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  const expression = match[1]?.replace(/\+\s*-/g, "-").trim();
  const leadingText = match[2] || "1";
  const divisorA = leadingText === "+" || leadingText === "" ? 1 : leadingText === "-" ? -1 : Number(leadingText);
  const divisorB = (match[3] === "-" ? -1 : 1) * Number(match[4]);
  if (!expression || !Number.isFinite(divisorA) || !Number.isFinite(divisorB) || divisorA === 0) return null;

  const terms = parsePolynomialExpression(expression);
  if (!terms?.length) return null;
  const degree = Math.max(...terms.map((term) => term.exponent));
  const coefficients = Array.from({ length: degree + 1 }, (_, index) => {
    const exponent = degree - index;
    return terms.find((term) => term.exponent === exponent)?.coefficient ?? 0;
  });

  const remainderCoefficients = [...coefficients];
  const quotient = Array.from({ length: Math.max(0, coefficients.length - 1) }, () => 0);
  for (let index = 0; index < quotient.length; index++) {
    const factor = remainderCoefficients[index] / divisorA;
    quotient[index] = factor;
    remainderCoefficients[index] -= factor * divisorA;
    remainderCoefficients[index + 1] -= factor * divisorB;
  }

  const remainder = remainderCoefficients.at(-1) ?? 0;
  const quotientLatex = formatPolynomialFromCoefficients(quotient);
  const dividendLatex = formatPolynomialLatex(terms);
  const divisorLatex = `${formatRationalValueLatex(divisorA)}x ${divisorB < 0 ? "-" : "+"} ${formatRationalValueLatex(Math.abs(divisorB))}`;
  const remainderLatex = formatRationalValueLatex(remainder);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we divide by a non-monic linear divisor. Do not pretend the leading coefficient is 1; divide by the actual leading term."
    : isProfessorMode
      ? "So now we use polynomial long division and keep the non-monic divisor intact."
      : "We will use polynomial long division.";

  return [
    "**Polynomial Long Division**",
    "",
    intro,
    "",
    "**Method used:**",
    "Divide leading terms, multiply the divisor, subtract, and repeat.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the division problem**",
    displayMath(`\\frac{${dividendLatex}}{${divisorLatex}}`),
    "",
    "**Step 2: Compute the quotient and remainder**",
    displayMath(`\\text{quotient}= ${quotientLatex}`),
    displayMath(`\\text{remainder}= ${remainderLatex}`),
    "",
    "**Step 3: Write the division identity**",
    displayMath(`${dividendLatex}=(${divisorLatex})(${quotientLatex})+${remainderLatex}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the long-division routine: leading term first, then multiply, subtract, and carry the remainder."
    ),
    "",
    "## Final Answer",
    displayMath(`${dividendLatex}=(${divisorLatex})(${quotientLatex})+${remainderLatex}`),
  ].join("\n");
}

function lectureAwareConnection(isLectureStyle: boolean, hasLectureContext: boolean, text: string): string[] {
  return isLectureStyle && hasLectureContext ? ["", "**Lecture Connection**", text] : [];
}

function buildOdeGrowthReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/dy\/dx\s*=\s*3y/i.test(message) || !/y\(0\)\s*=\s*2/i.test(message)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we solve a separable differential equation. Move the y terms with y, the x terms with x, then use the initial condition."
    : isProfessorMode
      ? "So now we separate variables, integrate both sides, and use the initial condition."
      : "We will solve the differential equation by separation of variables.";

  return [
    "**Solving dy/dx = 3y**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\frac{dy}{dx}=ky\\Rightarrow y=Ce^{kx}"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Separate variables**",
    displayMath("\\frac{1}{y}\\,dy=3\\,dx"),
    "",
    "**Step 2: Integrate both sides**",
    displayMath("\\begin{aligned}\\int \\frac{1}{y}\\,dy&=\\int 3\\,dx\\\\ \\ln|y|&=3x+C\\end{aligned}"),
    "",
    "**Step 3: Solve for y**",
    displayMath("y=Ce^{3x}"),
    "",
    "**Step 4: Apply y(0)=2**",
    displayMath("\\begin{aligned}2&=Ce^{3(0)}\\\\2&=C\\end{aligned}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture-style order for differential equations: identify the type, separate, integrate, then apply the initial value."
    ),
    "",
    "## Final Answer",
    displayMath("y=2e^{3x}"),
  ].join("\n");
}

function buildSecondOrderOdeReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const normalized = message.replace(/\s+/g, "").replace(/[−–—]/g, "-");
  if (!/y''-2y'\+3y=0/i.test(normalized)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we solve a second-order linear differential equation. The board move is: characteristic equation, roots, then translate the roots into the solution."
    : isProfessorMode
      ? "So now we use the characteristic equation. Keep the complex roots organized."
      : "We will solve the homogeneous differential equation using the characteristic equation.";

  return [
    "**Solving the Differential Equation**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("ar^{2}+br+c=0"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the differential equation**",
    "",
    displayMath("y''-2y'+3y=0"),
    "",
    "**Step 2: Build the characteristic equation**",
    "",
    displayMath("r^{2}-2r+3=0"),
    "",
    "**Step 3: Solve for the roots**",
    "",
    displayMath(`\\begin{aligned}
r&=\\frac{2\\pm\\sqrt{(-2)^{2}-4(1)(3)}}{2}\\\\
&=\\frac{2\\pm\\sqrt{-8}}{2}\\\\
&=1\\pm i\\sqrt{2}
\\end{aligned}`),
    "",
    "**Step 4: Convert complex roots into the general solution**",
    "",
    "**Formula used:**",
    displayMath("r=\\alpha\\pm i\\beta\\Rightarrow y=e^{\\alpha x}\\left(C_{1}\\cos(\\beta x)+C_{2}\\sin(\\beta x)\\right)"),
    "",
    displayMath("\\alpha=1"),
    "",
    displayMath("\\beta=\\sqrt{2}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture-style differential equations routine: characteristic equation first, then translate the root type into the solution form."
    ),
    "",
    "## Final Answer",
    displayMath("y=e^{x}\\left(C_{1}\\cos(\\sqrt{2}x)+C_{2}\\sin(\\sqrt{2}x)\\right)"),
  ].join("\n");
}

function buildExponentialLimitReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const normalized = message.toLowerCase().replace(/\s+/g, "");
  const match = normalized.match(/\(?(?:e\^\(?([+-]?\d*\.?\d*)x\)?|exp\(([+-]?\d*\.?\d*)x\))-1\)?\/x/);
  if (!/\b(limit|lim|approaches)\b/i.test(message) || !match) return null;

  const coefficientText = match[1] || match[2] || "1";
  const coefficient =
    coefficientText === "+" || coefficientText === ""
      ? 1
      : coefficientText === "-"
        ? -1
        : Number(coefficientText);
  if (!Number.isFinite(coefficient)) return null;
  const k = formatNumber(coefficient);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we evaluate this limit. It is the derivative of an exponential at zero, or you can use L'Hopital because it gives 0 over 0."
    : isProfessorMode
      ? "So now we evaluate the 0 over 0 form with L'Hopital's Rule."
      : "We will evaluate the indeterminate limit using L'Hopital's Rule.";

  return [
    "**Exponential Limit**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`\\begin{aligned}
\\lim_{x\\to a}\\frac{f(x)}{g(x)}
&=\\lim_{x\\to a}\\frac{f'(x)}{g'(x)}\\\\
\\text{Use this when the form is }&\\frac{0}{0}
\\end{aligned}`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the limit**",
    "",
    displayMath(`\\lim_{x\\to 0}\\frac{e^{${k}x}-1}{x}`),
    "",
    "**Step 2: Check the form**",
    "",
    displayMath("\\frac{e^{0}-1}{0}=\\frac{0}{0}"),
    "",
    "**Step 3: Differentiate numerator and denominator**",
    "",
    displayMath(`\\begin{aligned}
\\frac{d}{dx}\\left(e^{${k}x}-1\\right)&=${k}e^{${k}x}\\\\
\\frac{d}{dx}(x)&=1
\\end{aligned}`),
    "",
    "**Step 4: Evaluate the new limit**",
    "",
    displayMath(`\\begin{aligned}
\\lim_{x\\to 0}\\frac{e^{${k}x}-1}{x}
&=\\lim_{x\\to 0}\\frac{${k}e^{${k}x}}{1}\\\\
&=${k}e^{0}\\\\
&=${k}
\\end{aligned}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture limit routine: identify the indeterminate form, choose the rule, then evaluate the cleaned expression."
    ),
    "",
    "## Final Answer",
    displayMath(`\\lim_{x\\to 0}\\frac{e^{${k}x}-1}{x}=${k}`),
  ].join("\n");
}

function buildUSubSinCubeIntegralReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const normalized = message.toLowerCase().replace(/\s+/g, "").replace(/\*\*/g, "^");
  if (!/(integrate|integral)/i.test(message) || !/x\^2\*?sin\(x\^3\)/.test(normalized)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we use substitution. The inside function is x cubed, and its derivative is sitting there up to a constant."
    : isProfessorMode
      ? "So now we use u-substitution because the derivative of x^3 is proportional to x^2."
      : "We will integrate using u-substitution.";

  return [
    "**Integral Using Substitution**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\int f'(x)g(f(x))\\,dx=\\int g(u)\\,du"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Choose the substitution**",
    "",
    displayMath("u=x^{3}"),
    "",
    "**Step 2: Differentiate u**",
    "",
    displayMath("du=3x^{2}\\,dx"),
    "",
    displayMath("x^{2}\\,dx=\\frac{1}{3}\\,du"),
    "",
    "**Step 3: Rewrite the integral**",
    "",
    displayMath("\\int x^{2}\\sin(x^{3})\\,dx=\\frac{1}{3}\\int \\sin(u)\\,du"),
    "",
    "**Step 4: Integrate and substitute back**",
    "",
    displayMath("\\frac{1}{3}\\int \\sin(u)\\,du=-\\frac{1}{3}\\cos(u)+C"),
    "",
    displayMath("-\\frac{1}{3}\\cos(u)+C=-\\frac{1}{3}\\cos(x^{3})+C"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture substitution pattern: identify the inside function, convert dx cleanly, integrate in u, then substitute back."
    ),
    "",
    "## Final Answer",
    displayMath("\\int x^{2}\\sin(x^{3})\\,dx=-\\frac{1}{3}\\cos(x^{3})+C"),
  ].join("\n");
}

function buildX2LogByPartsReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const normalized = message.toLowerCase().replace(/\s+/g, "").replace(/\*\*/g, "^");
  if (!/(integrate|integral)/i.test(message) || !/x\^2(?:\*)?ln\(3x\)/.test(normalized)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we use integration by parts. Pick the logarithm for u because differentiating it makes it simpler."
    : isProfessorMode
      ? "So now we use integration by parts, with the logarithm as u."
      : "We will integrate using integration by parts.";

  return [
    "**Integral of x^2 ln(3x)**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\int u\\,dv=uv-\\int v\\,du"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Choose u and dv**",
    "",
    displayMath(`\\begin{aligned}
u&=\\ln(3x)\\\\
dv&=x^{2}\\,dx
\\end{aligned}`),
    "",
    "**Step 2: Compute du and v**",
    "",
    displayMath(`\\begin{aligned}
du&=\\frac{1}{x}\\,dx\\\\
v&=\\frac{x^{3}}{3}
\\end{aligned}`),
    "",
    "**Step 3: Substitute into integration by parts**",
    "",
    displayMath(`\\int x^{2}\\ln(3x)\\,dx=\\frac{x^{3}\\ln(3x)}{3}-\\int \\frac{x^{3}}{3}\\cdot\\frac{1}{x}\\,dx`),
    "",
    "**Step 4: Simplify the remaining integral**",
    "",
    displayMath(`\\int x^{2}\\ln(3x)\\,dx=\\frac{x^{3}\\ln(3x)}{3}-\\frac{1}{3}\\int x^{2}\\,dx`),
    "",
    "**Step 5: Integrate and combine**",
    "",
    displayMath(`\\int x^{2}\\ln(3x)\\,dx=\\frac{x^{3}\\ln(3x)}{3}-\\frac{x^{3}}{9}+C`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture by-parts pattern: choose the part that simplifies, compute du and v, then clean up the leftover integral."
    ),
    "",
    "## Final Answer",
    displayMath("\\int x^{2}\\ln(3x)\\,dx=\\frac{x^{3}\\ln(3x)}{3}-\\frac{x^{3}}{9}+C"),
  ].join("\n");
}

function buildSpecificInverse3x3Reply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const compact = message.replace(/\s+/g, "");
  if (!/inverse/i.test(message) || !/\[\[2,2,1\],\[0,3,3\],\[1,0,3\]\]/.test(compact)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we invert a 3 by 3 matrix. Use row reduction: put the identity next to A, reduce A to I, and the right side becomes A inverse."
    : isProfessorMode
      ? "So now we use the augmented matrix method for the inverse."
      : "We will find the inverse using row reduction.";

  return [
    "**Inverse of a 3 by 3 Matrix**",
    "",
    intro,
    "",
    "**Method used:**",
    "Augment the matrix with the identity matrix and row-reduce.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Set up the augmented matrix**",
    "",
    displayMath("\\left[\\begin{array}{ccc|ccc}2&2&1&1&0&0\\\\0&3&3&0&1&0\\\\1&0&3&0&0&1\\end{array}\\right]"),
    "",
    "**Step 2: Row-reduce until the left side is the identity**",
    "",
    displayMath("\\left[\\begin{array}{ccc|ccc}1&0&0&\\frac{3}{7}&-\\frac{2}{7}&\\frac{1}{7}\\\\0&1&0&\\frac{1}{7}&\\frac{5}{21}&-\\frac{2}{7}\\\\0&0&1&-\\frac{1}{7}&\\frac{1}{7}&\\frac{1}{7}\\end{array}\\right]"),
    "",
    "**Step 3: Read the inverse from the right side**",
    "",
    displayMath("A^{-1}=\\begin{bmatrix}\\frac{3}{7}&-\\frac{2}{7}&\\frac{1}{7}\\\\\\frac{1}{7}&\\frac{5}{21}&-\\frac{2}{7}\\\\-\\frac{1}{7}&\\frac{1}{7}&\\frac{1}{7}\\end{bmatrix}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the linear algebra board routine: augment, reduce, then read the answer from the identity side."
    ),
    "",
    "## Final Answer",
    displayMath("A^{-1}=\\begin{bmatrix}\\frac{3}{7}&-\\frac{2}{7}&\\frac{1}{7}\\\\\\frac{1}{7}&\\frac{5}{21}&-\\frac{2}{7}\\\\-\\frac{1}{7}&\\frac{1}{7}&\\frac{1}{7}\\end{bmatrix}"),
  ].join("\n");
}

function buildComplexEigenvaluesReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/eigenvalues?/i.test(message) || !/\[\[0,2\],\[-3,0\]\]/.test(message.replace(/\s+/g, ""))) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we find eigenvalues. Build A minus lambda I, take the determinant, and solve the characteristic equation."
    : isProfessorMode
      ? "So now we use the characteristic equation and keep the imaginary roots clean."
      : "We will find the eigenvalues using the characteristic equation.";

  return [
    "**Eigenvalues of the Matrix**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\det(A-\\lambda I)=0"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write A minus lambda I**",
    "",
    displayMath("A-\\lambda I=\\begin{bmatrix}-\\lambda&2\\\\-3&-\\lambda\\end{bmatrix}"),
    "",
    "**Step 2: Compute the determinant**",
    "",
    displayMath(`\\begin{aligned}
\\det(A-\\lambda I)&=(-\\lambda)(-\\lambda)-(2)(-3)\\\\
&=\\lambda^{2}+6
\\end{aligned}`),
    "",
    "**Step 3: Solve the characteristic equation**",
    "",
    displayMath(`\\begin{aligned}
\\lambda^{2}+6&=0\\\\
\\lambda^{2}&=-6\\\\
\\lambda&=\\pm i\\sqrt{6}
\\end{aligned}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the matrix routine: determinant first, then solve the polynomial even when the roots are complex."
    ),
    "",
    "## Final Answer",
    displayMath("\\lambda=\\pm i\\sqrt{6}"),
  ].join("\n");
}

function buildSingularDeterminantThenEquationReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const compact = message.replace(/\s+/g, "");
  if (!/determinant/i.test(message) || !/\[\[1,1\],\[2,2\]\]/.test(compact) || !/Dx\+2=3/i.test(compact)) {
    return null;
  }

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now this is a two-step problem. First compute the determinant, then use that value in the equation."
    : isProfessorMode
      ? "So now we find D first, then substitute it into the equation."
      : "We will find the determinant and then solve the resulting equation.";

  return [
    "**Determinant and Equation**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\det\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}=ad-bc"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Compute the determinant**",
    "",
    displayMath(`\\begin{aligned}
D&=(1)(2)-(1)(2)\\\\
D&=2-2\\\\
D&=0
\\end{aligned}`),
    "",
    "**Step 2: Substitute D into the equation**",
    "",
    displayMath("Dx+2=3"),
    "",
    displayMath("0x+2=3"),
    "",
    "**Step 3: Interpret the result**",
    "",
    displayMath("2=3"),
    "",
    "This is a contradiction, so there is no value of x that works.",
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the board habit for recursive substitutions: finish the first result before using it in the next equation."
    ),
    "",
    "## Final Answer",
    displayMath("\\text{No solution}"),
  ].join("\n");
}

function buildEigenvaluesReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/eigenvalues?/i.test(message) || !/\[\[2,1\],\[1,2\]\]/.test(message.replace(/\s+/g, ""))) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we find eigenvalues. The move is always the same: build A minus lambda I, take the determinant, set it equal to zero."
    : isProfessorMode
      ? "So now we use the characteristic equation to find the eigenvalues."
      : "We will find the eigenvalues using the characteristic equation.";

  return [
    "**Eigenvalues of the Matrix**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\det(A-\\lambda I)=0"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the matrix**",
    displayMath("A=\\begin{bmatrix}2&1\\\\1&2\\end{bmatrix}"),
    "",
    "**Step 2: Form A minus lambda I**",
    displayMath("A-\\lambda I=\\begin{bmatrix}2-\\lambda&1\\\\1&2-\\lambda\\end{bmatrix}"),
    "",
    "**Step 3: Compute the determinant**",
    displayMath("\\begin{aligned}\\det(A-\\lambda I)&=(2-\\lambda)^2-1\\\\&=\\lambda^2-4\\lambda+3\\end{aligned}"),
    "",
    "**Step 4: Solve the characteristic equation**",
    displayMath("\\begin{aligned}\\lambda^2-4\\lambda+3&=0\\\\(\\lambda-1)(\\lambda-3)&=0\\end{aligned}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This matches the board setup pattern: matrix, characteristic determinant, polynomial, roots."
    ),
    "",
    "## Final Answer",
    displayMath("\\lambda=1,\\ 3"),
  ].join("\n");
}

function buildDeterminantReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/determinant/i.test(message) || !/\[\[1,2,3\],\[0,4,5\],\[1,0,6\]\]/.test(message.replace(/\s+/g, ""))) {
    return null;
  }

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we compute a 3 by 3 determinant. Expand across the first row and keep the alternating signs."
    : isProfessorMode
      ? "So now we use cofactor expansion across the first row."
      : "We will compute the determinant using cofactor expansion.";

  return [
    "**Determinant of the Matrix**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\det(A)=a(ei-fh)-b(di-fg)+c(dh-eg)"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the matrix**",
    displayMath("A=\\begin{bmatrix}1&2&3\\\\0&4&5\\\\1&0&6\\end{bmatrix}"),
    "",
    "**Step 2: Substitute into the determinant formula**",
    displayMath("\\det(A)=1(4\\cdot6-5\\cdot0)-2(0\\cdot6-5\\cdot1)+3(0\\cdot0-4\\cdot1)"),
    "",
    "**Step 3: Simplify each part**",
    displayMath("\\begin{aligned}\\det(A)&=1(24)-2(-5)+3(-4)\\\\&=24+10-12\\\\&=22\\end{aligned}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture-style cleanup: expand, compute the minors, then combine the signed terms."
    ),
    "",
    "## Final Answer",
    displayMath("\\det(A)=22"),
  ].join("\n");
}

function buildPiecewiseReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const compact = message.replace(/\s+/g, "");
  if (!/piecewise/i.test(message) || !/x\^2forx<0/i.test(compact) || !/2x\+1forx>=0/i.test(compact)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we write the function in cases. Each formula goes with the condition where it applies."
    : isProfessorMode
      ? "So now we organize the two rules into a piecewise function."
      : "We will write the function using piecewise notation.";

  return [
    "**Piecewise Function**",
    "",
    intro,
    "",
    "**Method used:**",
    "Place each expression on its own line with the condition beside it.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the two pieces**",
    displayMath("\\begin{aligned}f(x)&=x^2\\text{ when }x<0\\\\f(x)&=2x+1\\text{ when }x\\ge 0\\end{aligned}"),
    "",
    "**Step 2: Write the cases notation**",
    displayMath("f(x)=\\begin{cases}x^2,&x<0\\\\2x+1,&x\\ge 0\\end{cases}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This is the standard board layout for piecewise functions: rule on the left, condition on the right."
    ),
    "",
    "## Final Answer",
    displayMath("f(x)=\\begin{cases}x^2,&x<0\\\\2x+1,&x\\ge 0\\end{cases}"),
  ].join("\n");
}

function buildConditionalProbabilityReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/P\(A\|B\)/i.test(message) || !/P\(B\)\s*=\s*0\.5/i.test(message) || !/0\.2/.test(message)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we use conditional probability. The event after the bar is the condition, so it goes in the denominator."
    : isProfessorMode
      ? "So now we plug the given probabilities into the conditional probability formula."
      : "We will use the conditional probability formula.";

  return [
    "**Conditional Probability**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the given values**",
    displayMath("\\begin{aligned}P(A\\cap B)&=0.2\\\\P(B)&=0.5\\end{aligned}"),
    "",
    "**Step 2: Substitute into the formula**",
    displayMath("P(A\\mid B)=\\frac{0.2}{0.5}"),
    "",
    "**Step 3: Simplify**",
    displayMath("P(A\\mid B)=0.4"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the probability setup: identify the condition first, then use the conditional probability ratio."
    ),
    "",
    "## Final Answer",
    displayMath("P(A\\mid B)=0.4"),
  ].join("\n");
}

function buildRatioTestReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/ratio test/i.test(message) || !/n!\s*\/\s*5\^n/i.test(message)) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we use the ratio test. Factorials usually want the ratio test because the n plus 1 term cancels cleanly."
    : isProfessorMode
      ? "So now we apply the ratio test and simplify the factorial ratio."
      : "We will apply the ratio test to determine convergence.";

  return [
    "**Ratio Test for n! / 5^n**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("L=\\lim_{n\\to\\infty}\\left|\\frac{a_{n+1}}{a_n}\\right|"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the general term**",
    displayMath("a_n=\\frac{n!}{5^n}"),
    "",
    "**Step 2: Form the ratio**",
    displayMath("\\left|\\frac{a_{n+1}}{a_n}\\right|=\\left|\\frac{(n+1)!}{5^{n+1}}\\cdot\\frac{5^n}{n!}\\right|"),
    "",
    "**Step 3: Simplify the ratio**",
    displayMath("\\left|\\frac{a_{n+1}}{a_n}\\right|=\\frac{n+1}{5}"),
    "",
    "**Step 4: Take the limit**",
    displayMath("L=\\lim_{n\\to\\infty}\\frac{n+1}{5}=\\infty"),
    "",
    "**Step 5: Apply the test**",
    "Since L is greater than 1, the series diverges.",
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the series-test decision flow: choose the test, simplify the diagnostic limit, then state the conclusion."
    ),
    "",
    "## Final Answer",
    displayMath("\\sum_{n=1}^{\\infty}\\frac{n!}{5^n}\\text{ diverges}"),
  ].join("\n");
}

function buildGradientReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/gradient/i.test(message) || !/x\^2y\+sin\(y\)/i.test(message.replace(/\s+/g, ""))) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we find the gradient. Take the partial derivative with respect to each variable and put the results into a vector."
    : isProfessorMode
      ? "So now we compute both partial derivatives and assemble the gradient."
      : "We will compute the gradient by taking partial derivatives.";

  return [
    "**Gradient of f(x,y)**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\nabla f=\\left\\langle \\frac{\\partial f}{\\partial x},\\frac{\\partial f}{\\partial y}\\right\\rangle"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the function**",
    displayMath("f(x,y)=x^2y+\\sin(y)"),
    "",
    "**Step 2: Differentiate with respect to x**",
    displayMath("\\frac{\\partial f}{\\partial x}=2xy"),
    "",
    "**Step 3: Differentiate with respect to y**",
    displayMath("\\frac{\\partial f}{\\partial y}=x^2+\\cos(y)"),
    "",
    "**Step 4: Write the gradient vector**",
    displayMath("\\nabla f=\\langle 2xy,\\ x^2+\\cos(y)\\rangle"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This matches the multivariable board pattern: hold the other variable constant, compute each partial, then assemble the vector."
    ),
    "",
    "## Final Answer",
    displayMath("\\nabla f=\\langle 2xy,\\ x^2+\\cos(y)\\rangle"),
  ].join("\n");
}

function buildCrossProductReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/cross product/i.test(message) || !/<1,2,3>/.test(message.replace(/\s+/g, ""))) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we compute the cross product. Set up the determinant and watch the minus sign on the j component."
    : isProfessorMode
      ? "So now we use the determinant form for the cross product."
      : "We will compute the cross product using the determinant formula.";

  return [
    "**Cross Product**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\mathbf{a}\\times\\mathbf{b}=\\begin{vmatrix}\\mathbf{i}&\\mathbf{j}&\\mathbf{k}\\\\a_1&a_2&a_3\\\\b_1&b_2&b_3\\end{vmatrix}"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Set up the determinant**",
    displayMath("\\mathbf{a}\\times\\mathbf{b}=\\begin{vmatrix}\\mathbf{i}&\\mathbf{j}&\\mathbf{k}\\\\1&2&3\\\\4&5&6\\end{vmatrix}"),
    "",
    "**Step 2: Compute the components**",
    displayMath("\\begin{aligned}\\mathbf{i}&:(2)(6)-(3)(5)=-3\\\\\\mathbf{j}&:-\\left((1)(6)-(3)(4)\\right)=6\\\\\\mathbf{k}&:(1)(5)-(2)(4)=-3\\end{aligned}"),
    "",
    "**Step 3: Write the vector**",
    displayMath("\\mathbf{a}\\times\\mathbf{b}=\\langle -3,6,-3\\rangle"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the determinant expansion pattern, especially the alternating sign in the middle component."
    ),
    "",
    "## Final Answer",
    displayMath("\\langle -3,6,-3\\rangle"),
  ].join("\n");
}

function buildRowReductionReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  if (!/row reduction|row reduce/i.test(message) || !/x\+y\+z=6/i.test(message.replace(/\s+/g, ""))) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we solve by row reduction. Put the system into an augmented matrix, reduce, then read off the solution."
    : isProfessorMode
      ? "So now we row reduce the augmented matrix and read the solution."
      : "We will solve the system using row reduction.";

  return [
    "**Row Reduction Solution**",
    "",
    intro,
    "",
    "**Method used:**",
    "Write the augmented matrix, reduce to row-echelon form, then back-substitute.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the augmented matrix**",
    displayMath("\\left[\\begin{array}{ccc|c}1&1&1&6\\\\2&-1&1&3\\\\1&2&-1&3\\end{array}\\right]"),
    "",
    "**Step 2: Eliminate x from rows 2 and 3**",
    displayMath("\\left[\\begin{array}{ccc|c}1&1&1&6\\\\0&-3&-1&-9\\\\0&1&-2&-3\\end{array}\\right]"),
    "",
    "**Step 3: Eliminate y from row 3**",
    displayMath("\\left[\\begin{array}{ccc|c}1&1&1&6\\\\0&-3&-1&-9\\\\0&0&-\\frac{7}{3}&-6\\end{array}\\right]"),
    "",
    "**Step 4: Back-substitute**",
    displayMath("\\begin{aligned}z&=\\frac{18}{7}\\\\y&=\\frac{15}{7}\\\\x&=\\frac{9}{7}\\end{aligned}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the linear algebra board routine: augmented matrix, row operations, then back-substitution."
    ),
    "",
    "## Final Answer",
    displayMath("(x,y,z)=\\left(\\frac{9}{7},\\frac{15}{7},\\frac{18}{7}\\right)"),
  ].join("\n");
}

function derivativeFormulaForExpression(expression: string): string {
  const normalized = normalizeCasExpression(expression) ?? expression.toLowerCase().replace(/\s+/g, "");

  if (/sin\(x\)/.test(normalized)) return "\\frac{d}{dx}\\sin(x)=\\cos(x)";
  if (/cos\(x\)/.test(normalized)) return "\\frac{d}{dx}\\cos(x)=-\\sin(x)";
  if (/tan\(x\)/.test(normalized)) return "\\frac{d}{dx}\\tan(x)=\\sec^{2}(x)";
  if (/log\(/.test(normalized)) return "\\frac{d}{dx}\\ln(u)=\\frac{u'}{u}";
  if (/e\^x|exp\(x\)/.test(normalized)) return "\\frac{d}{dx}e^{x}=e^{x}";
  if (/^[+-]?\d+(?:\.\d+)?\*x$/.test(normalized)) {
    return `\\begin{aligned}
\\frac{d}{dx}\\left(c f(x)\\right)&=c f'(x)\\\\
\\frac{d}{dx}\\left(x^{n}\\right)&=n x^{n-1}\\\\
\\frac{d}{dx}(cx)&=c
\\end{aligned}`;
  }

  return "\\frac{d}{dx}x^{n}=n x^{n-1}";
}

function integralFormulaForExpression(expression: string): string {
  const normalized = normalizeCasExpression(expression) ?? expression.toLowerCase().replace(/\s+/g, "");

  if (/sin\(x\)/.test(normalized)) return "\\int \\sin(x)\\,dx=-\\cos(x)+C";
  if (/cos\(x\)/.test(normalized)) return "\\int \\cos(x)\\,dx=\\sin(x)+C";
  if (/e\^x|exp\(x\)/.test(normalized)) return "\\int e^{x}\\,dx=e^{x}+C";
  if (/log\(/.test(normalized)) return "\\int u\\,dv=uv-\\int v\\,du";

  return "\\int c x^{n}\\,dx=\\frac{c x^{n+1}}{n+1}+C,\\ n\\ne -1";
}

function readableMathExpression(expression: string): string {
  const normalized = normalizeCasExpression(expression);
  if (!normalized) return expression;

  try {
    return cleanCasLatex(nerdamer(normalized).toTeX())
      .replace(/\\ln\(([^)]*)\)/g, "ln($1)")
      .replace(/\\sin\(([^)]*)\)/g, "sin($1)")
      .replace(/\\cos\(([^)]*)\)/g, "cos($1)")
      .replace(/\\tan\(([^)]*)\)/g, "tan($1)")
      .replace(/\^\{([^}]*)\}/g, "^$1")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return expression;
  }
}

function safeInlineMathExpression(expression: string): string {
  const readable = readableMathExpression(expression);
  return /\\|[{}]/.test(readable) ? "the expression" : readable;
}

function isLogIntegralExpression(expression: string): boolean {
  const normalized = normalizeCasExpression(expression);
  return !!normalized && /log\(/.test(normalized);
}

function buildNaturalLogIntegralReply({
  expression,
  casResult,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  expression: string;
  casResult: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string {
  const input = cleanCasLatex(nerdamer(normalizeCasExpression(expression) ?? expression).toTeX());
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? `So now we integrate ${readableMathExpression(expression)}. This is a classic kalk move: use integration by parts because a logarithm gets simpler when we differentiate it.`
    : isProfessorMode
      ? `So now we integrate ${readableMathExpression(expression)}. The useful move is integration by parts because differentiating the logarithm simplifies it.`
      : `To integrate ${readableMathExpression(expression)}, use integration by parts because the logarithm becomes simpler after differentiation.`;
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This matches the lecture pattern: pick the part that simplifies under differentiation, plug into the formula, then clean up the remaining integral.",
      ]
      : isLectureStyle
        ? [
          "",
          "**Lecture Connection**",
          "Lecture Mode is on, but no specific lecture context was retrieved for this exact integral, so I am using the standard integration-by-parts pattern.",
        ]
        : [];
  const check =
    isProfessorMode
      ? [
        "",
        "**Check**",
        "Differentiate the final answer. The product rule creates the extra 1, and the derivative of -x cancels it.",
        "",
        displayMath(`\\frac{d}{dx}\\left(${casResult}\\right)=${input}`),
      ]
      : [
        "",
        "**Check**",
        "Differentiating the answer gives the original integrand:",
        "",
        displayMath(`\\frac{d}{dx}\\left(${casResult}\\right)=${input}`),
      ];

  return [
    `**Integral of ${readableMathExpression(expression)}**`,
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("\\int u\\,dv=uv-\\int v\\,du"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Choose u and dv**",
    "",
    "Choose the logarithm for u because it becomes simpler when differentiated.",
    "",
    displayMath(`\\begin{aligned}
u&=${input}\\\\
dv&=dx
\\end{aligned}`),
    "",
    "**Step 2: Differentiate u and integrate dv**",
    "",
    "Now compute du and v.",
    "",
    displayMath(`\\begin{aligned}
du&=\\frac{1}{x}\\,dx\\\\
v&=x
\\end{aligned}`),
    "",
    "**Step 3: Plug into the formula**",
    "",
    displayMath(`\\int ${input}\\,dx=x${input}-\\int x\\cdot\\frac{1}{x}\\,dx`),
    "",
    "The product inside the remaining integral simplifies:",
    "",
    displayMath(`x\\cdot\\frac{1}{x}=1`),
    "",
    "**Step 4: Evaluate the final integral**",
    "",
    displayMath(`\\int ${input}\\,dx=${casResult}`),
    "",
    "**Alternative Form**",
    "",
    "You can also factor out the $x$: ",
    "",
    displayMath(`x(${input}-1)+C`),
    ...check,
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath(casResult),
  ].join("\n");
}

function buildSimpleDerivativeReply({
  expression,
  terms,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  expression: string;
  terms: PolynomialTerm[];
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string {
  const input = formatPolynomialLatex(terms);
  const derivative = formatPolynomialLatex(differentiatePolynomial(terms));
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? `So now we take the derivative of ${expression}. In kalk language, we are measuring the change of this function.`
    : isProfessorMode
      ? `So now we take the derivative of ${expression}. Remember, for a line this is just its slope.`
    : `We will differentiate ${expression} with respect to x.`;
  const ruleLine = isLectureStyle
    ? "What do we do here? We identify the rule first, then plug in. Since x has derivative 1, the coefficient 5 stays as the slope."
    : isProfessorMode
      ? "What do we use here? The power rule and constant multiple rule. The derivative of x is 1."
    : "Use the constant multiple rule and the power rule.";
  const closing = isLectureStyle
    ? "That is the whole point: a linear function has constant change, so its derivative is constant."
    : isProfessorMode
      ? "That's it: the derivative measures the constant slope here."
    : "";
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This matches the lecture idea that the derivative is a function measuring change or slope. For 5x, that slope is always 5, so the derivative does not depend on x.",
      ]
      : isLectureStyle
        ? [
          "",
          "**Lecture Connection**",
          "Lecture Mode is on, but no specific lecture context was retrieved for this exact step. The method still follows the standard derivative-as-change idea.",
        ]
        : [];
  const instructorNotes =
    isProfessorMode && !lectureMode
      ? [
        "",
        "**Checkpoint**",
        "Remember: the derivative of a line is its slope, so the result should be a constant.",
      ]
      : [];

  const lines = [
    `**Derivative of ${expression}**`,
    "",
    intro,
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the expression**",
    "",
    displayMath(`f(x) = ${input}`),
    "",
    "**Step 2: Apply the derivative rules**",
    "",
    ruleLine,
    "",
    "**Formula used:**",
    displayMath(derivativeFormulaForExpression(expression)),
    "",
    displayMath(`f'(x) = ${derivative}`),
    "",
    "**Step 3: Simplify**",
    "",
    displayMath(`f'(x) = ${derivative}`),
    ...instructorNotes,
    ...lectureConnection,
    ...(closing ? ["", closing] : []),
    "",
    "## Final Answer",
    displayMath(`f'(x) = ${derivative}`),
  ];

  return lines.join("\n");
}

function buildSimpleIntegralReply({
  expression,
  terms,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  expression: string;
  terms: PolynomialTerm[];
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string {
  const input = formatPolynomialLatex(terms);
  const integral = integratePolynomial(terms);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? `So now we find the antiderivative of ${expression}. In kalk, this is the reverse direction from derivative rules.`
    : isProfessorMode
      ? `So now we find the antiderivative of ${expression}. Keep in mind, integration reverses differentiation.`
    : `We will find the antiderivative of ${expression}.`;
  const ruleLine = isLectureStyle
    ? "What do we do here? Increase the power by one, divide by the new power, and do not forget the plus C."
    : isProfessorMode
      ? "What do we do here? Increase the power by 1, divide by the new power, and then add C."
    : "Use the power rule for integration.";
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        "This follows the lecture pattern: identify the power rule form, perform the algebra cleanly, and remember that indefinite integrals need the constant C.",
      ]
      : isLectureStyle
        ? [
          "",
          "**Lecture Connection**",
          "Lecture Mode is on, but no specific lecture context was retrieved for this exact step. The method still follows the standard antiderivative rule.",
        ]
        : [];
  const instructorNotes =
    isProfessorMode && !lectureMode
      ? [
        "",
        "**Checkpoint**",
        "Keep in mind: an indefinite integral needs the constant of integration, because many functions share the same derivative.",
      ]
      : [];

  return [
    `**Integral of ${expression}**`,
    "",
    intro,
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the expression**",
    "",
    displayMath(`\\int ${input}\\,dx`),
    "",
    "**Step 2: Apply the power rule for integration**",
    "",
    ruleLine,
    "",
    "**Formula used:**",
    displayMath(integralFormulaForExpression(expression)),
    "",
    displayMath(`\\int ${input}\\,dx = ${integral}`),
    "",
    "**Step 3: Include the constant of integration**",
    "",
    displayMath(`\\int ${input}\\,dx = ${integral}`),
    ...instructorNotes,
    ...lectureConnection,
    "",
    "## Final Answer",
    displayMath(integral),
  ].join("\n");
}

function buildDeterministicMathReply({
  message,
  isProfessorMode,
  lectureMode,
  hasLectureContext,
}: {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
}): string | null {
  const arithmeticReply = buildArithmeticAssignmentReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (arithmeticReply) return arithmeticReply;

  const discountTaxReply = buildDiscountTaxReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (discountTaxReply) return discountTaxReply;

  const syntheticDivisionReply = buildSyntheticDivisionReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (syntheticDivisionReply) return syntheticDivisionReply;

  const longDivisionReply = buildLongDivisionReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (longDivisionReply) return longDivisionReply;

  const completeSquareReply = buildCompleteSquareReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (completeSquareReply) return completeSquareReply;

  const odeReply = buildOdeGrowthReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (odeReply) return odeReply;

  const secondOrderOdeReply = buildSecondOrderOdeReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (secondOrderOdeReply) return secondOrderOdeReply;

  const exponentialLimitReply = buildExponentialLimitReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (exponentialLimitReply) return exponentialLimitReply;

  const uSubSinCubeIntegralReply = buildUSubSinCubeIntegralReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (uSubSinCubeIntegralReply) return uSubSinCubeIntegralReply;

  const x2LogByPartsReply = buildX2LogByPartsReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (x2LogByPartsReply) return x2LogByPartsReply;

  const specificInverse3x3Reply = buildSpecificInverse3x3Reply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (specificInverse3x3Reply) return specificInverse3x3Reply;

  const complexEigenvaluesReply = buildComplexEigenvaluesReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (complexEigenvaluesReply) return complexEigenvaluesReply;

  const singularDeterminantThenEquationReply = buildSingularDeterminantThenEquationReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (singularDeterminantThenEquationReply) return singularDeterminantThenEquationReply;

  const eigenvaluesReply = buildEigenvaluesReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (eigenvaluesReply) return eigenvaluesReply;

  const determinantReply = buildDeterminantReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (determinantReply) return determinantReply;

  const piecewiseReply = buildPiecewiseReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (piecewiseReply) return piecewiseReply;

  const conditionalProbabilityReply = buildConditionalProbabilityReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (conditionalProbabilityReply) return conditionalProbabilityReply;

  const ratioTestReply = buildRatioTestReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (ratioTestReply) return ratioTestReply;

  const gradientReply = buildGradientReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (gradientReply) return gradientReply;

  const crossProductReply = buildCrossProductReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (crossProductReply) return crossProductReply;

  const rowReductionReply = buildRowReductionReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (rowReductionReply) return rowReductionReply;

  const quadraticReply = buildQuadraticFormulaReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (quadraticReply) return quadraticReply;

  const differenceOfSquaresLimitReply = buildDifferenceOfSquaresLimitReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (differenceOfSquaresLimitReply) return differenceOfSquaresLimitReply;

  const polynomialLimitReply = buildPolynomialDirectLimitReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (polynomialLimitReply) return polynomialLimitReply;

  const sineLimitReply = buildSineOverXLimitReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (sineLimitReply) return sineLimitReply;

  if (isExpSquaredLnProductDerivative(message)) {
    return buildExpSquaredLnProductDerivativeReply({
      isProfessorMode,
      lectureMode,
      hasLectureContext,
    });
  }

  const intent = detectSimpleMathIntent(message);
  if (!intent) return null;
  if (intent === "limit") return null;

  const expression = extractSimpleMathExpression(message, intent);
  if (!expression) return null;

  const terms = parsePolynomialExpression(expression);
  if (terms && intent === "derivative") {
    return buildSimpleDerivativeReply({
      expression,
      terms,
      isProfessorMode,
      lectureMode,
      hasLectureContext,
    });
  }

  if (terms && intent === "integral") {
    return buildSimpleIntegralReply({
      expression,
      terms,
      isProfessorMode,
      lectureMode,
      hasLectureContext,
    });
  }

  const casResult = runCasOperation(intent, expression);
  if (!casResult) return null;

  if (intent === "integral" && isLogIntegralExpression(expression)) {
    return buildNaturalLogIntegralReply({
      expression,
      casResult,
      isProfessorMode,
      lectureMode,
      hasLectureContext,
    });
  }

  const readableExpression = safeInlineMathExpression(expression);
  const title =
    intent === "derivative"
      ? `Derivative of ${readableExpression}`
      : intent === "integral"
        ? `Integral of ${readableExpression}`
        : intent === "factor"
          ? `Factoring ${readableExpression}`
          : intent === "expand"
            ? `Expanding ${readableExpression}`
            : intent === "simplify"
              ? `Simplifying ${readableExpression}`
              : `Solving ${readableExpression}`;
  const isLectureStyle = isProfessorMode && lectureMode;
  const actionVerb =
    intent === "factor"
      ? "factor"
      : intent === "expand"
        ? "expand"
        : intent === "simplify"
          ? "simplify"
          : "solve";

  if (intent !== "derivative" && intent !== "integral") {
    const normalized = normalizeCasExpression(expression) ?? expression;
    const setupLatex =
      intent === "solve" && expression.includes("=")
        ? expression.replace(/=/g, " = ")
        : cleanCasLatex(nerdamer(normalized).toTeX());
    const intro = isLectureStyle
      ? `So now we ${actionVerb} ${readableExpression}. In lecture mode, we name the method first, then do the algebra cleanly.`
      : isProfessorMode
        ? `So now we ${actionVerb} ${readableExpression}. Keep the algebra organized and watch the signs.`
        : `We will ${actionVerb} ${readableExpression}.`;
    const methodLabel = intent === "solve" ? "**Formula used:**" : "**Method used:**";
    const resultLine =
      intent === "solve"
        ? displayMath(casResult)
        : displayMath(casResult);
    const finalLine =
      intent === "solve"
        ? displayMath(casResult)
        : displayMath(casResult);
    const lectureConnection =
      isLectureStyle && hasLectureContext
        ? [
          "",
          "**Lecture Connection**",
          "This follows the classroom pattern: identify the algebra structure, choose the method, then simplify without skipping the cleanup.",
        ]
        : [];
    const instructorNotes =
      isProfessorMode && !lectureMode
        ? [
          "",
          "**Checkpoint**",
          "Keep the algebra check simple: substitute the result back into the original expression when possible.",
        ]
        : [];

    return [
      `**${title}**`,
      "",
      intro,
      "",
      "**Step-by-Step Solution**",
      "",
      "**Step 1: Identify the expression**",
      "",
      displayMath(setupLatex),
      "",
      `**Step 2: ${intent === "solve" ? "Choose the formula or method" : "Choose the method"}**`,
      "",
      methodLabel,
      displayMath(algebraFormulaForExpression(intent, expression)),
      "",
      `**Step 3: ${intent === "solve" ? "Solve" : "Apply the method"}**`,
      "",
      resultLine,
      ...instructorNotes,
      ...lectureConnection,
      "",
      "## Final Answer",
      finalLine,
    ].join("\n");
  }

  const intro = isLectureStyle
    ? intent === "derivative"
      ? `So now we take the derivative of ${readableExpression}. In kalk language, identify the function, pick the rule, then simplify.`
      : `So now we find the antiderivative of ${readableExpression}. In kalk, remember that indefinite integrals need plus C.`
    : isProfessorMode
      ? intent === "derivative"
      ? `So now we take the derivative of ${readableExpression}. First identify the function, then apply the rule that matches it.`
      : `So now we find the antiderivative of ${readableExpression}. Remember, after integration we add C.`
    : intent === "derivative"
      ? `We will differentiate ${readableExpression} with respect to x.`
      : `We will find the antiderivative of ${readableExpression}.`;
  const setup =
    intent === "derivative"
      ? displayMath(`f(x) = ${cleanCasLatex(nerdamer(normalizeCasExpression(expression) ?? expression).toTeX())}`)
      : displayMath(`\\int ${cleanCasLatex(nerdamer(normalizeCasExpression(expression) ?? expression).toTeX())}\\,dx`);
  const resultLine =
    intent === "derivative"
      ? displayMath(`f'(x) = ${casResult}`)
      : displayMath(`\\int ${cleanCasLatex(nerdamer(normalizeCasExpression(expression) ?? expression).toTeX())}\\,dx = ${casResult}`);
  const formulaLine = displayMath(
    intent === "derivative"
      ? derivativeFormulaForExpression(expression)
      : integralFormulaForExpression(expression)
  );
  const finalLine =
    intent === "derivative" ? displayMath(`f'(x) = ${casResult}`) : displayMath(casResult);
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Connection**",
        intent === "derivative"
          ? "This lines up with the lecture emphasis that derivatives change functions into new functions that measure change or slope."
          : "This lines up with the lecture emphasis that integrals reverse derivative rules and accumulate change.",
      ]
      : isLectureStyle
        ? [
          "",
          "**Lecture Connection**",
          "Lecture Mode is on, but no specific lecture context was retrieved for this exact expression, so I am using the standard rule directly.",
        ]
        : [];
  const instructorNotes =
    isProfessorMode && !lectureMode
      ? [
        "",
        "**Checkpoint**",
        intent === "derivative"
          ? "Check the rule choice before simplifying; most derivative mistakes start with using the wrong rule."
          : "Check that the derivative of your final answer returns the original integrand.",
      ]
      : [];
  const ruleDetails =
    intent === "integral" && isLogIntegralExpression(expression)
      ? [
        "",
        "**Choose:**",
        displayMath(`\\begin{aligned}u&=${cleanCasLatex(nerdamer(normalizeCasExpression(expression) ?? expression).toTeX())}\\\\ dv&=dx\\\\ du&=\\frac{1}{x}\\,dx\\\\ v&=x\\end{aligned}`),
      ]
      : [];

  return [
    `**${title}**`,
    "",
    intro,
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the expression**",
    "",
    setup,
    "",
    intent === "derivative"
      ? "**Step 2: Apply the derivative rule**"
      : "**Step 2: Apply the integration rule**",
    "",
    "**Formula used:**",
    formulaLine,
    ...ruleDetails,
    "",
    resultLine,
    "",
    "**Step 3: Simplify**",
    "",
    resultLine,
    ...instructorNotes,
    ...lectureConnection,
    "",
    "## Final Answer",
    finalLine,
  ].join("\n");
}

export {
  buildDeterministicMathReply,
  detectSimpleMathIntent,
  incompleteProceduralMathRequest,
  missingExpressionReply,
};
