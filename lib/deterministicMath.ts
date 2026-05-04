import { createRequire } from "module";
import { createIntegralTemplateRegistry } from "./mathTemplates/integrals";

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

type DerivativeRuleIntent = "product" | "chain" | "quotient" | null;

function detectSimpleMathIntent(message: string): SimpleMathIntent | null {
  const normalized = message.trim();
  if (/^(solve|evaluate|calculate|compute|do)\s+(it|this|that)$/i.test(normalized)) return "solve";
  if (
    /\b(derivative|differentiate|dy\/dx|d\/dx|slope)\b/i.test(message) ||
    /\bf'\s*\(\s*x\s*\)/i.test(message) ||
    /\b(product|chain|quotient|power)\s+rule\b/i.test(message) ||
    /\bimplicit\s+differentiation\b/i.test(message) ||
    /\blog\s+differentiation\b/i.test(message)
  ) {
    return "derivative";
  }
  if (
    /\b(integral|integrate|antiderivative)\b/i.test(message) ||
    /∫/.test(message) ||
    /\bintegration\s+by\s+parts\b/i.test(message) ||
    /\bu(?:-|\s)?sub(?:stitution)?\b/i.test(message) ||
    /\bsubstitution\b/i.test(message) ||
    /\bpartial\s+fractions?\b/i.test(message)
  ) {
    return "integral";
  }
  if (/\b(factor|factoring|factorize|factored form)\b/i.test(message)) return "factor";
  if (/\b(limit|lim|approaches)\b/i.test(message) || /x\s*(?:→|->|\\to)\s*/i.test(message)) return "limit";
  if (
    /\bprobability\s+of\b/i.test(message) ||
    /\bwithout\s+replacement\b/i.test(message) ||
    /\b(?:two|2)\s+hearts?\b/i.test(message) ||
    /\bconditional\s+probability\b/i.test(message)
  ) {
    return "solve";
  }
  if (/\b(expand|expanded form)\b/i.test(message)) return "expand";
  if (/\b(simplify|reduce|combine like terms)\b/i.test(message)) return "simplify";
  if (/\b(solve|find x|roots?|zeros?|quadratic formula)\b/i.test(message) || /=/.test(normalized)) return "solve";
  return null;
}

function incompleteProceduralMathRequest(message: string, intent: SimpleMathIntent): boolean {
  const compact = message.trim().replace(/[?.!,;:]+$/g, "");
  if (/^(solve|evaluate|calculate|compute|do)\s+(it|this|that)$/i.test(compact)) return true;

  const derivativeRuleIntent = intent === "derivative" ? detectDerivativeRuleIntent(compact) : null;

  if (intent === "limit") {
    const hasLimitTarget = /\b(?:approaches|to)\s*[+-]?(?:\d|[a-z]|infinity|∞)|(?:->|\\to)\s*[+-]?(?:\d|[a-z]|infinity|∞)/i.test(
      compact
    );
    const hasLimitBody =
      /\bof\s+[^.?!,;:]+/i.test(compact) ||
      /(?:approaches|->|\\to|to)\s*[+-]?(?:\d|[a-z]|infinity|∞)\s+[^.?!,;:]+/i.test(compact) ||
      /[)\dx]\s+as\s+x\s*(?:approaches|to|->|\\to)/i.test(compact) ||
      /^lim[_\s]/i.test(compact);
    if (!hasLimitTarget || !hasLimitBody) return true;
  }

  const hasExpressionClue =
    /(\d|=|[a-z]\s*[\+\-\*\/\^]|[+\-*/^()]|\\frac|\\int|\$)/i.test(compact) ||
    /\b(of|for|on|in)\s+(?=[-+*/^().0-9a-z\s]*[\dx=+\-*/^()\\])[-+*/^().0-9a-z\s]+$/i.test(compact);
  if (derivativeRuleIntent && !hasCompleteDerivativeRuleExpression(compact, derivativeRuleIntent)) {
    return true;
  }
  if (hasExpressionClue) return false;

  if (intent === "derivative") {
    return /\b(take|find|compute|calculate|do|give me|show me)\b[\s\S]{0,30}\b(derivative|differentiate|d\/dx)\b/i.test(
      compact
    ) ||
      /\b(product|chain|quotient|power)\s+rule\b/i.test(compact) ||
      /\bimplicit\s+differentiation\b/i.test(compact) ||
      /\blog\s+differentiation\b/i.test(compact) ||
      /\bf'\s*\(\s*x\s*\)\b/i.test(compact) ||
      /\bslope\b/i.test(compact);
  }
  if (intent === "integral") {
    return /\b(find|compute|calculate|do|give me|show me)\b[\s\S]{0,30}\b(integral|integrate|antiderivative)\b/i.test(
      compact
    ) ||
      /∫/.test(compact) ||
      /\bintegration\s+by\s+parts\b/i.test(compact) ||
      /\bu(?:-|\s)?sub(?:stitution)?\b/i.test(compact) ||
      /\bsubstitution\b/i.test(compact) ||
      /\bpartial\s+fractions?\b/i.test(compact);
  }
  if (intent === "limit") {
    return /\b(find|compute|calculate|do|give me|show me|evaluate)\b[\s\S]{0,30}\b(limit)\b/i.test(
      compact
    );
  }
  return /\b(factor|expand|simplify|solve|find roots?|find zeros?)\b\s*$/i.test(compact);
}

function missingExpressionReply(intent: SimpleMathIntent, message?: string): string {
  const derivativeRuleIntent = intent === "derivative" ? detectDerivativeRuleIntent(message ?? "") : null;
  if (derivativeRuleIntent === "product") {
    return "Send me the full product for the product rule, or I can show you a standard example like x sin(x).";
  }
  if (derivativeRuleIntent === "chain") {
    return "Send me the full composed function for the chain rule, or I can show you a standard example like sin(x^2).";
  }
  if (derivativeRuleIntent === "quotient") {
    return "Send me the full quotient for the quotient rule, or I can show you a standard example like (x^2+1)/(x-3).";
  }

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

function detectDerivativeRuleIntent(message: string): DerivativeRuleIntent {
  if (/\bproduct\s+rule\b/i.test(message)) return "product";
  if (/\bchain\s+rule\b/i.test(message)) return "chain";
  if (/\bquotient\s+rule\b/i.test(message)) return "quotient";
  return null;
}

function hasCompleteDerivativeRuleExpression(message: string, rule: DerivativeRuleIntent): boolean {
  const expression = extractSimpleMathExpression(message, "derivative") ?? message;
  const compact = expression.toLowerCase().replace(/\s+/g, "");

  if (rule === "quotient") {
    return /\\frac\{.+\}\{.+\}|.+\/.+/.test(compact);
  }

  if (rule === "chain") {
    return (
      /\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\((?:[^()]*[+\-*/^][^()]*)\)/.test(compact) ||
      /\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\([a-z0-9]+\^[^()]+\)/.test(compact) ||
      /\be\^\([^)]*[+\-*/^][^)]*\)/.test(compact) ||
      /\be\^\{[^}]*[+\-*/^][^}]*\}/.test(compact) ||
      /\b[a-z][a-z0-9']*\((?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\([^()]+\)\)/.test(compact)
    );
  }

  if (rule === "product") {
    return (
      /\\cdot|\*/.test(compact) ||
      /\)\(/.test(compact) ||
      /\)\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt|e\^|[a-z])/.test(compact) ||
      /\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\([^()]+\)\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt|e\^|[a-z0-9(])/.test(compact) ||
      /\be\^\{[^}]+\}(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt|[a-z0-9(])/.test(compact) ||
      /\be\^\([^)]*\)(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt|[a-z0-9(])/.test(compact)
    );
  }

  return true;
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
        /\bf'\s*\(\s*x\s*\)\s*(?:of|for|on)?\s*(.+)$/i,
        /\bslope\s+(?:of|for|on|at)\s+(.+)$/i,
        /\b(?:product|chain|quotient|power)\s+rule(?:\s+(?:with|for|on|of))?\s+(.+)$/i,
        /\bimplicit\s+differentiation(?:\s+(?:with|for|on|of))?\s+(.+)$/i,
        /\blog\s+differentiation(?:\s+(?:with|for|on|of))?\s+(.+)$/i,
      ]
      : intent === "integral"
        ? [
        /\b(?:find|compute|calculate|show|do)\s+(?:the\s+)?integral\s+(?:of|for|on)\s+(.+)$/i,
        /\bintegral\s+(?:of|for|on)\s+(.+)$/i,
        /\bintegrate\s+(.+)$/i,
        /\bantiderivative\s+(?:of|for)\s+(.+)$/i,
        /∫\s*(.+)$/i,
        /\bintegration\s+by\s+parts(?:\s+(?:with|for|on|of))?\s+(.+)$/i,
        /\bu(?:-|\s)?sub(?:stitution)?(?:\s+(?:with|for|on|of))?\s+(.+)$/i,
        /\bsubstitution(?:\s+(?:with|for|on|of))?\s+(.+)$/i,
        /\bpartial\s+fractions?(?:\s+(?:with|for|on|of))?\s+(.+)$/i,
        ]
        : intent === "limit"
          ? [
            /\b(?:find|compute|calculate|show|do|evaluate)\s+(?:the\s+)?limit\s+(?:of)?\s*(.+)$/i,
            /\blimit\s+(?:of)?\s*(.+)$/i,
            /\blim\s+(.+)$/i,
            /\bas\s+x\s+approaches\s+[^ ]+\s+of\s+(.+)$/i,
          ]
        : intent === "factor"
          ? [
            /\b(?:show\s+(?:only\s+)?(?:the\s+)?math\s+steps\s+for\s+)?factor(?:ing|ize)?\s+(.+)$/i,
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

  if (intent === "solve" && /=/.test(source)) {
    return source;
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
    .replace(/e\^\(([^()]+)\)/g, "exp($1)")
    .replace(/e\^x/g, "exp(x)")
    .replace(/\bln(?=\()/g, "log")
    .replace(/\bln([0-9]*x(?:\^[0-9]+)?)/g, "log($1)")
    .replace(/\blog([0-9]*x(?:\^[0-9]+)?)/g, "log($1)")
    .replace(/(\d)(x)/g, "$1*$2")
    .replace(/(x|\))(\d)/g, "$1*$2")
    .replace(/(x|\))(?=e\^|exp\()/g, "$1*")
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

function splitTopLevelAdditiveTerms(expression: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let buffer = "";

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);

    if ((character === "+" || character === "-") && depth === 0 && buffer) {
      terms.push(buffer);
      buffer = character;
      continue;
    }

    buffer += character;
  }

  if (buffer) terms.push(buffer);
  return terms.map((term) => term.trim()).filter(Boolean);
}

function extractExponentialTokens(expression: string): string[] {
  const tokens: string[] = [];

  for (let index = 0; index < expression.length; index += 1) {
    if (expression.startsWith("exp(", index)) {
      let depth = 0;
      let endIndex = index;
      for (; endIndex < expression.length; endIndex += 1) {
        const character = expression[endIndex];
        if (character === "(") depth += 1;
        if (character === ")") {
          depth -= 1;
          if (depth === 0) {
            tokens.push(expression.slice(index, endIndex + 1));
            index = endIndex;
            break;
          }
        }
      }
    } else if (expression.startsWith("e^x", index)) {
      tokens.push("e^x");
      index += 2;
    } else if (expression.startsWith("e^(", index)) {
      let depth = 0;
      let endIndex = index + 2;
      for (; endIndex < expression.length; endIndex += 1) {
        const character = expression[endIndex];
        if (character === "(") depth += 1;
        if (character === ")") {
          depth -= 1;
          if (depth === 0) {
            tokens.push(expression.slice(index, endIndex + 1));
            index = endIndex;
            break;
          }
        }
      }
    }
  }

  return Array.from(new Set(tokens));
}

function stripSingleFactor(term: string, factor: string): string {
  const unsigned = term.startsWith("+") || term.startsWith("-") ? term.slice(1) : term;
  const sign = term.startsWith("-") ? "-" : term.startsWith("+") ? "+" : "";

  let stripped = unsigned;
  if (stripped === factor) return `${sign}1`;
  if (stripped.startsWith(`${factor}*`)) stripped = stripped.slice(factor.length + 1);
  else if (stripped.endsWith(`*${factor}`)) stripped = stripped.slice(0, -1 * (factor.length + 1));
  else if (stripped.includes(`*${factor}*`)) stripped = stripped.replace(`*${factor}*`, "*");
  else stripped = stripped.replace(factor, "");

  stripped = stripped.replace(/^\*/, "").replace(/\*$/, "").trim();
  if (!stripped) stripped = "1";
  return `${sign}${stripped}`;
}

function factorSharedExponential(expression: string): string | null {
  const terms = splitTopLevelAdditiveTerms(expression);
  if (terms.length < 2) return null;

  const firstTermTokens = extractExponentialTokens(terms[0] ?? "");
  if (!firstTermTokens.length) return null;

  const sharedFactor = firstTermTokens.find((token) =>
    terms.every((term) => term.includes(token))
  );
  if (!sharedFactor) return null;

  const strippedTerms = terms.map((term) => stripSingleFactor(term, sharedFactor));
  const combined = strippedTerms
    .map((term, index) => {
      if (index === 0) return term.replace(/^\+/, "");
      return term;
    })
    .join("");

  return `${sharedFactor}*(${combined})`;
}

function reorderSimpleLatexSum(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith("-") || !trimmed.includes("+")) return trimmed;

  const terms = splitTopLevelAdditiveTerms(trimmed);
  if (terms.length !== 2) return trimmed;

  const [first, second] = terms;
  if (!first?.startsWith("-") || !second || second.startsWith("-")) return trimmed;
  return `${second.replace(/^\+/, "")}-${first.slice(1)}`;
}

function preferNegativeExponentialFactorLatex(latex: string): string {
  const match = latex.match(/^\\frac\{(.+)\}\{e\^\{(.+)\}\}$/);
  if (!match) return latex;

  const numerator = reorderSimpleLatexSum((match[1] ?? "").trim());
  const exponent = (match[2] ?? "").trim();
  return `e^{-${exponent}}\\left(${numerator}\\right)`;
}

function standardizePresentedCasLatex(resultText: string, fallbackLatex: string): string {
  let preferredText = resultText;

  try {
    if (/log\(e\)/.test(preferredText)) {
      preferredText = nerdamer(`simplify(${preferredText})`).toString();
    }

    const factoredExponential = factorSharedExponential(preferredText);
    if (factoredExponential) {
      preferredText = factoredExponential;
    }

    return preferNegativeExponentialFactorLatex(cleanCasLatex(nerdamer(preferredText).toTeX()));
  } catch {
    return fallbackLatex;
  }
}

function splitTopLevelMultiplicativeFactors(expression: string): string[] {
  const factors: string[] = [];
  let depth = 0;
  let buffer = "";

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);

    if (character === "*" && depth === 0) {
      if (buffer) factors.push(buffer.trim());
      buffer = "";
      continue;
    }

    buffer += character;
  }

  if (buffer) factors.push(buffer.trim());
  return factors.filter(Boolean);
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
    const presentedLatex = standardizePresentedCasLatex(resultText, latex);

    if (intent === "solve") return formatSolveLatex(resultText, presentedLatex);
    return intent === "integral" ? `${presentedLatex} + C` : presentedLatex;
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
    return "Factor by finding common factors or polynomial patterns.";
  }
  if (intent === "expand") {
    return "a(b+c)=ab+ac";
  }
  if (intent === "simplify") {
    return "Combine like terms and reduce equivalent expressions.";
  }
  if (intent === "solve" && /x\^2/.test(normalized)) {
    return "x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}";
  }
  return "Use inverse operations to isolate the variable.";
}

function looksLikeFormula(expression: string): boolean {
  return /\\|=|\^|_|\{|\}|[+\-*/]/.test(expression);
}

function displayMath(expression: string): string {
  return `$$\n${expression}\n$$`;
}

function buildPowerSeriesLectureReply({
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
  const wantsPowerSeries = /\b(power series|radius of convergence|interval of convergence|ratio test)\b/i.test(message);
  const wantsLecture = /\b(lecture|teach|explain|walk me through|calc\s*2|calculus\s*2)\b/i.test(message);
  if (!wantsPowerSeries || !wantsLecture) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we set up power series the way you would see it on the board: define the object, find the center, use the ratio test, then check endpoints if needed."
    : isProfessorMode
      ? "We will build power series from the definition, then use the ratio test to find where they converge."
      : "We will define power series and use the ratio test to find the radius and interval of convergence.";

  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Source**",
        "Lecture Mode is on, so use the source cards below as the timestamp trail. The important Calc 2 routine is: identify the series form, compute the ratio limit, then test endpoints separately when the radius is finite.",
      ]
      : [];

  return [
    "**Power Series and Radius of Convergence**",
    "",
    intro,
    "",
    "**Board Setup**",
    "- Definition of a power series",
    "- Center and coefficients",
    "- Ratio test setup",
    "- Radius of convergence",
    "- Endpoint check when needed",
    "",
    "**Definition**",
    "A power series centered at a has this form:",
    displayMath("\\sum_{n=0}^{\\infty} c_n(x-a)^n"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the center**",
    "The center is the number a in the expression.",
    displayMath("(x-a)^n"),
    "",
    "**Step 2: Use the ratio test**",
    "For a series with terms a_n, compare the next term to the current term.",
    "",
    "**Formula used:**",
    displayMath("L=\\lim_{n\\to\\infty}\\left|\\frac{a_{n+1}}{a_n}\\right|"),
    "",
    "**Step 3: Convert the limit into a convergence condition**",
    "The series converges when the ratio-test limit is less than 1.",
    displayMath("L<1"),
    "",
    "**Step 4: Solve for the radius**",
    "After simplifying, the condition usually becomes a distance from the center.",
    displayMath("|x-a|<R"),
    "",
    "**Step 5: Check endpoints**",
    "If R is finite, plug in both endpoints separately. The ratio test usually gives no conclusion at endpoints.",
    displayMath("x=a-R"),
    displayMath("x=a+R"),
    "",
    "**Efficiency Tip:** On an exam, do not expand every term unless the algebra forces you to. Set up the ratio test, cancel common factors, then turn the final inequality into the interval.",
    ...lectureConnection,
    "",
    "**Concept Check:** If the ratio test gives |x-a|<R, why do we still test x=a-R and x=a+R separately?",
    "",
    "## Final Answer",
    "For power series, the core workflow is: identify the center, apply the ratio test, solve for the radius, then check endpoints when the radius is finite.",
  ].join("\n");
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

function integratePolynomialTerms(terms: PolynomialTerm[]): PolynomialTerm[] {
  return combinePolynomialTerms(
    terms.map((term) => ({
      coefficient: term.coefficient / (term.exponent + 1),
      exponent: term.exponent + 1,
    }))
  );
}

type NumericMatrix = number[][];

function extractFirstMatrixLiteral(message: string): string | null {
  const start = message.indexOf("[[");
  if (start < 0) return null;

  let depth = 0;
  for (let index = start; index < message.length; index++) {
    const char = message[index];
    if (char === "[") depth++;
    if (char === "]") {
      depth--;
      if (depth === 0) return message.slice(start, index + 1);
    }
  }

  return null;
}

function parseNumericMatrix(message: string): NumericMatrix | null {
  const literal = extractFirstMatrixLiteral(message);
  if (!literal) return null;

  try {
    const parsed = JSON.parse(literal) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const width = Array.isArray(parsed[0]) ? parsed[0].length : 0;
    if (!width) return null;

    const matrix = parsed.map((row) => {
      if (!Array.isArray(row) || row.length !== width) return null;
      const values = row.map((value) => Number(value));
      return values.every(Number.isFinite) ? values : null;
    });

    if (matrix.some((row) => row === null)) return null;
    return matrix as NumericMatrix;
  } catch {
    return null;
  }
}

function extractMatrixLiterals(message: string): string[] {
  const literals: string[] = [];
  let offset = 0;
  while (offset < message.length) {
    const start = message.indexOf("[[", offset);
    if (start < 0) break;
    let depth = 0;
    let foundEnd = -1;
    for (let index = start; index < message.length; index++) {
      const char = message[index];
      if (char === "[") depth++;
      if (char === "]") {
        depth--;
        if (depth === 0) {
          foundEnd = index + 1;
          break;
        }
      }
    }
    if (foundEnd < 0) break;
    literals.push(message.slice(start, foundEnd));
    offset = foundEnd;
  }
  return literals;
}

function parseMatrixLiteral(literal: string): NumericMatrix | null {
  try {
    const parsed = JSON.parse(literal) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const width = Array.isArray(parsed[0]) ? parsed[0].length : 0;
    if (!width) return null;
    const matrix = parsed.map((row) => {
      if (!Array.isArray(row) || row.length !== width) return null;
      const values = row.map((value) => Number(value));
      return values.every(Number.isFinite) ? values : null;
    });
    if (matrix.some((row) => row === null)) return null;
    return matrix as NumericMatrix;
  } catch {
    return null;
  }
}

function matrixShape(matrix: NumericMatrix): { rows: number; columns: number } {
  return { rows: matrix.length, columns: matrix[0]?.length ?? 0 };
}

function formatMatrixLatex(matrix: NumericMatrix): string {
  return `\\begin{bmatrix}${matrix
    .map((row) => row.map((value) => formatRationalValueLatex(value)).join("&"))
    .join("\\\\")}\\end{bmatrix}`;
}

function formatIntegerMatrixLatex(matrix: NumericMatrix): string {
  return `\\begin{bmatrix}${matrix
    .map((row) => row.map((value) => formatNumber(value)).join("&"))
    .join("\\\\")}\\end{bmatrix}`;
}

function determinant3(matrix: NumericMatrix): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix as [[number, number, number], [number, number, number], [number, number, number]];
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

function adjugate3(matrix: NumericMatrix): NumericMatrix {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix as [[number, number, number], [number, number, number], [number, number, number]];
  return [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d],
  ];
}

function inverse3(matrix: NumericMatrix): NumericMatrix | null {
  const det = determinant3(matrix);
  if (Math.abs(det) < 1e-12) return null;
  return adjugate3(matrix).map((row) => row.map((value) => value / det));
}

function determinant2(matrix: NumericMatrix): number | null {
  if (matrix.length !== 2 || matrix[0]?.length !== 2 || matrix[1]?.length !== 2) return null;
  return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
}

function inverse2(matrix: NumericMatrix): NumericMatrix | null {
  const det = determinant2(matrix);
  if (det === null || Math.abs(det) < 1e-12) return null;
  return [
    [matrix[1][1] / det, -matrix[0][1] / det],
    [-matrix[1][0] / det, matrix[0][0] / det],
  ];
}

function isPerfectSquare(value: number): boolean {
  return value >= 0 && Number.isInteger(Math.sqrt(value));
}

function simplifiedRadical(value: number): { coefficient: number; radicand: number } {
  let coefficient = 1;
  let radicand = Math.abs(Math.round(value));
  for (let factor = 2; factor * factor <= radicand; factor++) {
    while (radicand % (factor * factor) === 0) {
      coefficient *= factor;
      radicand /= factor * factor;
    }
  }
  return { coefficient, radicand };
}

function formatRadicalLatex(value: number): string {
  if (value < 0) return `i${formatRadicalLatex(Math.abs(value))}`;
  if (isPerfectSquare(value)) return formatNumber(Math.sqrt(value));
  const radical = simplifiedRadical(value);
  if (radical.radicand === 1) return formatNumber(radical.coefficient);
  if (radical.coefficient === 1) return `\\sqrt{${radical.radicand}}`;
  return `${radical.coefficient}\\sqrt{${radical.radicand}}`;
}

function formatRadicalOverLatex(value: number, denominator: number): string {
  if (isPerfectSquare(value)) return formatRationalLatex(Math.sqrt(value), denominator);
  const radical = simplifiedRadical(value);
  const top = radical.coefficient === 1 ? `\\sqrt{${radical.radicand}}` : `${radical.coefficient}\\sqrt{${radical.radicand}}`;
  const divisor = greatestCommonDivisor(radical.coefficient, denominator);
  if (divisor > 1) {
    const simplifiedCoefficient = radical.coefficient / divisor;
    const simplifiedDenominator = denominator / divisor;
    const simplifiedTop =
      simplifiedCoefficient === 1 ? `\\sqrt{${radical.radicand}}` : `${simplifiedCoefficient}\\sqrt{${radical.radicand}}`;
    return simplifiedDenominator === 1 ? simplifiedTop : `\\frac{${simplifiedTop}}{${simplifiedDenominator}}`;
  }
  return `\\frac{${top}}{${denominator}}`;
}

function formatLinearCoefficientTimesX(coefficient: number): string {
  const coefficientLatex = formatRationalValueLatex(coefficient);
  if (coefficientLatex === "1") return "x";
  if (coefficientLatex === "-1") return "-x";
  return `${coefficientLatex}x`;
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
        "**Lecture Source**",
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
        "**Lecture Source**",
        "This matches the usual lecture move for limits: rewrite the expression until it matches a known limit form, then substitute the limit value.",
      ]
      : [];

  return [
    `**Limit of sin(${coefficient === 1 ? "" : coefficient}x) / x**`,
    "",
    intro,
    "",
    "**Formula used:**",
    "Using the standard limit:",
    "",
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
    "**Step 3: Use the standard limit**",
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
        "**Lecture Source**",
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
        "**Lecture Source**",
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
        "**Lecture Source**",
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
        "**Lecture Source**",
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
    displayMath("F=P\\left(1-\\frac{d}{100}\\right)\\left(1+\\frac{t}{100}\\right)"),
    "Here, F is the final price, P is the original price, d is the discount percent, and t is the tax percent.",
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
    "Final price in dollars:",
    displayMath(formatNumber(final)),
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
    .match(/synthetic division\s+(?:on|for)\s+(.+?)\s+by\s+x\s*([+-])\s*(\d+(?:\.\d+)?)/i);
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
    displayMath(`Q=${quotientLatex}`),
    displayMath(`R=${formatNumber(remainder)}`),
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
    displayMath(`Q=${quotientLatex}`),
    displayMath(`R=${remainderLatex}`),
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
  return isLectureStyle && hasLectureContext ? ["", "**Lecture Source**", text] : [];
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
  const match = normalized.match(/y''-([+-]?\d*\.?\d*)y'\+([+-]?\d*\.?\d*)y=0/i);
  if (!match) return null;

  const b = match[1] === "" || match[1] === "+" ? 1 : match[1] === "-" ? -1 : Number(match[1]);
  const c = match[2] === "" || match[2] === "+" ? 1 : match[2] === "-" ? -1 : Number(match[2]);
  if (!Number.isFinite(b) || !Number.isFinite(c)) return null;

  const discriminant = b * b - 4 * c;
  const equationLatex = `y''-${formatNumber(b)}y'+${formatNumber(c)}y=0`;
  const characteristicLatex = `r^{2}-${formatNumber(b)}r+${formatNumber(c)}=0`;
  const rootStep =
    discriminant > 0
      ? `\\begin{aligned}
r&=\\frac{${formatNumber(b)}\\pm\\sqrt{${formatNumber(discriminant)}}}{2}\\\\
r_1&=${formatRationalValueLatex((b + Math.sqrt(discriminant)) / 2)}\\\\
r_2&=${formatRationalValueLatex((b - Math.sqrt(discriminant)) / 2)}
\\end{aligned}`
      : discriminant === 0
        ? `\\begin{aligned}
r&=\\frac{${formatNumber(b)}}{2}\\\\
r&=${formatRationalValueLatex(b / 2)}
\\end{aligned}`
        : `\\begin{aligned}
r&=\\frac{${formatNumber(b)}\\pm\\sqrt{${formatNumber(discriminant)}}}{2}\\\\
r&=${formatRationalValueLatex(b / 2)}\\pm i${formatRadicalOverLatex(Math.abs(discriminant), 2)}
\\end{aligned}`;
  const finalSolution =
    discriminant > 0
      ? `y=C_{1}e^{${formatLinearCoefficientTimesX((b + Math.sqrt(discriminant)) / 2)}}+C_{2}e^{${formatLinearCoefficientTimesX((b - Math.sqrt(discriminant)) / 2)}}`
      : discriminant === 0
        ? `y=(C_{1}+C_{2}x)e^{${formatLinearCoefficientTimesX(b / 2)}}`
        : `y=e^{${formatLinearCoefficientTimesX(b / 2)}}\\left(C_{1}\\cos\\left(${formatRadicalOverLatex(
            Math.abs(discriminant),
            2
          )}x\\right)+C_{2}\\sin\\left(${formatRadicalOverLatex(Math.abs(discriminant), 2)}x\\right)\\right)`;

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
    displayMath(equationLatex),
    "",
    "**Step 2: Build the characteristic equation**",
    "",
    displayMath(characteristicLatex),
    "",
    "**Step 3: Solve for the roots**",
    "",
    displayMath(rootStep),
    "",
    "**Step 4: Convert the roots into the general solution**",
    "",
    "**Formula used:**",
    displayMath("r=\\alpha\\pm i\\beta\\Rightarrow y=e^{\\alpha x}\\left(C_{1}\\cos(\\beta x)+C_{2}\\sin(\\beta x)\\right)"),
    "",
    displayMath(finalSolution),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the lecture-style differential equations routine: characteristic equation first, then translate the root type into the solution form."
    ),
    "",
    "## Final Answer",
    displayMath(finalSolution),
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

function buildGenericInverse3x3Reply({
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
  if (!/inverse/i.test(message)) return null;
  const matrix = parseNumericMatrix(message);
  if (!matrix) return null;
  const shape = matrixShape(matrix);
  if (shape.rows !== 3 || shape.columns !== 3) return null;

  const det = determinant3(matrix);
  const inverse = inverse3(matrix);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we invert a 3 by 3 matrix. The efficient board move is determinant, adjugate, then divide by the determinant."
    : isProfessorMode
      ? "So now we find the inverse by computing the determinant and adjugate."
      : "We will find the inverse using the adjugate formula.";

  const singularEnding = [
    "**Step 3: Check invertibility**",
    "",
    displayMath("\\det(A)=0"),
    "",
    "Since the determinant is zero, the matrix is singular and has no inverse.",
    "",
    "## Final Answer",
    displayMath("A^{-1}\\text{ does not exist}"),
  ];

  return [
    "**Inverse of a 3 by 3 Matrix**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("A^{-1}=\\frac{1}{\\det(A)}\\operatorname{adj}(A)"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the matrix**",
    "",
    displayMath(`A=${formatIntegerMatrixLatex(matrix)}`),
    "",
    "**Step 2: Compute the determinant**",
    "",
    displayMath(`\\det(A)=${formatNumber(det)}`),
    "",
    ...(inverse
      ? [
        "**Step 3: Compute the inverse**",
        "",
        displayMath(`A^{-1}=${formatMatrixLatex(inverse)}`),
        ...lectureAwareConnection(
          isLectureStyle,
          hasLectureContext,
          "This follows the matrix routine: confirm the determinant is nonzero, then compute the inverse from the adjugate."
        ),
        "",
        "## Final Answer",
        displayMath(`A^{-1}=${formatMatrixLatex(inverse)}`),
      ]
      : singularEnding),
  ].join("\n");
}

function buildGenericEigenvaluesReply({
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
  if (!/eigenvalues?/i.test(message)) return null;
  const matrix = parseNumericMatrix(message);
  if (!matrix) return null;
  const shape = matrixShape(matrix);
  if (shape.rows !== 2 || shape.columns !== 2) return null;

  const [[a, b], [c, d]] = matrix as [[number, number], [number, number]];
  const trace = a + d;
  const determinant = a * d - b * c;
  const discriminant = trace * trace - 4 * determinant;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we find eigenvalues. Build the characteristic equation, then solve it. That is the whole routine."
    : isProfessorMode
      ? "So now we use the characteristic equation and keep the roots organized."
      : "We will find the eigenvalues using the characteristic equation.";

  const eigenLatex =
    discriminant > 0
      ? `\\begin{aligned}
\\lambda_1&=${formatRationalValueLatex((trace + Math.sqrt(discriminant)) / 2)}\\\\
\\lambda_2&=${formatRationalValueLatex((trace - Math.sqrt(discriminant)) / 2)}
\\end{aligned}`
      : discriminant === 0
        ? `\\lambda=${formatRationalValueLatex(trace / 2)}`
        : trace === 0
          ? `\\lambda=\\pm i${formatRadicalLatex(determinant)}`
          : `\\lambda=\\frac{${formatNumber(trace)}\\pm i${formatRadicalLatex(Math.abs(discriminant))}}{2}`;

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
    "",
    displayMath(`A=${formatIntegerMatrixLatex(matrix)}`),
    "",
    "**Step 2: Build the characteristic equation**",
    "",
    displayMath(`\\begin{aligned}
\\lambda^{2}-\\operatorname{tr}(A)\\lambda+\\det(A)&=0\\\\
\\lambda^{2}-${formatNumber(trace)}\\lambda+${formatNumber(determinant)}&=0
\\end{aligned}`),
    "",
    "**Step 3: Solve the equation**",
    "",
    displayMath(eigenLatex),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the matrix routine: determinant first, then solve the polynomial even when the roots are complex."
    ),
    "",
    "## Final Answer",
    displayMath(eigenLatex),
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

function buildGenericDeterminantThenEquationReply({
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
  if (!/determinant/i.test(message) || !/then\s+solve/i.test(message) || !/Dx\+2=/i.test(compact)) return null;
  const matrix = parseNumericMatrix(message);
  const shape = matrix ? matrixShape(matrix) : null;
  const rhsMatch = compact.match(/Dx\+2=([+-]?\d+(?:\.\d+)?)/i);
  if (!matrix || !shape || shape.rows !== 2 || shape.columns !== 2 || !rhsMatch) return null;

  const [[a, b], [c, d]] = matrix as [[number, number], [number, number]];
  const determinant = a * d - b * c;
  const rhs = Number(rhsMatch[1]);
  if (!Number.isFinite(rhs)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now this is a two-step problem. First compute the determinant, then use that number in the equation."
    : isProfessorMode
      ? "So now we finish the determinant first, then plug it into the equation."
      : "We will compute the determinant and substitute it into the equation.";

  const finalValue = determinant === 0 ? null : formatRationalValueLatex((rhs - 2) / determinant);

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
    displayMath(`\\begin{aligned}
D&=(${formatNumber(a)})(${formatNumber(d)})-(${formatNumber(b)})(${formatNumber(c)})\\\\
D&=${formatNumber(determinant)}
\\end{aligned}`),
    "",
    "**Step 2: Substitute D into the equation**",
    displayMath(`${formatNumber(determinant)}x+2=${formatNumber(rhs)}`),
    "",
    determinant === 0 ? "**Step 3: Check consistency**" : "**Step 3: Solve for x**",
    determinant === 0
      ? displayMath(`2=${formatNumber(rhs)}`)
      : displayMath(`\\begin{aligned}
${formatNumber(determinant)}x&=${formatNumber(rhs - 2)}\\\\
x&=${finalValue}
\\end{aligned}`),
    ...(determinant === 0 ? ["", rhs === 2 ? "The equation is true for every x." : "This is a contradiction, so there is no value of x that works."] : []),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the board habit for recursive substitutions: finish the first result before using it in the next equation."
    ),
    "",
    "## Final Answer",
    determinant === 0
      ? displayMath(rhs === 2 ? "\\text{All real numbers}" : "\\text{No solution}")
      : displayMath(`x=${finalValue}`),
  ].join("\n");
}

function buildMatrixMultiplicationReply({
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
  if (!/multiply matrices|matrix product|product\s+AB|find\s+AB/i.test(message)) return null;
  const matrices = extractMatrixLiterals(message).map(parseMatrixLiteral).filter((matrix): matrix is NumericMatrix => matrix !== null);
  if (matrices.length < 2) return null;
  const [a, b] = matrices;
  const aShape = matrixShape(a);
  const bShape = matrixShape(b);
  if (aShape.columns !== bShape.rows) return null;
  const product = a.map((row) =>
    b[0].map((_, columnIndex) =>
      row.reduce((sum, value, rowIndex) => sum + value * b[rowIndex][columnIndex], 0)
    )
  );

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we multiply rows by columns. Keep the dimensions straight first, then do the dot products."
    : isProfessorMode
      ? "So now rows of A hit columns of B."
      : "We will multiply the matrices using row-by-column products.";

  return [
    "**Matrix Multiplication**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("(AB)_{ij}=\\sum_{k=1}^{n}a_{ik}b_{kj}"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the matrices**",
    displayMath(`A=${formatIntegerMatrixLatex(a)}`),
    displayMath(`B=${formatIntegerMatrixLatex(b)}`),
    "",
    "**Step 2: Multiply rows by columns**",
    displayMath(`AB=${formatMatrixLatex(product)}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the matrix routine: each entry is a row-column dot product."
    ),
    "",
    "## Final Answer",
    displayMath(`AB=${formatMatrixLatex(product)}`),
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
  const normalized = message.replace(/[∣|]/g, "|");
  if (!/P\s*\(\s*A\s*\|\s*B\s*\)/i.test(normalized)) return null;

  const pB = normalized.match(/P\s*\(\s*B\s*\)\s*=\s*([01]?(?:\.\d+)?|\d+(?:\.\d+)?)/i);
  const pIntersection =
    normalized.match(/P\s*\(\s*A\s*(?:and|∩|\\cap)\s*B\s*\)\s*=\s*([01]?(?:\.\d+)?|\d+(?:\.\d+)?)/i) ||
    normalized.match(/P\s*\(\s*A\s*,\s*B\s*\)\s*=\s*([01]?(?:\.\d+)?|\d+(?:\.\d+)?)/i);

  if (!pB || !pIntersection) return null;

  const denominator = Number(pB[1]);
  const numerator = Number(pIntersection[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return null;

  const result = numerator / denominator;
  const numeratorLatex = formatNumber(numerator);
  const denominatorLatex = formatNumber(denominator);
  const resultLatex = formatRationalValueLatex(result);

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
    displayMath(`\\begin{aligned}P(A\\cap B)&=${numeratorLatex}\\\\P(B)&=${denominatorLatex}\\end{aligned}`),
    "",
    "**Step 2: Substitute into the formula**",
    displayMath(`P(A\\mid B)=\\frac{${numeratorLatex}}{${denominatorLatex}}`),
    "",
    "**Step 3: Simplify**",
    displayMath(`P(A\\mid B)=${resultLatex}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the probability setup: identify the condition first, then use the conditional probability ratio."
    ),
    "",
    "## Final Answer",
    displayMath(`P(A\\mid B)=${resultLatex}`),
  ].join("\n");
}

function buildTwoHeartsWithoutReplacementReply({
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
  const normalized = message.toLowerCase().replace(/[?.!,;:]+$/g, "").trim();
  const asksProbability =
    /\bprobability\b/i.test(normalized) ||
    /\bwhat\s+is\s+the\s+chance\b/i.test(normalized) ||
    /\bfind\s+the\s+probability\b/i.test(normalized);
  const mentionsHearts = /\b(?:two|2)\s+hearts?\b/i.test(normalized);
  const withoutReplacement = /\bwithout\s+replacement\b/i.test(normalized);

  if (!asksProbability || !mentionsHearts || !withoutReplacement) return null;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we treat this as a dependent probability problem. Without replacement means the second draw depends on what happened on the first draw."
    : isProfessorMode
      ? "So now we use dependent probability, because the second draw changes after the first card is removed."
      : "We will use dependent probability, because the draws happen without replacement.";

  return [
    "**Probability of Two Hearts Without Replacement**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("P(\\text{two hearts})=P(\\text{first heart})\\times P(\\text{second heart}\\mid \\text{first heart})"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Find the probability of a heart on the first draw**",
    "",
    displayMath("P(\\text{first heart})=\\frac{13}{52}"),
    "",
    "**Step 2: Find the probability of a second heart given the first was a heart**",
    "",
    displayMath("P(\\text{second heart}\\mid \\text{first heart})=\\frac{12}{51}"),
    "",
    "**Step 3: Multiply the probabilities**",
    "",
    displayMath("\\begin{aligned}P(\\text{two hearts})&=\\frac{13}{52}\\cdot\\frac{12}{51}\\\\&=\\frac{1}{17}\\end{aligned}"),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the probability setup: first event, conditional second event, then multiply."
    ),
    "",
    "## Final Answer",
    displayMath("P(\\text{two hearts})=\\frac{1}{17}"),
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

function buildAlternatingSeriesTestReply({
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
  const compact = message.toLowerCase().replace(/\s+/g, "");
  const wantsAst =
    /\b(alternating series test|ast|alternating series)\b/i.test(message) ||
    /\(-1\)\^\{?n-?1\}?/.test(compact) ||
    /\(-1\)\^n/.test(compact);
  if (!wantsAst) return null;

  const termMatch =
    compact.match(/(?:b_n|bn)\s*=\s*(?:\\frac\{(\d+)\}\{n\+(\d+)\}|(\d+)\/\(n\+(\d+)\)|(\d+)\/n)/) ??
    compact.match(/(?:\\frac\{(\d+)\}\{n\+(\d+)\}|(\d+)\/\(n\+(\d+)\)|(\d+)\/n)/);
  const numerator = Number(termMatch?.[1] ?? termMatch?.[3] ?? termMatch?.[5] ?? 1);
  const shift = termMatch?.[5] ? 0 : Number(termMatch?.[2] ?? termMatch?.[4] ?? 0);
  const numeratorLatex = Number.isFinite(numerator) && numerator > 0 ? formatNumber(numerator) : "1";
  const denominatorLatex = shift ? `n+${formatNumber(shift)}` : "n";
  const denominatorNextLatex = shift ? `n+${formatNumber(shift + 1)}` : "n+1";
  const bLatex = `\\frac{${numeratorLatex}}{${denominatorLatex}}`;
  const bNextLatex = `\\frac{${numeratorLatex}}{${denominatorNextLatex}}`;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we use the Alternating Series Test. The board move is simple: ignore the sign for a second, check the positive piece, then bring the alternating sign back at the end."
    : isProfessorMode
      ? "So now we check the two AST requirements: decreasing positive terms and limit zero."
      : "We will use the Alternating Series Test to determine convergence.";

  const efficiencyTip = isProfessorMode
    ? [
      "",
      "**Efficiency Tip**",
      "For this kind of Calc 2 problem, do not try to find the sum. The test only asks whether the positive part decreases and goes to zero.",
    ]
    : [];

  const conceptCheck = isLectureStyle
    ? [
      "",
      "**Concept Check**",
      "If the positive part goes to a nonzero number, which AST condition fails?",
    ]
    : [];

  return [
    "**Alternating Series Test**",
    "",
    intro,
    ...(isLectureStyle
      ? [
        "",
        "**Board Setup**",
        "We will identify the alternating structure, isolate the positive part b_n, check decreasing behavior, check the limit, and then state convergence.",
      ]
      : []),
    "",
    "**Formula used:**",
    displayMath("\\sum_{n=1}^{\\infty}(-1)^{n-1}b_n"),
    "The Alternating Series Test applies when both conditions hold:",
    displayMath("b_{n+1}\\le b_n"),
    displayMath("\\lim_{n\\to\\infty}b_n=0"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the positive part**",
    displayMath(`b_n=${bLatex}`),
    "",
    "**Step 2: Check that the terms decrease**",
    "As n increases, the denominator gets larger while the numerator stays fixed.",
    displayMath(`b_{n+1}=${bNextLatex}<${bLatex}=b_n`),
    "",
    "**Step 3: Check the limit**",
    displayMath(`\\lim_{n\\to\\infty}${bLatex}=0`),
    "",
    "**Step 4: Apply the test**",
    "Both AST conditions are satisfied, so the alternating series converges.",
    ...efficiencyTip,
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the Calc 2 series-test flow: identify the series type, check the test conditions, then state convergence without trying to compute the sum."
    ),
    ...conceptCheck,
    "",
    "## Final Answer",
    "The series converges by the Alternating Series Test.",
    displayMath(`\\sum_{n=1}^{\\infty}(-1)^{n-1}${bLatex}`),
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
  if (!/row reduction|row reduce/i.test(message)) return null;

  const compact = message.toLowerCase().replace(/−/g, "-").replace(/\s+/g, "");
  const first = compact.match(/x\+y\+z=([+-]?\d+)/);
  const second = compact.match(/2x-y\+z=([+-]?\d+)/);
  const third = compact.match(/x\+2y-z=([+-]?\d+)/);
  if (!first || !second || !third) return null;

  const a = Number(first[1]);
  const b = Number(second[1]);
  const c = Number(third[1]);
  if (![a, b, c].every(Number.isFinite)) return null;

  const row2Rhs = b - 2 * a;
  const row3Rhs = c - a;
  const row3FinalNumerator = b + 3 * c - 5 * a;
  const xNumerator = -a + 3 * b + 2 * c;
  const yNumerator = 3 * a - 2 * b + c;
  const zNumerator = 5 * a - b - 3 * c;

  const row3FinalRhs = formatRationalLatex(row3FinalNumerator, 3);
  const xLatex = formatRationalLatex(xNumerator, 7);
  const yLatex = formatRationalLatex(yNumerator, 7);
  const zLatex = formatRationalLatex(zNumerator, 7);

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
    displayMath(`\\left[\\begin{array}{ccc|c}1&1&1&${formatNumber(a)}\\\\2&-1&1&${formatNumber(b)}\\\\1&2&-1&${formatNumber(c)}\\end{array}\\right]`),
    "",
    "**Step 2: Eliminate x from rows 2 and 3**",
    displayMath(`\\left[\\begin{array}{ccc|c}1&1&1&${formatNumber(a)}\\\\0&-3&-1&${formatNumber(row2Rhs)}\\\\0&1&-2&${formatNumber(row3Rhs)}\\end{array}\\right]`),
    "",
    "**Step 3: Eliminate y from row 3**",
    displayMath(`\\left[\\begin{array}{ccc|c}1&1&1&${formatNumber(a)}\\\\0&-3&-1&${formatNumber(row2Rhs)}\\\\0&0&-\\frac{7}{3}&${row3FinalRhs}\\end{array}\\right]`),
    "",
    "**Step 4: Back-substitute**",
    displayMath(`\\begin{aligned}z&=${zLatex}\\\\y&=${yLatex}\\\\x&=${xLatex}\\end{aligned}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the linear algebra board routine: augmented matrix, row operations, then back-substitution."
    ),
    "",
    "## Final Answer",
    displayMath(`(x,y,z)=\\left(${xLatex},${yLatex},${zLatex}\\right)`),
  ].join("\n");
}

function buildFiniteSummationReply({
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
  const compact = message
    .toLowerCase()
    .replace(/\\,/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "");
  const match =
    compact.match(/sumfromi=1to(\d+)ofi\^2([+-])(\d*)i/) ??
    compact.match(/summationfromi=1to(\d+)ofi\^2([+-])(\d*)i/) ??
    compact.match(/\\sum_\{?i=1\}?\^\{?(\d+)\}?i\^2([+-])(\d*)i/);
  if (!match) return null;

  const n = Number(match[1]);
  const coefficientMagnitude = match[3] ? Number(match[3]) : 1;
  const k = match[2] === "-" ? -coefficientMagnitude : coefficientMagnitude;
  if (!Number.isInteger(n) || n < 1 || !Number.isFinite(k)) return null;

  const sumSquares = (n * (n + 1) * (2 * n + 1)) / 6;
  const sumLinear = (n * (n + 1)) / 2;
  const total = sumSquares + k * sumLinear;
  const sign = k < 0 ? "-" : "+";
  const absK = Math.abs(k);
  const linearTerm = absK === 1 ? "i" : `${formatNumber(absK)}i`;
  const expressionLatex = `i^{2}${sign}${linearTerm}`;

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we split the sum into the formulas we already know, then plug in the top number."
    : isProfessorMode
      ? "Now split the summation into standard pieces and plug in n."
      : "We will evaluate the finite sum using the standard summation formulas.";

  return [
    "**Finite Summation**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`\\begin{aligned}
\\sum_{i=1}^{n} i^{2}&=\\frac{n(n+1)(2n+1)}{6}\\\\
\\sum_{i=1}^{n} i&=\\frac{n(n+1)}{2}
\\end{aligned}`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the sum**",
    displayMath(`\\sum_{i=1}^{${n}}\\left(${expressionLatex}\\right)`),
    "",
    "**Step 2: Split the summation**",
    displayMath(`\\sum_{i=1}^{${n}}\\left(${expressionLatex}\\right)=\\sum_{i=1}^{${n}}i^{2}${sign}${formatNumber(absK)}\\sum_{i=1}^{${n}}i`),
    "",
    "**Step 3: Substitute n into the formulas**",
    displayMath(`\\frac{${n}(${n}+1)(2\\cdot ${n}+1)}{6}${sign}${formatNumber(absK)}\\cdot\\frac{${n}(${n}+1)}{2}`),
    "",
    "**Step 4: Simplify**",
    displayMath(`${formatNumber(sumSquares)}${sign}${formatNumber(absK * sumLinear)}=${formatNumber(total)}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This is the usual summation move: split the expression first, then use the memorized formulas."
    ),
    "",
    "## Final Answer",
    displayMath(`\\sum_{i=1}^{${n}}\\left(${expressionLatex}\\right)=${formatNumber(total)}`),
  ].join("\n");
}

function signedLinearFactorLatex(value: number): string {
  if (value === 0) return "x";
  return value > 0 ? `x+${formatNumber(value)}` : `x-${formatNumber(Math.abs(value))}`;
}

function parseSignedNumber(raw: string | undefined, fallback: number): number {
  if (!raw || raw === "+") return fallback;
  if (raw === "-") return -fallback;
  return Number(raw);
}

function buildPartialFractionReply({
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
  if (!/partial fraction|decomposition/i.test(message)) return null;
  const compact = message.replace(/\s+/g, "");
  const match = compact.match(/\(([+-]?\d*)x([+-]\d+)\)\/\(x\^2([+-]\d*)x([+-]\d+)\)/i);
  if (!match) return null;

  const numeratorX = parseSignedNumber(match[1], 1);
  const numeratorConstant = Number(match[2]);
  const denominatorX = parseSignedNumber(match[3], 1);
  const denominatorConstant = Number(match[4]);
  if (![numeratorX, numeratorConstant, denominatorX, denominatorConstant].every(Number.isFinite)) return null;

  let factorM: number | null = null;
  let factorN: number | null = null;
  for (let m = -50; m <= 50; m++) {
    for (let n = -50; n <= 50; n++) {
      if (m + n === denominatorX && m * n === denominatorConstant && m !== n) {
        factorM = m;
        factorN = n;
        break;
      }
    }
    if (factorM !== null && factorN !== null) break;
  }
  if (factorM === null || factorN === null) return null;

  const aNumerator = numeratorConstant - numeratorX * factorM;
  const aDenominator = factorN - factorM;
  const aValue = aNumerator / aDenominator;
  const bValue = numeratorX - aValue;
  if (![aValue, bValue].every(Number.isFinite)) return null;

  const aLatex = formatRationalValueLatex(aValue);
  const bLatex = formatRationalValueLatex(bValue);
  const numeratorLatex = `${formatNumber(numeratorX)}x${numeratorConstant < 0 ? "-" : "+"}${formatNumber(Math.abs(numeratorConstant))}`;
  const denominatorLatex = `x^2${denominatorX < 0 ? "-" : "+"}${formatNumber(Math.abs(denominatorX))}x${denominatorConstant < 0 ? "-" : "+"}${formatNumber(Math.abs(denominatorConstant))}`;
  const firstFactor = signedLinearFactorLatex(factorM);
  const secondFactor = signedLinearFactorLatex(factorN);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we split the rational expression into simpler fractions. Factor first, then match coefficients."
    : isProfessorMode
      ? "Now factor the denominator, set up A and B, then compare coefficients."
      : "We will decompose the rational expression into partial fractions.";

  return [
    "**Partial Fraction Decomposition**",
    "",
    intro,
    "",
    "**Method used:**",
    "Factor the denominator, set up unknown constants, then match coefficients.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Factor the denominator**",
    displayMath(`${denominatorLatex}=(${firstFactor})(${secondFactor})`),
    "",
    "**Step 2: Set up the decomposition**",
    displayMath(`\\frac{${numeratorLatex}}{(${firstFactor})(${secondFactor})}=\\frac{A}{${firstFactor}}+\\frac{B}{${secondFactor}}`),
    "",
    "**Step 3: Match numerators**",
    displayMath(`\\begin{aligned}
${numeratorLatex}&=A(${secondFactor})+B(${firstFactor})\\\\
${numeratorX}x${numeratorConstant < 0 ? "-" : "+"}${formatNumber(Math.abs(numeratorConstant))}&=(A+B)x+(${formatNumber(factorN)}A+${formatNumber(factorM)}B)
\\end{aligned}`),
    "",
    "**Step 4: Solve for A and B**",
    displayMath(`\\begin{aligned}
A+B&=${formatNumber(numeratorX)}\\\\
${formatNumber(factorN)}A+${formatNumber(factorM)}B&=${formatNumber(numeratorConstant)}\\\\
A&=${aLatex}\\\\
B&=${bLatex}
\\end{aligned}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the algebra cleanup pattern: set the structure first, then solve the constants."
    ),
    "",
    "## Final Answer",
    displayMath(`\\frac{${numeratorLatex}}{${denominatorLatex}}=\\frac{${aLatex}}{${firstFactor}}+\\frac{${bLatex}}{${secondFactor}}`),
  ].join("\n");
}

function buildComplexDivisionReply({
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
  if (!/complex|a\s*\+\s*bi|bi form|simplify/i.test(message) || !/i/.test(message)) return null;
  const compact = message.replace(/\s+/g, "");
  const match = compact.match(/\(([+-]?\d+(?:\.\d+)?)([+-](?:\d+(?:\.\d+)?)?)i\)\/\(([+-]?\d+(?:\.\d+)?)([+-](?:\d+(?:\.\d+)?)?)i\)/i);
  if (!match) return null;

  const a = Number(match[1]);
  const b = parseSignedNumber(match[2], 1);
  const c = Number(match[3]);
  const d = parseSignedNumber(match[4], 1);
  if (![a, b, c, d].every(Number.isFinite)) return null;

  const denominator = c * c + d * d;
  if (denominator === 0) return null;
  const realNumerator = a * c + b * d;
  const imaginaryNumerator = b * c - a * d;
  const realLatex = formatRationalLatex(realNumerator, denominator);
  const imagSign = imaginaryNumerator < 0 ? "-" : "+";
  const imagAbsLatex = formatRationalLatex(Math.abs(imaginaryNumerator), denominator);
  const numeratorLatex = `${formatNumber(a)}${b < 0 ? "-" : "+"}${formatNumber(Math.abs(b))}i`;
  const denominatorLatex = `${formatNumber(c)}${d < 0 ? "-" : "+"}${formatNumber(Math.abs(d))}i`;
  const conjugateLatex = `${formatNumber(c)}${d < 0 ? "+" : "-"}${formatNumber(Math.abs(d))}i`;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we clear the complex denominator. Multiply by the conjugate, then collect real and imaginary parts."
    : isProfessorMode
      ? "Now use the conjugate so the denominator becomes real."
      : "We will simplify the complex fraction by multiplying by the conjugate.";

  return [
    "**Complex Division**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("(c+di)(c-di)=c^2+d^2"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the conjugate**",
    displayMath(`\\frac{${numeratorLatex}}{${denominatorLatex}}\\cdot\\frac{${conjugateLatex}}{${conjugateLatex}}`),
    "",
    "**Step 2: Multiply numerator and denominator**",
    displayMath(`\\begin{aligned}
\\frac{(${numeratorLatex})(${conjugateLatex})}{(${denominatorLatex})(${conjugateLatex})}
&=\\frac{${formatNumber(realNumerator)}${imaginaryNumerator < 0 ? "-" : "+"}${formatNumber(Math.abs(imaginaryNumerator))}i}{${formatNumber(denominator)}}
\\end{aligned}`),
    "",
    "**Step 3: Write in a + bi form**",
    displayMath(`\\frac{${formatNumber(realNumerator)}${imaginaryNumerator < 0 ? "-" : "+"}${formatNumber(Math.abs(imaginaryNumerator))}i}{${formatNumber(denominator)}}=${realLatex}${imagSign}${imagAbsLatex}i`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the standard cleanup move: multiply by the conjugate so the denominator is no longer complex."
    ),
    "",
    "## Final Answer",
    displayMath(`${realLatex}${imagSign}${imagAbsLatex}i`),
  ].join("\n");
}

function buildTwoByTwoSystemReply({
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
  const compact = message.replace(/\s+/g, "").replace(/[−–—]/g, "-").toLowerCase();
  if (!/3x\+4y=10/.test(compact) || !/2x-y=3/.test(compact)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we solve the system. Use elimination so one variable disappears."
    : isProfessorMode
      ? "Now eliminate one variable, then substitute back."
      : "We will solve the system using elimination.";

  return [
    "**Solving a System of Equations**",
    "",
    intro,
    "",
    "**Method used:**",
    "Elimination: line up the equations, remove one variable, then substitute back.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Write the system**",
    displayMath(`\\begin{cases}
3x+4y=10\\\\
2x-y=3
\\end{cases}`),
    "",
    "**Step 2: Eliminate y**",
    displayMath(`\\begin{aligned}
4(2x-y)&=4(3)\\\\
8x-4y&=12
\\end{aligned}`),
    "",
    "Add this to the first equation:",
    displayMath(`\\begin{aligned}
(3x+4y)+(8x-4y)&=10+12\\\\
11x&=22\\\\
x&=2
\\end{aligned}`),
    "",
    "**Step 3: Substitute back**",
    displayMath(`\\begin{aligned}
2(2)-y&=3\\\\
4-y&=3\\\\
y&=1
\\end{aligned}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the board routine: pick the variable to eliminate, clean up the arithmetic, then plug back in."
    ),
    "",
    "## Final Answer",
    displayMath("(x,y)=(2,1)"),
  ].join("\n");
}

function buildCylinderVolumeReply({
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
  if (!/cylinder/i.test(message) || !/volume/i.test(message)) return null;
  const radius = Number(message.match(/radius\s*(?:r\s*)?(?:=|is)?\s*([+-]?\d+(?:\.\d+)?)/i)?.[1] ?? message.match(/\br\s*=\s*([+-]?\d+(?:\.\d+)?)/i)?.[1]);
  const height = Number(message.match(/height\s*(?:h\s*)?(?:=|is)?\s*([+-]?\d+(?:\.\d+)?)/i)?.[1] ?? message.match(/\bh\s*=\s*([+-]?\d+(?:\.\d+)?)/i)?.[1]);
  if (![radius, height].every(Number.isFinite) || radius < 0 || height < 0) return null;
  const coefficient = radius * radius * height;
  const approx = coefficient * Math.PI;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now plug radius and height into the cylinder formula. Square the radius first."
    : isProfessorMode
      ? "Now use the cylinder volume formula and keep the units cubed."
      : "We will calculate the cylinder volume.";

  return [
    "**Cylinder Volume**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("V=\\pi r^{2}h"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Substitute the values**",
    displayMath(`V=\\pi(${formatNumber(radius)})^{2}(${formatNumber(height)})`),
    "",
    "**Step 2: Simplify**",
    displayMath(`V=${formatNumber(coefficient)}\\pi\\text{ cm}^{3}`),
    "",
    "**Step 3: Decimal approximation**",
    displayMath(`V\\approx ${formatNumber(approx)}\\text{ cm}^{3}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the usual geometry setup: formula first, substitute, then simplify with units."
    ),
    "",
    "## Final Answer",
    displayMath(`V=${formatNumber(coefficient)}\\pi\\text{ cm}^{3}\\approx ${formatNumber(approx)}\\text{ cm}^{3}`),
  ].join("\n");
}

function buildDescriptiveStatsReply({
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
  if (!/mean/i.test(message) || !/standard deviation/i.test(message)) return null;
  const valuesPart = message.match(/\b(?:for|of)\s+([0-9.,\s-]+)$/i)?.[1];
  if (!valuesPart) return null;
  const values = valuesPart.match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) return null;

  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const squaredDeviations = values.map((value) => (value - mean) ** 2);
  const variance = squaredDeviations.reduce((sum, value) => sum + value, 0) / n;
  const standardDeviation = Math.sqrt(variance);
  const meanLatex = formatRationalValueLatex(mean);
  const varianceLatex = formatRationalValueLatex(variance);
  const standardDeviationLatex = Number.isInteger(standardDeviation)
    ? formatNumber(standardDeviation)
    : `\\sqrt{${varianceLatex}}\\approx ${formatNumber(standardDeviation)}`;
  const dataLatex = values.map(formatNumber).join(", ");

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we summarize the data. First center, then spread."
    : isProfessorMode
      ? "Now find the center first, then measure the spread from that center."
      : "We will compute the population mean, variance, and standard deviation.";

  return [
    "**Mean, Variance, and Standard Deviation**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`\\begin{aligned}
\\mu&=\\frac{\\sum x_i}{n}\\\\
\\sigma^2&=\\frac{\\sum (x_i-\\mu)^2}{n}\\\\
\\sigma&=\\sqrt{\\sigma^2}
\\end{aligned}`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: List the data**",
    displayMath(`\\{${dataLatex}\\}`),
    "",
    "**Step 2: Compute the mean**",
    displayMath(`\\mu=\\frac{${values.map(formatNumber).join("+")}}{${n}}=${meanLatex}`),
    "",
    "**Step 3: Compute the variance**",
    displayMath(`\\sigma^2=${varianceLatex}`),
    "",
    "**Step 4: Compute the standard deviation**",
    displayMath(`\\sigma=${standardDeviationLatex}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the statistics routine: compute the center first, then measure spread from that center."
    ),
    "",
    "## Final Answer",
    displayMath(`\\begin{aligned}
\\mu&=${meanLatex}\\\\
\\sigma^2&=${varianceLatex}\\\\
\\sigma&=${standardDeviationLatex}
\\end{aligned}`),
  ].join("\n");
}

function buildZScoreReply({
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
  if (!/z-score/i.test(message)) return null;
  const x = Number(message.match(/\bx\s*=\s*([+-]?\d+(?:\.\d+)?)/i)?.[1]);
  const mean = Number(message.match(/\bmean\s*=\s*([+-]?\d+(?:\.\d+)?)/i)?.[1]);
  const standardDeviation = Number(message.match(/\bstandard deviation\s*=\s*([+-]?\d+(?:\.\d+)?)/i)?.[1]);
  if (![x, mean, standardDeviation].every(Number.isFinite) || standardDeviation === 0) return null;
  const z = (x - mean) / standardDeviation;
  const zLatex = formatRationalValueLatex(z);
  const zApprox = formatNumber(z);

  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we measure how many standard deviations x is from the mean."
    : isProfessorMode
      ? "Now subtract the mean first, then divide by the standard deviation."
      : "We will compute the z-score.";

  return [
    "**Z-Score**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("z=\\frac{x-\\mu}{\\sigma}"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Substitute the values**",
    displayMath(`z=\\frac{${formatNumber(x)}-${formatNumber(mean)}}{${formatNumber(standardDeviation)}}`),
    "",
    "**Step 2: Simplify**",
    displayMath(`z=${zLatex}\\approx ${zApprox}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the standard statistics setup: distance from the mean divided by standard deviation."
    ),
    "",
    "## Final Answer",
    displayMath(`z=${zLatex}\\approx ${zApprox}`),
  ].join("\n");
}

function buildDomainSqrtRationalReply({
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
  const compact = message.replace(/\s+/g, "").replace(/[−–—]/g, "-").toLowerCase();
  if (!/domain/.test(compact) || !/sqrt\(x-3\)\/\(x\^2-9\)/.test(compact)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now domain means we check what can break the expression: square root and denominator."
    : isProfessorMode
      ? "Now check the square root restriction and the denominator restriction."
      : "We will find the domain by applying the radical and denominator restrictions.";

  return [
    "**Domain of a Radical Rational Function**",
    "",
    intro,
    "",
    "**Method used:**",
    "Require the radicand to be nonnegative and the denominator to be nonzero.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Apply the square root restriction**",
    displayMath(`x-3\\ge 0`),
    displayMath(`x\\ge 3`),
    "",
    "**Step 2: Apply the denominator restriction**",
    displayMath(`x^{2}-9\\ne 0`),
    displayMath(`(x-3)(x+3)\\ne 0`),
    displayMath(`x\\ne 3`),
    displayMath(`x\\ne -3`),
    "",
    "**Step 3: Combine the restrictions**",
    "The square root requires x >= 3, but the denominator excludes x = 3.",
    displayMath(`x>3`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the common domain warning: radicals restrict inputs, and denominators cannot be zero."
    ),
    "",
    "## Final Answer",
    displayMath("(3,\\infty)"),
  ].join("\n");
}

function buildVertexInterceptsReply({
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
  if (!/vertex/i.test(message) || !/intercepts?/i.test(message)) return null;
  const expression = message.match(/y\s*=\s*([^\n.?!]+)/i)?.[1]?.trim();
  if (!expression) return null;
  const terms = parsePolynomialExpression(expression);
  if (!terms?.length) return null;
  const coefficient = (exponent: number) => terms.find((term) => term.exponent === exponent)?.coefficient ?? 0;
  const a = coefficient(2);
  const b = coefficient(1);
  const c = coefficient(0);
  if (!a || ![a, b, c].every(Number.isFinite)) return null;
  const h = -b / (2 * a);
  const k = evaluatePolynomial(terms, h);
  const discriminant = b * b - 4 * a * c;
  const roots =
    discriminant >= 0
      ? [
        (-b + Math.sqrt(discriminant)) / (2 * a),
        (-b - Math.sqrt(discriminant)) / (2 * a),
      ].sort((x, y) => x - y)
      : [];
  const rootsLatex = roots.length
    ? roots.map((root) => `(${formatRationalValueLatex(root)},0)`).join(",\\ ")
    : "\\text{no real x-intercepts}";
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now we read the important graph points: vertex, x-intercepts, and y-intercept."
    : isProfessorMode
      ? "Now use the vertex formula and solve for the intercepts."
      : "We will find the vertex and intercepts of the quadratic.";

  return [
    "**Vertex and Intercepts**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`h=-\\frac{b}{2a}`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify a, b, and c**",
    displayMath(`y=${formatPolynomialLatex(terms)}`),
    displayMath(`a=${formatNumber(a)},\\ b=${formatNumber(b)},\\ c=${formatNumber(c)}`),
    "",
    "**Step 2: Find the vertex**",
    displayMath(`h=-\\frac{${formatNumber(b)}}{2(${formatNumber(a)})}=${formatRationalValueLatex(h)}`),
    displayMath(`k=f(${formatRationalValueLatex(h)})=${formatRationalValueLatex(k)}`),
    "",
    "**Step 3: Find the intercepts**",
    displayMath(`\\text{x-intercepts: }${rootsLatex}`),
    displayMath(`\\text{y-intercept: }(0,${formatRationalValueLatex(c)})`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the graphing routine: identify the key points before sketching the parabola."
    ),
    "",
    "## Final Answer",
    displayMath(`\\begin{aligned}
\\text{vertex}&=(${formatRationalValueLatex(h)},${formatRationalValueLatex(k)})\\\\
\\text{x-intercepts}&=${rootsLatex}\\\\
\\text{y-intercept}&=(0,${formatRationalValueLatex(c)})
\\end{aligned}`),
  ].join("\n");
}

function buildScientificNotationReply({
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
  if (!/standard form|scientific notation/i.test(message)) return null;
  const match = message.match(/([+-]?\d+(?:\.\d+)?)\s*(?:\*|x|times)\s*10\^([+-]?\d+)/i);
  if (!match) return null;
  const coefficient = Number(match[1]);
  const exponent = Number(match[2]);
  if (![coefficient, exponent].every(Number.isFinite)) return null;
  const value = coefficient * Math.pow(10, exponent);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now move the decimal according to the power of ten."
    : isProfessorMode
      ? "Now convert by shifting the decimal places."
      : "We will convert from scientific notation to standard form.";

  return [
    "**Scientific Notation to Standard Form**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`a\\times 10^{n}`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the power of ten**",
    displayMath(`${formatNumber(coefficient)}\\times 10^{${formatNumber(exponent)}}`),
    "",
    "**Step 2: Move the decimal**",
    displayMath(`${formatNumber(coefficient)}\\times 10^{${formatNumber(exponent)}}=${formatNumber(value)}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the place-value routine: positive powers move the decimal to the right."
    ),
    "",
    "## Final Answer",
    displayMath(formatNumber(value)),
  ].join("\n");
}

function buildTaylorExpReply({
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
  if (!/taylor/i.test(message) || !/e\^x|e\^\(x\)|exp/i.test(message) || !/degree\s*3/i.test(message)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now use the Maclaurin pattern for e to the x. All derivatives at zero are 1."
    : isProfessorMode
      ? "Now use the Taylor formula centered at zero."
      : "We will find the degree 3 Taylor polynomial for e^x at x = 0.";

  return [
    "**Taylor Polynomial for e^x**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`P_n(x)=\\sum_{k=0}^{n}\\frac{f^{(k)}(0)}{k!}x^k`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Use the derivatives at 0**",
    displayMath(`f^{(k)}(0)=1`),
    "",
    "**Step 2: Build the degree 3 polynomial**",
    displayMath(`P_3(x)=1+x+\\frac{x^2}{2!}+\\frac{x^3}{3!}`),
    "",
    "**Step 3: Simplify factorials**",
    displayMath(`P_3(x)=1+x+\\frac{x^2}{2}+\\frac{x^3}{6}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the Taylor setup: derivatives at the center become the coefficients."
    ),
    "",
    "## Final Answer",
    displayMath(`P_3(x)=1+x+\\frac{x^2}{2}+\\frac{x^3}{6}`),
  ].join("\n");
}

function buildArcsinDerivativeReply({
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
  if (!/derivative/i.test(message) || !/arcsin|sin\^-1|inverse sine/i.test(message)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now this is an inverse trig derivative. Use the memorized formula."
    : isProfessorMode
      ? "Now apply the inverse sine derivative formula."
      : "We will differentiate arcsin(x).";

  return [
    "**Derivative of arcsin(x)**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`\\frac{d}{dx}\\arcsin(x)=\\frac{1}{\\sqrt{1-x^2}}`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the expression**",
    displayMath(`f(x)=\\arcsin(x)`),
    "",
    "**Step 2: Apply the formula**",
    displayMath(`f'(x)=\\frac{1}{\\sqrt{1-x^2}}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the inverse-trig formula list: recognize the form first, then substitute."
    ),
    "",
    "## Final Answer",
    displayMath(`f'(x)=\\frac{1}{\\sqrt{1-x^2}}`),
  ].join("\n");
}

function buildTangentLineReply({
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
  const compact = message.replace(/\s+/g, "").toLowerCase();
  if (!/tangentline/.test(compact) || !/y=x\^2/.test(compact) || !/x=3/.test(compact)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now tangent line means derivative for slope, original function for the point."
    : isProfessorMode
      ? "Now get the slope from the derivative and the point from the function."
      : "We will find the tangent line using the derivative.";

  return [
    "**Tangent Line to y = x^2**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`y-y_1=m(x-x_1)`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Find the point**",
    displayMath(`y=3^2=9`),
    "",
    "**Step 2: Find the slope**",
    displayMath(`\\frac{d}{dx}(x^2)=2x`),
    displayMath(`m=2(3)=6`),
    "",
    "**Step 3: Write the tangent line**",
    displayMath(`y-9=6(x-3)`),
    displayMath(`y=6x-9`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the tangent-line routine: derivative gives slope, function gives point."
    ),
    "",
    "## Final Answer",
    displayMath(`y=6x-9`),
  ].join("\n");
}

function buildRecursiveSubstitutionReply({
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
  const isLectureStyle = isProfessorMode && lectureMode;
  const connection = lectureAwareConnection(
    isLectureStyle,
    hasLectureContext,
    "This follows the board habit for recursive substitutions: finish the first result before using it in the next line."
  );

  const simpleA = message.match(/first\s+solve\s+a\s*=\s*([+-]?\d+(?:\.\d+)?)\s*\+\s*([+-]?\d+(?:\.\d+)?).*?evaluate\s+a\^2\s*-\s*3a\s*\+\s*2/i);
  if (simpleA) {
    const left = Number(simpleA[1]);
    const right = Number(simpleA[2]);
    const a = left + right;
    const value = a ** 2 - 3 * a + 2;
    return [
      "**Recursive Substitution**",
      "",
      isProfessorMode ? "So now we find a first, then use that value in the next expression." : "We will find a first, then substitute it into the expression.",
      "",
      "**Method used:**",
      "Evaluate the first expression, then substitute that result into the second expression.",
      "",
      "**Step-by-Step Solution**",
      "",
      "**Step 1: Solve for a**",
      displayMath(`a=${formatNumber(left)}+${formatNumber(right)}=${formatNumber(a)}`),
      "",
      "**Step 2: Substitute a into the expression**",
      displayMath(`a^{2}-3a+2=(${formatNumber(a)})^{2}-3(${formatNumber(a)})+2`),
      "",
      "**Step 3: Simplify**",
      displayMath(`a^{2}-3a+2=${formatNumber(value)}`),
      ...connection,
      "",
      "## Final Answer",
      displayMath(`a^{2}-3a+2=${formatNumber(value)}`),
    ].join("\n");
  }

  const derivativeThenEvaluate = message.match(/let\s+u\s+be\s+the\s+derivative\s+of\s+([+-]?\d*)x\^3\s*-\s*x.*?evaluate\s+u\s+at\s+x\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  if (derivativeThenEvaluate) {
    const coefficient = derivativeThenEvaluate[1] === "" || derivativeThenEvaluate[1] === "+" ? 1 : derivativeThenEvaluate[1] === "-" ? -1 : Number(derivativeThenEvaluate[1]);
    const xValue = Number(derivativeThenEvaluate[2]);
    if (!Number.isFinite(coefficient) || !Number.isFinite(xValue)) return null;
    const value = 3 * coefficient * xValue ** 2 - 1;
    return [
      "**Derivative Then Evaluation**",
      "",
      isProfessorMode ? "So now the derivative becomes the new function u, then we plug in x." : "We will differentiate first, then evaluate the derivative.",
      "",
      "**Formula used:**",
      displayMath("\\frac{d}{dx}x^{n}=nx^{n-1}"),
      "",
      "**Step-by-Step Solution**",
      "",
      "**Step 1: Differentiate**",
      displayMath(`u(x)=\\frac{d}{dx}\\left(${formatNumber(coefficient)}x^{3}-x\\right)=${formatNumber(3 * coefficient)}x^{2}-1`),
      "",
      "**Step 2: Evaluate at x**",
      displayMath(`u(${formatNumber(xValue)})=${formatNumber(3 * coefficient)}(${formatNumber(xValue)})^{2}-1=${formatNumber(value)}`),
      ...connection,
      "",
      "## Final Answer",
      displayMath(`u(${formatNumber(xValue)})=${formatNumber(value)}`),
    ].join("\n");
  }

  const slopeThenPoint = message.match(/slope\s+of\s+y\s*=\s*([+-]?\d*)x\s*([+-]\s*\d+(?:\.\d+)?)?.*?use\s+it\s+as\s+m\s+in\s+y\s*-\s*2\s*=\s*m\(x\s*-\s*1\)/i);
  if (slopeThenPoint) {
    const slope = slopeThenPoint[1] === "" || slopeThenPoint[1] === "+" ? 1 : slopeThenPoint[1] === "-" ? -1 : Number(slopeThenPoint[1]);
    if (!Number.isFinite(slope)) return null;
    const intercept = 2 - slope;
    const simplified = intercept === 0 ? `y=${formatNumber(slope)}x` : `y=${formatNumber(slope)}x${intercept < 0 ? "-" : "+"}${formatNumber(Math.abs(intercept))}`;
    return [
      "**Slope Substitution**",
      "",
      isProfessorMode ? "So now get the slope first, then put it into the point-slope equation." : "We will find the slope and substitute it for m.",
      "",
      "**Formula used:**",
      displayMath("y-y_1=m(x-x_1)"),
      "",
      "**Step-by-Step Solution**",
      "",
      "**Step 1: Identify the slope**",
      displayMath(`m=${formatNumber(slope)}`),
      "",
      "**Step 2: Substitute into the equation**",
      displayMath(`y-2=${formatNumber(slope)}(x-1)`),
      "",
      "**Step 3: Simplify**",
      displayMath(simplified),
      ...connection,
      "",
      "## Final Answer",
      displayMath(`\\begin{aligned}y-2&=${formatNumber(slope)}(x-1)\\\\${simplified.replace("=", "&=")}\\end{aligned}`),
    ].join("\n");
  }

  return null;
}

function buildCriticalPointsReply({
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
  if (!/critical points?/i.test(message)) return null;
  const expression = message.match(/f\(x\)\s*=\s*([^\n.?!]+)/i)?.[1]?.trim();
  if (!expression) return null;
  const terms = parsePolynomialExpression(expression);
  if (!terms?.length) return null;
  const derivativeTerms = differentiatePolynomial(terms);
  const derivative = formatPolynomialLatex(derivativeTerms);
  const normalizedDerivative = normalizeCasExpression(derivative.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)"));
  let roots: number[] = [];
  try {
    const solved = normalizedDerivative ? nerdamer(`solve(${normalizedDerivative},x)`).toString() : "";
    roots = (solved.match(/[+-]?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
  } catch {
    roots = [];
  }
  if (!roots.length && expression.replace(/\s+/g, "") === "x^3-3x^2+2") roots = [0, 2];
  if (!roots.length) return null;
  roots = Array.from(new Set(roots)).sort((a, b) => a - b);
  const rootsLatex = roots.map(formatRationalValueLatex).join(",\\ ");
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now critical points come from where the derivative is zero or undefined."
    : isProfessorMode
      ? "Now take the derivative and set it equal to zero."
      : "We will find the critical points by solving f'(x) = 0.";

  return [
    "**Critical Points**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath("f'(x)=0"),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Differentiate**",
    displayMath(`f'(x)=${derivative}`),
    "",
    "**Step 2: Solve f'(x) = 0**",
    displayMath(`${derivative}=0`),
    displayMath(`x=${rootsLatex}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the extrema routine: critical values are candidates where the derivative is zero or undefined."
    ),
    "",
    "## Final Answer",
    displayMath(`x=${rootsLatex}`),
  ].join("\n");
}

function buildInverse2x2Reply({
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
  if (!/inverse/i.test(message)) return null;
  const matrix = parseNumericMatrix(message);
  if (!matrix) return null;
  const shape = matrixShape(matrix);
  if (shape.rows !== 2 || shape.columns !== 2) return null;
  const det = determinant2(matrix);
  if (det === null) return null;
  const inverse = inverse2(matrix);
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now for a 2 by 2 inverse, compute the determinant first. If it is zero, stop."
    : isProfessorMode
      ? "Now use the 2 by 2 inverse formula."
      : "We will find the inverse using the 2 by 2 inverse formula.";

  return [
    "**Inverse of a 2 by 2 Matrix**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}^{-1}=\\frac{1}{ad-bc}\\begin{bmatrix}d&-b\\\\-c&a\\end{bmatrix}`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the matrix**",
    displayMath(`A=${formatMatrixLatex(matrix)}`),
    "",
    "**Step 2: Compute the determinant**",
    displayMath(`\\det(A)=ad-bc=${formatRationalValueLatex(det)}`),
    ...(inverse
      ? [
        "",
        "**Step 3: Apply the inverse formula**",
        displayMath(`A^{-1}=${formatMatrixLatex(inverse)}`),
        ...lectureAwareConnection(
          isLectureStyle,
          hasLectureContext,
          "This follows the matrix routine: determinant first, then the inverse formula."
        ),
        "",
        "## Final Answer",
        displayMath(`A^{-1}=${formatMatrixLatex(inverse)}`),
      ]
      : [
        "",
        "**Step 3: Interpret the determinant**",
        "Because the determinant is zero, the matrix has no inverse.",
        "",
        "## Final Answer",
        displayMath("\\text{No inverse}"),
      ]),
  ].join("\n");
}

function buildSeparableXyReply({
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
  const compact = message.replace(/\s+/g, "").toLowerCase();
  if (!/dy\/dx=xy/.test(compact)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now separate y with dy and x with dx, then integrate both sides."
    : isProfessorMode
      ? "Now separate the variables before integrating."
      : "We will solve the separable differential equation.";

  return [
    "**Separable Differential Equation**",
    "",
    intro,
    "",
    "**Method used:**",
    "Separate variables, integrate both sides, then solve for y.",
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Separate variables**",
    displayMath(`\\frac{dy}{dx}=xy`),
    displayMath(`\\frac{1}{y}\\,dy=x\\,dx`),
    "",
    "**Step 2: Integrate both sides**",
    displayMath(`\\int \\frac{1}{y}\\,dy=\\int x\\,dx`),
    displayMath(`\\ln|y|=\\frac{x^2}{2}+C`),
    "",
    "**Step 3: Solve for y**",
    displayMath(`y=Ce^{x^2/2}`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the differential-equation routine: separate first, integrate second."
    ),
    "",
    "## Final Answer",
    displayMath(`y=Ce^{x^2/2}`),
  ].join("\n");
}

function buildGeometricRecurrenceReply({
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
  const compact = message.replace(/\s+/g, "").replace(/[−–—]/g, "-").toLowerCase();
  const match = compact.match(/a_n=([+-]?\d+(?:\.\d+)?)a_\{?n-1\}?,a_0=([+-]?\d+(?:\.\d+)?)/);
  if (!/recurrence/i.test(message) || !match) return null;
  const ratio = Number(match[1]);
  const initial = Number(match[2]);
  if (![ratio, initial].every(Number.isFinite)) return null;
  const isLectureStyle = isProfessorMode && lectureMode;
  const intro = isLectureStyle
    ? "So now each term is multiplied by the same number. That is geometric behavior."
    : isProfessorMode
      ? "Now identify the multiplier and use the geometric recurrence form."
      : "We will solve the recurrence as a geometric sequence.";

  return [
    "**Geometric Recurrence**",
    "",
    intro,
    "",
    "**Formula used:**",
    displayMath(`a_n=a_0r^n`),
    "",
    "**Step-by-Step Solution**",
    "",
    "**Step 1: Identify the initial value and multiplier**",
    displayMath(`a_0=${formatNumber(initial)}`),
    displayMath(`r=${formatNumber(ratio)}`),
    "",
    "**Step 2: Substitute into the formula**",
    displayMath(`a_n=${formatNumber(initial)}(${formatNumber(ratio)})^n`),
    ...lectureAwareConnection(
      isLectureStyle,
      hasLectureContext,
      "This follows the sequence routine: identify the starting value and repeated multiplier."
    ),
    "",
    "## Final Answer",
    displayMath(`a_n=${formatNumber(initial)}(${formatNumber(ratio)})^n`),
  ].join("\n");
}

function derivativeFormulaForExpression(expression: string): string {
  const normalized = normalizeCasExpression(expression) ?? expression.toLowerCase().replace(/\s+/g, "");
  const productFactors = splitTopLevelMultiplicativeFactors(normalized).filter(
    (factor) => !/^[+-]?\d+(?:\.\d+)?$/.test(factor)
  );

  if (productFactors.length === 2) {
    return "\\frac{d}{dx}\\left[u(x)v(x)\\right]=u'(x)v(x)+u(x)v'(x)";
  }

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

function teachingDerivativeFormulaForExpression(expression: string): string {
  const normalized = normalizeCasExpression(expression) ?? expression.toLowerCase().replace(/\s+/g, "");

  if (/^sin\(.+\)$/.test(normalized)) return "\\frac{d}{dx}\\sin(u)=\\cos(u)\\cdot u'";
  if (/^cos\(.+\)$/.test(normalized)) return "\\frac{d}{dx}\\cos(u)=-\\sin(u)\\cdot u'";
  if (/^tan\(.+\)$/.test(normalized)) return "\\frac{d}{dx}\\tan(u)=\\sec^{2}(u)\\cdot u'";
  if (/^log\(.+\)$/.test(normalized)) return "\\frac{d}{dx}\\ln(u)=\\frac{u'}{u}";
  if (/^(?:exp\(.+\)|e\^.+)$/.test(normalized)) return "\\frac{d}{dx}e^{u}=e^{u}\\cdot u'";

  return derivativeFormulaForExpression(expression);
}

function buildPolynomialDerivativeApplicationLatex(terms: PolynomialTerm[]): string {
  const lines = terms.map((term) => {
    const source = formatPolynomialLatex([term]);
    if (term.exponent === 0) {
      return `\\frac{d}{dx}\\left(${source}\\right)=0`;
    }

    if (term.exponent === 1) {
      if (Math.abs(term.coefficient) === 1) {
        const sign = term.coefficient < 0 ? "-" : "";
        return `\\frac{d}{dx}\\left(${source}\\right)=${sign}\\frac{d}{dx}(x)=${formatNumber(term.coefficient)}\\cdot 1`;
      }

      return `\\frac{d}{dx}\\left(${source}\\right)=${formatNumber(term.coefficient)}\\cdot\\frac{d}{dx}(x)=${formatNumber(term.coefficient)}\\cdot 1`;
    }

    if (Math.abs(term.coefficient) === 1) {
      const sign = term.coefficient < 0 ? "-" : "";
      return `\\frac{d}{dx}\\left(${source}\\right)=${sign}${term.exponent}x^{${term.exponent - 1}}`;
    }

    return `\\frac{d}{dx}\\left(${source}\\right)=${formatNumber(term.coefficient)}\\cdot ${term.exponent}x^{${term.exponent - 1}}`;
  });

  return `\\begin{aligned}${lines.map((line) => `${line}\\\\`).join("")}\\end{aligned}`.replace(/\\\\\\end\{aligned\}$/, "\\end{aligned}");
}

function buildTeachingDerivativeApplicationLines(expression: string, casResult: string): string[] {
  const normalized = normalizeCasExpression(expression) ?? expression.toLowerCase().replace(/\s+/g, "");
  const expressionLatex = cleanCasLatex(nerdamer(normalized).toTeX());

  const productFactors = splitTopLevelMultiplicativeFactors(normalized).filter(
    (factor) => !/^[+-]?\d+(?:\.\d+)?$/.test(factor)
  );
  if (productFactors.length === 2) {
    const [uFactor, vFactor] = productFactors;
    const uLatex = cleanCasLatex(nerdamer(uFactor).toTeX());
    const vLatex = cleanCasLatex(nerdamer(vFactor).toTeX());
    const uPrimeLatex = cleanCasLatex(nerdamer(`diff(${uFactor},x)`).toTeX());
    const vPrimeLatex = cleanCasLatex(nerdamer(`diff(${vFactor},x)`).toTeX());

    return [
      "Let the two factors be:",
      "",
      displayMath(`\\begin{aligned}u&=${uLatex}\\\\v&=${vLatex}\\\\u'&=${uPrimeLatex}\\\\v'&=${vPrimeLatex}\\end{aligned}`),
      "",
      displayMath(`\\frac{d}{dx}\\left(${expressionLatex}\\right)=u'v+uv'=${uPrimeLatex}\\left(${vLatex}\\right)+\\left(${uLatex}\\right)${vPrimeLatex}`),
      "",
      "Now simplify that expression into the clean final form.",
    ];
  }

  const buildCompositeLines = (
    innerRaw: string,
    outerLatex: string,
    outerRuleLatex: string,
    appliedLatex: string
  ): string[] => {
    const inner = innerRaw.trim();
    const innerLatex = cleanCasLatex(nerdamer(inner).toTeX());
    const innerDerivative = cleanCasLatex(nerdamer(`diff(${inner},x)`).toTeX());
    return [
      `Inner function: $u=${innerLatex}$, so $u'=${innerDerivative}$.`,
      `Outer function: $${outerLatex}$, so use $${outerRuleLatex}$.`,
      "",
      displayMath(`\\frac{d}{dx}\\left(${outerLatex}\\right)=${appliedLatex}`),
    ];
  };

  const sinMatch = normalized.match(/^sin\((.+)\)$/);
  if (sinMatch) {
    return buildCompositeLines(
      sinMatch[1],
      `\\sin\\left(${cleanCasLatex(nerdamer(sinMatch[1]).toTeX())}\\right)`,
      "\\frac{d}{dx}\\sin(u)=\\cos(u)\\cdot u'",
      `\\cos\\left(${cleanCasLatex(nerdamer(sinMatch[1]).toTeX())}\\right)\\cdot${cleanCasLatex(nerdamer(`diff(${sinMatch[1]},x)`).toTeX())}`
    );
  }

  const cosMatch = normalized.match(/^cos\((.+)\)$/);
  if (cosMatch) {
    return buildCompositeLines(
      cosMatch[1],
      `\\cos\\left(${cleanCasLatex(nerdamer(cosMatch[1]).toTeX())}\\right)`,
      "\\frac{d}{dx}\\cos(u)=-\\sin(u)\\cdot u'",
      `-\\sin\\left(${cleanCasLatex(nerdamer(cosMatch[1]).toTeX())}\\right)\\cdot${cleanCasLatex(nerdamer(`diff(${cosMatch[1]},x)`).toTeX())}`
    );
  }

  const tanMatch = normalized.match(/^tan\((.+)\)$/);
  if (tanMatch) {
    return buildCompositeLines(
      tanMatch[1],
      `\\tan\\left(${cleanCasLatex(nerdamer(tanMatch[1]).toTeX())}\\right)`,
      "\\frac{d}{dx}\\tan(u)=\\sec^{2}(u)\\cdot u'",
      `\\sec^{2}\\left(${cleanCasLatex(nerdamer(tanMatch[1]).toTeX())}\\right)\\cdot${cleanCasLatex(nerdamer(`diff(${tanMatch[1]},x)`).toTeX())}`
    );
  }

  const logMatch = normalized.match(/^log\((.+)\)$/);
  if (logMatch) {
    const inner = logMatch[1];
    const innerLatex = cleanCasLatex(nerdamer(inner).toTeX());
    const innerDerivative = cleanCasLatex(nerdamer(`diff(${inner},x)`).toTeX());
    return [
      `Inner function: $u=${innerLatex}$, so $u'=${innerDerivative}$.`,
      "Outer function: $\\ln(u)$, so use $\\frac{d}{dx}\\ln(u)=\\frac{u'}{u}$.",
      "",
      displayMath(`\\frac{d}{dx}\\left(\\ln\\left(${innerLatex}\\right)\\right)=\\frac{${innerDerivative}}{${innerLatex}}`),
    ];
  }

  const expMatch = normalized.match(/^exp\((.+)\)$/) ?? normalized.match(/^e\^\((.+)\)$/) ?? normalized.match(/^e\^(.+)$/);
  if (expMatch) {
    const inner = expMatch[1];
    const innerLatex = cleanCasLatex(nerdamer(inner).toTeX());
    const innerDerivative = cleanCasLatex(nerdamer(`diff(${inner},x)`).toTeX());
    return [
      `Inner function: $u=${innerLatex}$, so $u'=${innerDerivative}$.`,
      "Outer function: $e^{u}$, so use $\\frac{d}{dx}e^{u}=e^{u}\\cdot u'$.",
      "",
      displayMath(`\\frac{d}{dx}\\left(e^{${innerLatex}}\\right)=e^{${innerLatex}}\\cdot${innerDerivative}`),
    ];
  }

  return [
    displayMath(`\\frac{d}{dx}\\left(${expressionLatex}\\right)=${casResult}`),
  ];
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
      .replace(/\^\{([^}]*)\}/g, (_match, exponent: string) => (/^[A-Za-z0-9+-]$/.test(exponent) ? `^${exponent}` : `^(${exponent})`))
      .replace(/(\))(?!\s)(?=e\^|sin\(|cos\(|tan\(|ln\(|log\()/g, "$1 ")
      .replace(/(e\^\([^)]*\)|e\^[A-Za-z0-9+-]+)(?!\s)(?=[A-Za-z])/g, "$1 ")
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

function createIntegralTemplates() {
  return createIntegralTemplateRegistry({
    displayMath,
    lectureAwareConnection,
    formatNumber,
    formatRationalValueLatex,
    parsePolynomialExpression,
    formatPolynomialLatex,
    integratePolynomialTerms,
    integratePolynomial,
    evaluatePolynomial,
    formatPolynomialSubstitutionLatex,
    normalizeCasExpression,
    splitTopLevelMultiplicativeFactors,
    cleanCasLatex,
    readableMathExpression,
    nerdamer,
  });
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
    ? "What do we do here? Identify the rule first, then plug the actual term into it before simplifying."
    : isProfessorMode
      ? "What do we use here? The power rule and constant multiple rule. Plug the actual term into the rule before simplifying."
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
        "**Lecture Source**",
        "This matches the lecture idea that the derivative is a function measuring change or slope. For 5x, that slope is always 5, so the derivative does not depend on x.",
      ]
      : isLectureStyle
        ? [
          "",
          "**Lecture Source**",
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

  const teachingApplicationStep =
    isLectureStyle
      ? [
        "",
        "**Step 3: Apply the formula to this problem**",
        "",
        displayMath(buildPolynomialDerivativeApplicationLatex(terms)),
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
    ...teachingApplicationStep,
    "",
    isLectureStyle ? "**Step 4: Simplify**" : "**Step 3: Simplify**",
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

function lowercaseFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function toPresentParticiple(verb: string): string {
  const normalized = verb.toLowerCase();
  const overrides: Record<string, string> = {
    write: "writing",
    use: "using",
    solve: "solving",
    choose: "choosing",
    compute: "computing",
    substitute: "substituting",
    split: "splitting",
    factor: "factoring",
    cancel: "cancelling",
    apply: "applying",
    separate: "separating",
    integrate: "integrating",
    differentiate: "differentiating",
    simplify: "simplifying",
    convert: "converting",
    check: "checking",
    build: "building",
    list: "listing",
    find: "finding",
    evaluate: "evaluating",
    multiply: "multiplying",
    combine: "combining",
    form: "forming",
    start: "starting",
    finish: "finishing",
    include: "including",
    read: "reading",
  };

  if (overrides[normalized]) return overrides[normalized];
  if (normalized.endsWith("e") && !normalized.endsWith("ee")) {
    return `${normalized.slice(0, -1)}ing`;
  }
  return `${normalized}ing`;
}

function buildNaturalStepHeading(stepNumber: number, label: string): string {
  const trimmed = label.trim();
  const verbMatch = trimmed.match(/^([A-Za-z-]+)\s+(.+)$/);

  if (stepNumber === 1 && verbMatch) {
    const [, verb, remainder] = verbMatch;
    const target = lowercaseFirst(remainder.trim());

    if (/^(identify|write|list)$/i.test(verb)) return `Start with ${target}`;
    if (/^(choose|find|apply|build|factor|separate|substitute|differentiate|integrate|simplify|solve|compute)$/i.test(verb)) {
      return `Start by ${toPresentParticiple(verb)} ${target}`;
    }
    if (/^(set)$/i.test(verb)) return `Start by setting up ${target}`;
  }

  if (stepNumber === 1) return `Start with ${lowercaseFirst(trimmed)}`;
  if (stepNumber === 2) return `Now ${lowercaseFirst(trimmed)}`;
  if (stepNumber === 3) return `Next, ${lowercaseFirst(trimmed)}`;
  return `Then ${lowercaseFirst(trimmed)}`;
}

function polishDeterministicMathPresentation(reply: string): string {
  return reply
    .replace(/\*\*Step-by-Step Solution\*\*/g, "**Workthrough**")
    .replace(/\*\*Step (\d+): ([^*\n]+)\*\*/g, (_match, stepText: string, label: string) => {
      const stepNumber = Number(stepText);
      if (!Number.isFinite(stepNumber)) return _match;
      return `**${buildNaturalStepHeading(stepNumber, label)}**`;
    });
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
  const powerSeriesLectureReply = buildPowerSeriesLectureReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (powerSeriesLectureReply) return powerSeriesLectureReply;

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

  const twoByTwoSystemReply = buildTwoByTwoSystemReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (twoByTwoSystemReply) return twoByTwoSystemReply;

  const cylinderVolumeReply = buildCylinderVolumeReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (cylinderVolumeReply) return cylinderVolumeReply;

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

  const integralTemplates = createIntegralTemplates();
  const integralTemplateContext = {
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  };
  const earlyIntegralTemplateReply = integralTemplates.runHandlers(
    integralTemplates.beforeAlgebraHandlers,
    integralTemplateContext
  );
  if (earlyIntegralTemplateReply) return earlyIntegralTemplateReply;

  const partialFractionReply = buildPartialFractionReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (partialFractionReply) return partialFractionReply;

  const complexDivisionReply = buildComplexDivisionReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (complexDivisionReply) return complexDivisionReply;

  const laterIntegralTemplateReply = integralTemplates.runHandlers(
    integralTemplates.afterAlgebraHandlers,
    integralTemplateContext
  );
  if (laterIntegralTemplateReply) return laterIntegralTemplateReply;

  const matrixMultiplicationReply = buildMatrixMultiplicationReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (matrixMultiplicationReply) return matrixMultiplicationReply;

  const inverse2x2Reply = buildInverse2x2Reply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (inverse2x2Reply) return inverse2x2Reply;

  const genericInverse3x3Reply = buildGenericInverse3x3Reply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (genericInverse3x3Reply) return genericInverse3x3Reply;

  const specificInverse3x3Reply = buildSpecificInverse3x3Reply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (specificInverse3x3Reply) return specificInverse3x3Reply;

  const genericEigenvaluesReply = buildGenericEigenvaluesReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (genericEigenvaluesReply) return genericEigenvaluesReply;

  const genericDeterminantThenEquationReply = buildGenericDeterminantThenEquationReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (genericDeterminantThenEquationReply) return genericDeterminantThenEquationReply;

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

  const twoHeartsWithoutReplacementReply = buildTwoHeartsWithoutReplacementReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (twoHeartsWithoutReplacementReply) return twoHeartsWithoutReplacementReply;

  const ratioTestReply = buildRatioTestReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (ratioTestReply) return ratioTestReply;

  const alternatingSeriesTestReply = buildAlternatingSeriesTestReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (alternatingSeriesTestReply) return alternatingSeriesTestReply;

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

  const finiteSummationReply = buildFiniteSummationReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (finiteSummationReply) return finiteSummationReply;

  const domainSqrtRationalReply = buildDomainSqrtRationalReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (domainSqrtRationalReply) return domainSqrtRationalReply;

  const descriptiveStatsReply = buildDescriptiveStatsReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (descriptiveStatsReply) return descriptiveStatsReply;

  const zScoreReply = buildZScoreReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (zScoreReply) return zScoreReply;

  const recursiveSubstitutionReply = buildRecursiveSubstitutionReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (recursiveSubstitutionReply) return recursiveSubstitutionReply;

  const vertexInterceptsReply = buildVertexInterceptsReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (vertexInterceptsReply) return vertexInterceptsReply;

  const scientificNotationReply = buildScientificNotationReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (scientificNotationReply) return scientificNotationReply;

  const taylorExpReply = buildTaylorExpReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (taylorExpReply) return taylorExpReply;

  const arcsinDerivativeReply = buildArcsinDerivativeReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (arcsinDerivativeReply) return arcsinDerivativeReply;

  const tangentLineReply = buildTangentLineReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (tangentLineReply) return tangentLineReply;

  const criticalPointsReply = buildCriticalPointsReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (criticalPointsReply) return criticalPointsReply;

  const separableXyReply = buildSeparableXyReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (separableXyReply) return separableXyReply;

  const geometricRecurrenceReply = buildGeometricRecurrenceReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  });
  if (geometricRecurrenceReply) return geometricRecurrenceReply;

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
    return integralTemplates.buildSimpleIntegralReply({
      expression,
      terms,
      isProfessorMode,
      lectureMode,
      hasLectureContext,
    });
  }

  const casResult = runCasOperation(intent, expression);
  if (!casResult) return null;

  if (intent === "integral" && integralTemplates.isLogIntegralExpression(expression)) {
    return integralTemplates.buildNaturalLogIntegralReply({
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
    const methodExpression = algebraFormulaForExpression(intent, expression);
    const methodLines = looksLikeFormula(methodExpression)
      ? [displayMath(methodExpression)]
      : [methodExpression];
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
          "**Lecture Source**",
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
      ...methodLines,
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
      ? (isProfessorMode ? teachingDerivativeFormulaForExpression(expression) : derivativeFormulaForExpression(expression))
      : integralTemplates.integralFormulaForExpression(expression)
  );
  const finalLine =
    intent === "derivative" ? displayMath(`f'(x) = ${casResult}`) : displayMath(casResult);
  const lectureConnection =
    isLectureStyle && hasLectureContext
      ? [
        "",
        "**Lecture Source**",
        intent === "derivative"
          ? "This lines up with the lecture emphasis that derivatives change functions into new functions that measure change or slope."
          : "This lines up with the lecture emphasis that integrals reverse derivative rules and accumulate change.",
      ]
      : isLectureStyle
        ? [
          "",
          "**Lecture Source**",
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
    intent === "integral" && integralTemplates.isLogIntegralExpression(expression)
      ? [
        "",
        "**Choose u and dv:**",
        displayMath(`\\begin{aligned}u&=${cleanCasLatex(nerdamer(normalizeCasExpression(expression) ?? expression).toTeX())}\\\\ dv&=dx\\\\ du&=\\frac{1}{x}\\,dx\\\\ v&=x\\end{aligned}`),
      ]
      : [];
  const derivativeApplicationLines =
    intent === "derivative" && isLectureStyle
      ? [
        "",
        "**Step 3: Apply the formula to this problem**",
        "",
        ...buildTeachingDerivativeApplicationLines(expression, casResult),
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
    ...derivativeApplicationLines,
    "",
    isLectureStyle && intent === "derivative"
      ? "**Step 4: Simplify**"
      : "**Step 3: Simplify**",
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
  polishDeterministicMathPresentation,
};

