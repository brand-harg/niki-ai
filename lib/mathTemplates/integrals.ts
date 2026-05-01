type PolynomialTerm = {
  coefficient: number;
  exponent: number;
};

type NerdamerLike = (expression: string) => {
  toString: () => string;
  toTeX: () => string;
};

export type IntegralTemplateContext = {
  message: string;
  isProfessorMode: boolean;
  lectureMode: boolean;
  hasLectureContext: boolean;
};

type IntegralTemplateHandler = (context: IntegralTemplateContext) => string | null;

type IntegralTemplateDependencies = {
  displayMath: (latex: string) => string;
  lectureAwareConnection: (
    isLectureStyle: boolean,
    hasLectureContext: boolean,
    groundedMessage: string
  ) => string[];
  formatNumber: (value: number) => string;
  formatRationalValueLatex: (value: number) => string;
  parsePolynomialExpression: (expression: string) => PolynomialTerm[] | null;
  formatPolynomialLatex: (terms: PolynomialTerm[]) => string;
  integratePolynomialTerms: (terms: PolynomialTerm[]) => PolynomialTerm[];
  integratePolynomial: (terms: PolynomialTerm[]) => string;
  evaluatePolynomial: (terms: PolynomialTerm[], x: number) => number;
  formatPolynomialSubstitutionLatex: (terms: PolynomialTerm[], x: number) => string;
  normalizeCasExpression: (expression: string) => string | null;
  splitTopLevelMultiplicativeFactors: (expression: string) => string[];
  cleanCasLatex: (value: string) => string;
  readableMathExpression: (expression: string) => string;
  nerdamer: NerdamerLike;
};

export function createIntegralTemplateRegistry(deps: IntegralTemplateDependencies) {
  const {
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
  } = deps;

  function integralFormulaForExpression(expression: string): string {
    const normalized = normalizeCasExpression(expression) ?? expression.toLowerCase().replace(/\s+/g, "");
    const productFactors = splitTopLevelMultiplicativeFactors(normalized).filter(
      (factor) => !/^[+-]?\d+(?:\.\d+)?$/.test(factor)
    );

    if (
      productFactors.length === 2 &&
      productFactors.some((factor) => /exp\(|log\(/.test(factor)) &&
      productFactors.some((factor) => /x/.test(factor))
    ) {
      return "\\int u\\,dv=uv-\\int v\\,du";
    }

    if (/sin\(x\)/.test(normalized)) return "\\int \\sin(x)\\,dx=-\\cos(x)+C";
    if (/cos\(x\)/.test(normalized)) return "\\int \\cos(x)\\,dx=\\sin(x)+C";
    if (/e\^x|exp\(x\)/.test(normalized)) return "\\int e^{x}\\,dx=e^{x}+C";
    if (/log\(/.test(normalized)) return "\\int u\\,dv=uv-\\int v\\,du";

    return "\\int c x^{n}\\,dx=\\frac{c x^{n+1}}{n+1}+C,\\ n\\ne -1";
  }

  function isLogIntegralExpression(expression: string): boolean {
    const normalized = normalizeCasExpression(expression);
    return !!normalized && /log\(/.test(normalized);
  }

  function buildUSubSinCubeIntegralReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  }: IntegralTemplateContext): string | null {
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
  }: IntegralTemplateContext): string | null {
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

  function buildPowerSinUSubIntegralReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  }: IntegralTemplateContext): string | null {
    const normalized = message.toLowerCase().replace(/\s+/g, "").replace(/\*\*/g, "^");
    if (!/(integrate|integral)/i.test(message)) return null;
    const match = normalized.match(/(?:integrate|integralof)?x\^(\d+)\*?sin\(x\^(\d+)\)dx?/);
    if (!match) return null;

    const outsidePower = Number(match[1]);
    const insidePower = Number(match[2]);
    if (!Number.isInteger(outsidePower) || !Number.isInteger(insidePower) || insidePower !== outsidePower + 1) {
      return null;
    }

    const isLectureStyle = isProfessorMode && lectureMode;
    const intro = isLectureStyle
      ? `So now we use substitution. The inside function is x to the ${insidePower}, and its derivative is sitting outside up to a constant.`
      : isProfessorMode
        ? `So now we use u-substitution because the derivative of x^${insidePower} is proportional to x^${outsidePower}.`
        : "We will integrate using u-substitution.";

    return [
      `**Integral of x^${outsidePower} sin(x^${insidePower})**`,
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
      displayMath(`u=x^{${insidePower}}`),
      "",
      "**Step 2: Differentiate u**",
      "",
      displayMath(`du=${insidePower}x^{${outsidePower}}\\,dx`),
      "",
      displayMath(`x^{${outsidePower}}\\,dx=\\frac{1}{${insidePower}}\\,du`),
      "",
      "**Step 3: Rewrite the integral**",
      "",
      displayMath(`\\int x^{${outsidePower}}\\sin(x^{${insidePower}})\\,dx=\\frac{1}{${insidePower}}\\int \\sin(u)\\,du`),
      "",
      "**Step 4: Integrate and substitute back**",
      "",
      displayMath(`\\frac{1}{${insidePower}}\\int \\sin(u)\\,du=-\\frac{1}{${insidePower}}\\cos(u)+C`),
      "",
      displayMath(`-\\frac{1}{${insidePower}}\\cos(u)+C=-\\frac{1}{${insidePower}}\\cos(x^{${insidePower}})+C`),
      ...lectureAwareConnection(
        isLectureStyle,
        hasLectureContext,
        "This follows the lecture substitution pattern: identify the inside function, convert dx cleanly, integrate in u, then substitute back."
      ),
      "",
      "## Final Answer",
      displayMath(`\\int x^{${outsidePower}}\\sin(x^{${insidePower}})\\,dx=-\\frac{1}{${insidePower}}\\cos(x^{${insidePower}})+C`),
    ].join("\n");
  }

  function buildPowerLogByPartsReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  }: IntegralTemplateContext): string | null {
    const normalized = message.toLowerCase().replace(/\s+/g, "").replace(/\*\*/g, "^");
    if (!/(integrate|integral)/i.test(message)) return null;
    const match = normalized.match(/(?:integratebyparts:?|integrate|integralof)?x\^(\d+)\*?ln\((\d*)x\)dx?/);
    if (!match) return null;

    const power = Number(match[1]);
    const coefficient = match[2] ? Number(match[2]) : 1;
    if (!Number.isInteger(power) || power < 0 || !Number.isFinite(coefficient) || coefficient <= 0) return null;

    const nextPower = power + 1;
    const coefficientText = coefficient === 1 ? "" : formatNumber(coefficient);
    const isLectureStyle = isProfessorMode && lectureMode;
    const intro = isLectureStyle
      ? "So now we use integration by parts. Pick the logarithm for u because differentiating it makes it simpler."
      : isProfessorMode
        ? "So now we use integration by parts, with the logarithm as u."
        : "We will integrate using integration by parts.";

    return [
      `**Integral of x^${power} ln(${coefficientText}x)**`,
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
u&=\\ln(${coefficientText}x)\\\\
dv&=x^{${power}}\\,dx
\\end{aligned}`),
      "",
      "**Step 2: Compute du and v**",
      "",
      displayMath(`\\begin{aligned}
du&=\\frac{1}{x}\\,dx\\\\
v&=\\frac{x^{${nextPower}}}{${nextPower}}
\\end{aligned}`),
      "",
      "**Step 3: Substitute into integration by parts**",
      "",
      displayMath(`\\int x^{${power}}\\ln(${coefficientText}x)\\,dx=\\frac{x^{${nextPower}}\\ln(${coefficientText}x)}{${nextPower}}-\\int \\frac{x^{${nextPower}}}{${nextPower}}\\cdot\\frac{1}{x}\\,dx`),
      "",
      "**Step 4: Simplify the remaining integral**",
      "",
      displayMath(`\\int x^{${power}}\\ln(${coefficientText}x)\\,dx=\\frac{x^{${nextPower}}\\ln(${coefficientText}x)}{${nextPower}}-\\frac{1}{${nextPower}}\\int x^{${power}}\\,dx`),
      "",
      "**Step 5: Integrate and combine**",
      "",
      displayMath(`\\int x^{${power}}\\ln(${coefficientText}x)\\,dx=\\frac{x^{${nextPower}}\\ln(${coefficientText}x)}{${nextPower}}-\\frac{x^{${nextPower}}}{${nextPower * nextPower}}+C`),
      ...lectureAwareConnection(
        isLectureStyle,
        hasLectureContext,
        "This follows the lecture by-parts pattern: choose the part that simplifies, compute du and v, then clean up the leftover integral."
      ),
      "",
      "## Final Answer",
      displayMath(`\\int x^{${power}}\\ln(${coefficientText}x)\\,dx=\\frac{x^{${nextPower}}\\ln(${coefficientText}x)}{${nextPower}}-\\frac{x^{${nextPower}}}{${nextPower * nextPower}}+C`),
    ].join("\n");
  }

  function buildDefiniteSineIntegralReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  }: IntegralTemplateContext): string | null {
    const compact = message.toLowerCase().replace(/\s+/g, " ");
    if (!/\b(integral|integrate)\b/.test(compact) || !/sin\s*\(\s*x\s*\)/.test(compact)) return null;
    const bounds = compact.match(/(?:from|_)\s*([+-]?(?:\d+(?:\.\d+)?|pi|π))\s*(?:to|\^)\s*([+-]?(?:\d+(?:\.\d+)?|pi|π))/i);
    if (!bounds) return null;

    const parseBound = (value: string): { latex: string; numeric: number } | null => {
      const normalized = value.trim().toLowerCase();
      if (normalized === "pi" || normalized === "π") return { latex: "\\pi", numeric: Math.PI };
      const numeric = Number(normalized);
      if (!Number.isFinite(numeric)) return null;
      return { latex: formatNumber(numeric), numeric };
    };

    const lower = parseBound(bounds[1]);
    const upper = parseBound(bounds[2]);
    if (!lower || !upper) return null;

    const antiderivativeAtUpper = -Math.cos(upper.numeric);
    const antiderivativeAtLower = -Math.cos(lower.numeric);
    const result = antiderivativeAtUpper - antiderivativeAtLower;
    const resultLatex = formatRationalValueLatex(result);
    const isLectureStyle = isProfessorMode && lectureMode;
    const intro = isLectureStyle
      ? "So now we evaluate the definite integral. Find the antiderivative first, then plug in top minus bottom."
      : isProfessorMode
        ? "Now use the antiderivative and evaluate upper bound minus lower bound."
        : "We will evaluate the definite integral using the Fundamental Theorem of Calculus.";

    return [
      "**Definite Integral of Sine**",
      "",
      intro,
      "",
      "**Formula used:**",
      displayMath("\\int_a^b f(x)\\,dx=F(b)-F(a)"),
      displayMath("\\int \\sin(x)\\,dx=-\\cos(x)+C"),
      "",
      "**Step-by-Step Solution**",
      "",
      "**Step 1: Identify the integral**",
      displayMath(`\\int_{${lower.latex}}^{${upper.latex}}\\sin(x)\\,dx`),
      "",
      "**Step 2: Use the antiderivative**",
      displayMath("F(x)=-\\cos(x)"),
      "",
      "**Step 3: Evaluate upper minus lower**",
      displayMath(`\\begin{aligned}
\\int_{${lower.latex}}^{${upper.latex}}\\sin(x)\\,dx
&=\\left[-\\cos(x)\\right]_{${lower.latex}}^{${upper.latex}}\\\\
&=-\\cos(${upper.latex})-\\left(-\\cos(${lower.latex})\\right)\\\\
&=${resultLatex}
\\end{aligned}`),
      ...lectureAwareConnection(
        isLectureStyle,
        hasLectureContext,
        "This follows the usual definite-integral routine: antiderivative first, then top minus bottom."
      ),
      "",
      "## Final Answer",
      displayMath(`\\int_{${lower.latex}}^{${upper.latex}}\\sin(x)\\,dx=${resultLatex}`),
    ].join("\n");
  }

  function buildPolynomialDefiniteIntegralReply({
    message,
    isProfessorMode,
    lectureMode,
    hasLectureContext,
  }: IntegralTemplateContext): string | null {
    if (!/\bdefinite integral\b|\bintegral from\b/i.test(message)) return null;
    const normalized = message.replace(/[−–—]/g, "-");
    const match = normalized.match(/from\s+([+-]?\d+(?:\.\d+)?)\s+to\s+([+-]?\d+(?:\.\d+)?)\s+of\s+(.+?)(?:\s+d[xt]|\s*dx|$)/i);
    if (!match) return null;
    const lower = Number(match[1]);
    const upper = Number(match[2]);
    const expression = match[3]?.trim();
    if (!expression || ![lower, upper].every(Number.isFinite)) return null;
    const terms = parsePolynomialExpression(expression);
    if (!terms?.length) return null;

    const input = formatPolynomialLatex(terms);
    const antiderivativeTerms = integratePolynomialTerms(terms);
    const antiderivative = `${formatPolynomialLatex(antiderivativeTerms)}`;
    const result = evaluatePolynomial(antiderivativeTerms, upper) - evaluatePolynomial(antiderivativeTerms, lower);
    const resultLatex = formatRationalValueLatex(result);
    const isLectureStyle = isProfessorMode && lectureMode;
    const intro = isLectureStyle
      ? "So now this is top minus bottom. First find the antiderivative, then evaluate it at the bounds."
      : isProfessorMode
        ? "Now use the Fundamental Theorem: antiderivative at the top minus antiderivative at the bottom."
        : "We will evaluate the definite integral using the Fundamental Theorem of Calculus.";

    return [
      "**Definite Integral**",
      "",
      intro,
      "",
      "**Formula used:**",
      displayMath("\\int_a^b f(x)\\,dx=F(b)-F(a)"),
      "",
      "**Step-by-Step Solution**",
      "",
      "**Step 1: Identify the integral**",
      displayMath(`\\int_{${formatNumber(lower)}}^{${formatNumber(upper)}} (${input})\\,dx`),
      "",
      "**Step 2: Find the antiderivative**",
      displayMath(`F(x)=${antiderivative}`),
      "",
      "**Step 3: Evaluate upper minus lower**",
      displayMath(`\\begin{aligned}
F(${formatNumber(upper)})-F(${formatNumber(lower)})
&=\\left(${formatPolynomialSubstitutionLatex(antiderivativeTerms, upper)}\\right)-\\left(${formatPolynomialSubstitutionLatex(antiderivativeTerms, lower)}\\right)\\\\
&=${resultLatex}
\\end{aligned}`),
      ...lectureAwareConnection(
        isLectureStyle,
        hasLectureContext,
        "This follows the standard definite-integral routine: find F, then compute top minus bottom."
      ),
      "",
      "## Final Answer",
      displayMath(`\\int_{${formatNumber(lower)}}^{${formatNumber(upper)}} (${input})\\,dx=${resultLatex}`),
    ].join("\n");
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
          "**Lecture Source**",
          "This matches the lecture pattern: pick the part that simplifies under differentiation, plug into the formula, then clean up the remaining integral.",
        ]
        : isLectureStyle
          ? [
            "",
            "**Lecture Source**",
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
      ...check,
      ...lectureConnection,
      "",
      "## Final Answer",
      displayMath(casResult),
    ].join("\n");
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
          "**Lecture Source**",
          "This follows the lecture pattern: identify the power rule form, perform the algebra cleanly, and remember that indefinite integrals need the constant C.",
        ]
        : isLectureStyle
          ? [
            "",
            "**Lecture Source**",
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

  const beforeAlgebraHandlers: IntegralTemplateHandler[] = [
    buildPowerSinUSubIntegralReply,
    buildUSubSinCubeIntegralReply,
    buildPowerLogByPartsReply,
    buildDefiniteSineIntegralReply,
  ];

  const afterAlgebraHandlers: IntegralTemplateHandler[] = [
    buildPolynomialDefiniteIntegralReply,
    buildX2LogByPartsReply,
  ];

  const runHandlers = (
    handlers: IntegralTemplateHandler[],
    context: IntegralTemplateContext
  ): string | null => {
    for (const handler of handlers) {
      const reply = handler(context);
      if (reply) return reply;
    }
    return null;
  };

  return {
    beforeAlgebraHandlers,
    afterAlgebraHandlers,
    runHandlers,
    buildNaturalLogIntegralReply,
    buildSimpleIntegralReply,
    integralFormulaForExpression,
    isLogIntegralExpression,
  };
}
