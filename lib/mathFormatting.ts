const CODE_FENCE_PATTERN = /```[\s\S]*?```/g;

function normalizeEscapedMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expr: string) => {
      const trimmed = expr.trim();
      if (!trimmed) return "";
      return `\n$$\n${trimmed}\n$$\n`;
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expr: string) => {
      const trimmed = expr.trim();
      if (!trimmed || /[\n\r]/.test(trimmed)) {
        if (!trimmed) return "";
        return `\n$$\n${trimmed}\n$$\n`;
      }
      return `$${trimmed}$`;
    });
}

function wrapBareLatexEnvironments(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inDisplay = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "$$" || trimmed === "$") {
      out.push("$$");
      inDisplay = !inDisplay;
      continue;
    }

    if (inDisplay || !/^\\begin\{(aligned|align|bmatrix|pmatrix|matrix|cases|array|smallmatrix|vmatrix|Vmatrix)\}/.test(trimmed)) {
      out.push(line);
      continue;
    }

    const envName = trimmed.match(/^\\begin\{([^}]+)\}/)?.[1];
    const block = [trimmed];

    if (envName && trimmed.includes(`\\end{${envName}}`)) {
      out.push("$$", block.join("\n"), "$$");
      continue;
    }

    while (envName && i + 1 < lines.length) {
      i++;
      const next = (lines[i] ?? "").trim();
      if (next === "$$" || next === "$") continue;
      block.push(next);
      if (next.includes(`\\end{${envName}}`)) break;
    }

    out.push("$$", block.join("\n"), "$$");
  }

  return out.join("\n");
}

function collapseNestedDisplayMath(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inDisplay = false;
  let openingFenceIndex = -1;
  let hasDisplayContent = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed !== "$$") {
      if (inDisplay && trimmed) hasDisplayContent = true;
      out.push(line);
      continue;
    }

    if (!inDisplay) {
      out.push("$$");
      inDisplay = true;
      openingFenceIndex = out.length - 1;
      hasDisplayContent = false;
      continue;
    }

    if (!hasDisplayContent && openingFenceIndex >= 0) {
      out.splice(openingFenceIndex, 1);
    } else {
      out.push("$$");
    }

    inDisplay = false;
    openingFenceIndex = -1;
    hasDisplayContent = false;
  }

  return out.join("\n");
}

function normalizeDollarFenceLines(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inDisplay = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? "";
    if (trimmed === "$$") {
      out.push("$$");
      inDisplay = !inDisplay;
      continue;
    }

    if (trimmed !== "$") {
      out.push(lines[i] ?? "");
      continue;
    }

    if (inDisplay) {
      out.push("$$");
      inDisplay = false;
    }
  }

  return out.join("\n");
}

function isLikelyInlineMathExpression(expression: string): boolean {
  const trimmed = expression.trim().replace(/[.,;:!?]+$/g, "").trim();
  if (!trimmed || trimmed.length > 64) return false;
  if (/\n|@@CODE_BLOCK_|@@MATH_BLOCK_/.test(trimmed)) return false;

  const wordCount = (trimmed.match(/[A-Za-z]{2,}/g) ?? []).length;
  const hasMathShape =
    /[=^_]|'/.test(trimmed) ||
    /\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\s*\(/i.test(trimmed) ||
    /\b\d+[a-z](?:\^\{?-?\d+\}?|\^\d+)?\b/i.test(trimmed) ||
    /\b[a-z](?:\^\{?-?\d+\}?|\^\d+)\b/i.test(trimmed) ||
    /\b[a-z][a-z0-9']*(?:\([^)\n]+\)|')/i.test(trimmed) ||
    /\b\d+(?:\.\d+)?\/\d+(?:\.\d+)?\b/.test(trimmed);

  if (!hasMathShape) return false;
  if (/\\(?:frac|sqrt|int|sum|lim|begin|left|right|text|operatorname|matrix|cases)\b/.test(trimmed)) {
    return false;
  }

  return wordCount <= 3;
}

function normalizeInlineDollarMath(content: string): string {
  const displayTokens: string[] = [];
  const inlineTokens: string[] = [];

  const protectedContent = content.replace(/\$\$/g, () => {
    const token = `@@DISPLAY_DOLLAR_${displayTokens.length}@@`;
    displayTokens.push("$$");
    return token;
  });

  const normalizedInline = protectedContent.replace(/\$([^\n$]+?)\$/g, (match, expr: string) => {
    if (!isLikelyInlineMathExpression(expr)) return expr.trim();
    const token = `@@INLINE_MATH_${inlineTokens.length}@@`;
    inlineTokens.push(`$${expr.trim()}$`);
    return token;
  });

  return normalizedInline
    .replace(/@@INLINE_MATH_(\d+)@@/g, (_match, index: string) => inlineTokens[Number(index)] ?? "")
    .replace(/@@DISPLAY_DOLLAR_(\d+)@@/g, (_match, index: string) => {
      return displayTokens[Number(index)] ?? "$$";
    });
}

function wrapBareInlineMath(text: string): string {
  const lines = text.split("\n");
  const inlineMathAtom =
    String.raw`(?:e\^\([^)\n]+\)|e\^\{[^}\n]+\}|(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\s*\([^)\n]+\)|[A-Za-z][A-Za-z0-9']*\([^)\n]+\)|[0-9]+(?:\.[0-9]+)?|[0-9]*[A-Za-z](?:\^\{?-?\d+\}?|\^\d+)?|[A-Za-z](?:\^\{?-?\d+\}?|\^\d+)?|[0-9]+(?:\.[0-9]+)?\/[0-9]+(?:\.[0-9]+)?)`;
  const richInlineMathAtom =
    String.raw`(?:e\^\([^)\n]+\)|e\^\{[^}\n]+\}|(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\s*\([^)\n]+\)|[A-Za-z][A-Za-z0-9']*\([^)\n]+\)|[0-9]*[A-Za-z](?:\^\{?-?\d+\}?|\^\d+)|[A-Za-z]\^\{?-?\d+\}?|[0-9]+(?:\.[0-9]+)?\/[0-9]+(?:\.[0-9]+)?)`;
  const inlineTokens: string[] = [];

  const wrapSegment = (segment: string) => {
    if (
      !segment.trim() ||
      containsRawLatexCommand(segment) ||
      segment.includes("@@CODE_BLOCK_") ||
      segment.includes("@@MATH_BLOCK_") ||
      /^#{1,6}\s/.test(segment.trim()) ||
      /^\s*[-*]\s/.test(segment)
    ) {
      return segment;
    }

    const protectInline = (expr: string) => {
      if (!isLikelyInlineMathExpression(expr)) return expr;
      const trimmed = normalizeTrigFunctions(normalizeExponents(expr.trim()));
      if (/^\$.*\$$/.test(trimmed)) return trimmed;
      const token = `@@INLINE_WRAP_${inlineTokens.length}@@`;
      inlineTokens.push(`$${trimmed}$`);
      return token;
    };

    let wrapped = segment.replace(
      new RegExp(
        String.raw`(^|[\s(,])((?:e\^\([^)\n]+\)|e\^\{[^}\n]+\}|(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt)\s*\([^)\n]+\)))(?=[\s).,;:!?*]|$)`,
        "g"
      ),
      (_match, lead: string, expr: string) => `${lead}${protectInline(expr)}`
    );

    wrapped = wrapped.replace(
      new RegExp(
        String.raw`(^|[\s(,])((?:${richInlineMathAtom})(?:\s*(?:${richInlineMathAtom}))+)(?=[\s).,;:!?]|$)`,
        "g"
      ),
      (_match, lead: string, expr: string) => `${lead}${protectInline(expr)}`
    );

    wrapped = wrapped.replace(
      new RegExp(
        String.raw`(^|[\s(,])((?:${inlineMathAtom})(?:\s*[=+\-*/^]\s*(?:${inlineMathAtom}))+)(?=[\s).,;:!?]|$)`,
        "g"
      ),
      (_match, lead: string, expr: string) => `${lead}${protectInline(expr)}`
    );

    wrapped = wrapped.replace(
      new RegExp(
        String.raw`\b(of|is|are|equals|becomes|gives|yields|with|using)\s+(${inlineMathAtom})(?=[\s).,;:!?]|$)`,
        "g"
      ),
      (_match, lead: string, expr: string) => `${lead} ${protectInline(expr)}`
    );

    wrapped = wrapped.replace(
      new RegExp(
        String.raw`(^|[\s(,])(${inlineMathAtom})(?=[\s).,;:!?]|$)`,
        "g"
      ),
      (_match, lead: string, expr: string) => `${lead}${protectInline(expr)}`
    );

    return wrapped.replace(/[ \t]{2,}/g, " ");
  };

  const wrapLine = (line: string) => {
    if (!line.trim() || line.includes("$$")) return line;
    return line
      .split(/(\$[^\n$]+\$)/g)
      .map((segment) => {
        if (/^\$[^\n$]+\$$/.test(segment)) return segment;
        return wrapSegment(segment);
      })
      .join("");
  };

  let restored = lines
    .map(wrapLine)
    .join("\n");

  while (/@@INLINE_WRAP_(\d+)@@/.test(restored)) {
    restored = restored.replace(/@@INLINE_WRAP_(\d+)@@/g, (_match, index: string) => inlineTokens[Number(index)] ?? "");
  }

  return restored;
}

function normalizeInlineMathSpacing(content: string): string {
  return content
    .replace(/(\$[^\n$]+\$)(?=\$[^\n$]+\$)/g, "$1 ")
    .replace(/([,:;])(?=\$[^\n$]+\$)/g, "$1 ")
    .replace(/([A-Za-z0-9)\]])(?=\$[^\n$]+\$)/g, "$1 ")
    .replace(/(\$[^\n$]+\$)(?=[A-Za-z0-9(\\[])/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ");
}

function repairLooseMathLines(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inDisplay = false;

  const startsRawLatex = (line: string) =>
    /^\\(?:begin|end|frac|sqrt|int|sum|lim|ln|log|sin|cos|tan|sec|csc|cot|cdot|vec|bar|hat|overline|underline|alpha|beta|theta|pi|infty|leq|geq|neq|text|operatorname)\b/.test(
      line
    );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "$" || trimmed === "$$") {
      out.push("$$");
      inDisplay = !inDisplay;
      continue;
    }

    if (!inDisplay && /^\\begin\{[A-Za-z*]+\}/.test(trimmed)) {
      const block = [trimmed];
      const envName = trimmed.match(/^\\begin\{([A-Za-z*]+)\}/)?.[1];

      if (envName && trimmed.includes(`\\end{${envName}}`)) {
        out.push("$$", block.join("\n"), "$$");
        continue;
      }

      while (envName && i + 1 < lines.length) {
        i++;
        const next = (lines[i] ?? "").trim();
        if (next === "$" || next === "$$") continue;
        block.push(next);
        if (next.includes(`\\end{${envName}}`)) break;
      }

      out.push("$$", block.join("\n"), "$$");
      continue;
    }

    if (!inDisplay && startsRawLatex(trimmed)) {
      out.push("$$", trimmed, "$$");
      continue;
    }

    out.push(line);
  }

  return collapseNestedDisplayMath(out.join("\n"));
}

function containsRawLatexCommand(line: string): boolean {
  const outsideInlineMath = line.replace(/\$[^\n$]+\$/g, "");
  return /\\(?:frac|sqrt|int|sum|lim|begin|left|right|ln|log|sin|cos|tan|sec|csc|cot|cdot|vec|bar|hat|overline|underline|alpha|beta|theta|pi|infty|leq|geq|neq|text|operatorname)\b/.test(
    outsideInlineMath
  );
}

function repairInvalidBackslashNumbers(content: string): string {
  return content.replace(/(?<!\\)\\(?=\d)/g, "");
}

function cleanExtractedMathExpression(expression: string): string {
  let cleaned = expression
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\.$/, "")
    .trim();

  cleaned = cleaned
    .replace(/\s+and\s+([A-Za-z][A-Za-z0-9']*(?:\([^)]*\))?\s*=)/gi, "\\\\ $1")
    .replace(/\s*,\s*dx\b/g, "\\,dx")
    .replace(/\bint\s+/gi, "\\int ");

  if (/\\\\/.test(cleaned) && !/\\begin\{/.test(cleaned)) {
    cleaned = `\\begin{aligned}${cleaned}\\end{aligned}`;
  }

  return cleaned;
}

function hasBalancedBraces(expression: string): boolean {
  let depth = 0;

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    const prev = expression[i - 1];
    if (prev === "\\") continue;
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth < 0) return false;
  }

  return depth === 0;
}

function splitMathAndTrailingProse(rawMath: string): { math: string; suffix: string } {
  const math = rawMath.trim();
  if (!math) return { math: "", suffix: "" };

  const sentenceSplit = math.match(
    /^([\s\S]*?)([.!?])\s+((?:We|This|That|Since|Therefore|Now|Then|So|Remember|The|A|An|If|It|Because|Here|Notice|Keep)\b[\s\S]*)$/
  );

  if (sentenceSplit) {
    const candidate = `${sentenceSplit[1] ?? ""}${sentenceSplit[2] ?? ""}`.trim();
    const suffix = (sentenceSplit[3] ?? "").trim();
    if (containsRawLatexCommand(candidate) && hasBalancedBraces(candidate)) {
      return { math: candidate.replace(/[.!?]\s*$/, "").trim(), suffix };
    }
  }

  const proseSplit = math.match(
    /^([\s\S]*?(?:\}|[)\]]|[A-Za-z0-9]))\s+((?:for|where|when|which|because|since|therefore|so|then|this|that|is|are|can|will|means|gives|becomes|converges|diverges|satisfies|fails|holds)\b[\s\S]*)$/i
  );

  if (proseSplit) {
    const candidate = (proseSplit[1] ?? "").trim();
    const suffix = (proseSplit[2] ?? "").trim();
    const candidateHasEquation = /=|\\(?:frac|sqrt|int|sum|lim|begin|left|right|infty|neq|leq|geq)\b/.test(candidate);
    if (candidateHasEquation && containsRawLatexCommand(candidate) && hasBalancedBraces(candidate)) {
      return { math: candidate.replace(/[,:;]\s*$/, "").trim(), suffix };
    }
  }

  const commaProseSplit = math.match(
    /^([\s\S]*?(?:\}|[)\]]|[A-Za-z0-9]))\s*[,;:]\s+((?:this|that|which|so|therefore|meaning|means|for|where|when|because|since)\b[\s\S]*)$/i
  );

  if (commaProseSplit) {
    const candidate = (commaProseSplit[1] ?? "").trim();
    const suffix = (commaProseSplit[2] ?? "").trim();
    const candidateHasEquation = /=|\\(?:frac|sqrt|int|sum|lim|begin|left|right|infty|neq|leq|geq)\b/.test(candidate);
    if (candidateHasEquation && containsRawLatexCommand(candidate) && hasBalancedBraces(candidate)) {
      return { math: candidate.replace(/[,:;]\s*$/, "").trim(), suffix };
    }
  }

  return { math, suffix: "" };
}

function splitRawLatexLine(line: string): string | null {
  if (!containsRawLatexCommand(line)) return null;
  if (line.includes("@@CODE_BLOCK_") || line.includes("@@MATH_BLOCK_")) return null;

  const trimmed = line.trim();
  if (!trimmed || /^#{1,6}\s/.test(trimmed)) return null;

  const latexIndex = trimmed.search(
    /\\(?:frac|sqrt|int|sum|lim|begin|left|right|ln|log|sin|cos|tan|sec|csc|cot|cdot|vec|bar|hat|overline|underline|alpha|beta|theta|pi|infty|leq|geq|neq|text|operatorname)\b/
  );
  if (latexIndex < 0) return null;

  const beforeLatex = trimmed.slice(0, latexIndex);
  const assignmentMatches = [
    ...beforeLatex.matchAll(/[A-Za-z][A-Za-z0-9']*(?:\([^)]*\))?\s*=\s*[^=]*$/g),
  ];
  const isExpressionMatches = [
    ...beforeLatex.matchAll(/\bis\s+([A-Za-z0-9()[\]{}^_+\-*/\s]+)$/gi),
  ].filter((match) => /(?:[A-Za-z]\([^)]*\)|[A-Za-z]_[A-Za-z0-9{}]+|[A-Za-z]\s*=|\d|[+\-*/^])/.test(match[1] ?? ""));
  const startIndex = assignmentMatches.length
    ? assignmentMatches[assignmentMatches.length - 1].index ?? latexIndex
    : isExpressionMatches.length
      ? (isExpressionMatches[isExpressionMatches.length - 1].index ?? latexIndex) +
        ((isExpressionMatches[isExpressionMatches.length - 1][0] ?? "").length -
          (isExpressionMatches[isExpressionMatches.length - 1][1] ?? "").length)
      : latexIndex;

  let prefix = trimmed.slice(0, startIndex).trim();
  let math = trimmed.slice(startIndex).trim();

  const variablePrefix = prefix.match(/^(.*?\b(?:for|if|when|where|since)\s+)([A-Za-z][A-Za-z0-9]*)$/i);
  if (variablePrefix && /^\\(?:neq|leq|geq)\b/.test(math)) {
    prefix = (variablePrefix[1] ?? "").trim();
    math = `${variablePrefix[2] ?? ""} ${math}`.trim();
  }

  const colonIndex = prefix.lastIndexOf(":");
  if (startIndex === latexIndex && colonIndex >= 0) {
    prefix = prefix.slice(0, colonIndex + 1).trim();
  }

  prefix = prefix.replace(/^[*-]\s+/, "").trim();
  const split = splitMathAndTrailingProse(math);
  math = cleanExtractedMathExpression(split.math);
  if (!math) return null;

  const parts = [];
  if (prefix && !/^\*\*Step\s+\d+:/i.test(prefix)) {
    parts.push(prefix);
    parts.push("");
  }
  parts.push("$$", math, "$$");
  if (split.suffix) {
    parts.push("", split.suffix);
  }
  return parts.join("\n");
}

function repairRawLatexOutsideDisplay(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inDisplay = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "$$" || trimmed === "$") {
      out.push("$$");
      inDisplay = !inDisplay;
      continue;
    }

    out.push(inDisplay ? line : splitRawLatexLine(line) ?? line);
  }

  return out.join("\n");
}

function normalizeBrokenMarkdown(content: string): string {
  return content
    .replace(/\*\*\s*Step\s*-\s*by\s*-\s*Step\s*Solution\s*\*\*/gi, "**Step-by-Step Solution**")
    .replace(/\*\s*\*\s*Step\s*-\s*by\s*-\s*Step\s*Solution\s*\*\s*\*/gi, "**Step-by-Step Solution**")
    .replace(/\*\*\s*Step\s*(\d+)\s*:\s*([^*\n]+?)\s*\*\*/gi, (_match, n: string, title: string) => {
      return `**Step ${n}: ${title.trim()}**`;
    })
    .replace(/\*\s*\*\s*Step\s*(\d+)\s*:\s*([^*\n]+?)\s*\*\s*\*/gi, (_match, n: string, title: string) => {
      return `**Step ${n}: ${title.trim()}**`;
    })
    .replace(/\*\*\s*Ch+e?ck\s*point\s*\*\*/gi, "**Checkpoint**")
    .replace(/\*\*\s*Ch+ck\s*point\s*\*\*/gi, "**Checkpoint**")
    .replace(/[ \t]+(#{1,3}\s*Final Answer:?\s*)/gi, "\n\n$1")
    .replace(/^#{0,3}\s*Final Answer:?\s*$/gim, "## Final Answer");
}

function unwrapNonMathDisplayBlocks(content: string): string {
  return content.replace(/\$\$([\s\S]*?)\$\$/g, (match, expr: string) => {
    const normalized = normalizeBrokenMarkdown(expr.trim());
    if (!normalized) return "";

    const isMarkdownStructure =
      /^\s*(#{1,6}\s+|\*\*[^*\n]+\*\*)/m.test(normalized) ||
      /\b(Step-by-Step Solution|Step\s+\d+:|Final Answer|Formula used|Rule used|Method used|Checkpoint|Lecture Connection)\b/i.test(
        normalized
      );
    const hasLatexCommand = /\\(?:frac|sqrt|int|sum|lim|ln|log|sin|cos|tan|begin|left|right|cdot|,|;|!)/.test(
      normalized
    );
    const hasEquationShape = /[=^_+\-*/]|f'\(x\)|[A-Za-z]\([A-Za-z]\)/.test(normalized);
    const wordCount = (normalized.match(/[A-Za-z]{2,}/g) ?? []).length;
    const proseOnly = wordCount >= 4 && !hasLatexCommand && !hasEquationShape;

    if (isMarkdownStructure || proseOnly) {
      return `\n\n${normalized}\n\n`;
    }

    return match;
  });
}

function repairSplitInequalityBlocks(content: string): string {
  return content.replace(
    /\b(For|If|When|Where|Since)\b\s*\n+\$\$\n([A-Za-z][A-Za-z0-9]*)\n\$\$\s*\n+\$\$\n\\(neq|leq|geq)\s+([^,\n]+),\s*([\s\S]*?)\n\$\$/g,
    (_match, lead: string, variable: string, operator: string, value: string, suffix: string) => {
      return `${lead}\n$$\n${variable} \\${operator} ${value.trim()}\n$$\n\n${suffix.trim()}`;
    }
  );
}

function repairSeriesTestProse(content: string): string {
  return content
    .replace(
      /(The AST states that an alternating series)\s+(\\sum_\{n=1\}\^\{\\infty\}\s*\(-1\)\^\{n-1\}\s*b_n)\s+(converges if the following two conditions are met\.?)/gi,
      (_match, prefix: string, formula: string, suffix: string) => {
        return `${prefix}:\n$$\n${formula.trim()}\n$$\n${suffix}`;
      }
    )
    .replace(
      /(\d+\.\s*b_n is decreasing,\s*i\.e\.,)\s*(b_\{n\+1\}\s*\\leq\s*b_n)\s*(for all n\.?)/gi,
      (_match, prefix: string, formula: string, suffix: string) => {
        return `${prefix}\n$$\n${formula.trim()}\n$$\n${suffix}`;
      }
    )
    .replace(
      /(\d+\.\s*The limit of b_n as n approaches infinity is zero,\s*i\.e\.,)\s*(\\lim_\{n\s*\\to\s*\\infty\}\s*b_n\s*=\s*0)\.?/gi,
      (_match, prefix: string, formula: string) => {
        return `${prefix}\n$$\n${formula.trim()}\n$$`;
      }
    )
    .replace(
      /(Alternating Series Test \(AST\): An alternating series)\s+(\\sum_\{n=1\}\^\{\\infty\}\s*\(-1\)\^\{n-1\}\s*\\frac\{1\}\{n\})\s+(converges if)\s+(\\lim_\{n\s*\\to\s*\\infty\}\s*b_n\s*=\s*0)\.?/gi,
      (_match, prefix: string, series: string, connector: string, limit: string) => {
        return `${prefix}:\n$$\n${series.trim()}\n$$\n${connector}\n$$\n${limit.trim()}\n$$`;
      }
    );
}

function normalizeExponents(expression: string): string {
  // Normalize e^(...) to e^{...}
  // Pattern: e followed by ^ followed by ( and content, then )
  // Preserve e^{...} which is already correct
  return expression.replace(/e\^\(([^)]*)\)/g, "e^{$1}");
}

function normalizeTrigFunctions(expression: string): string {
  // Normalize sin(...), cos(...), tan(...), sec(...), csc(...), cot(...) to \sin(...), etc.
  // Avoid double-normalizing already-escaped versions
  let result = expression;

  // For each trig function, replace unescaped versions
  // We check if preceded by backslash to avoid double-escaping
  const trigFns = ["sin", "cos", "tan", "sec", "csc", "cot", "ln", "log", "sqrt"];

  for (const fn of trigFns) {
    // Match: word boundary + function name + optional whitespace + opening paren
    // Use a callback to check context and avoid double-escaping
    const pattern = new RegExp(`\\b${fn}\\s*\\(`, "g");
    let match;

    // Collect all matches first
    const matches: Array<{ index: number; text: string }> = [];
    while ((match = pattern.exec(result)) !== null) {
      matches.push({ index: match.index, text: match[0] });
    }

    // Replace from end to start to avoid index shifting
    for (let i = matches.length - 1; i >= 0; i--) {
      const { index } = matches[i];
      // Check if preceded by backslash (avoid double-escaping)
      if (index === 0 || result[index - 1] !== "\\") {
        // Find the paren position
        const parenPos = result.indexOf("(", index);
        const replacement = result.substring(index, parenPos);
        result = result.substring(0, index) + `\\${replacement}` + result.substring(parenPos);
      }
    }
  }

  return result;
}

function normalizeInlineMathExpressions(content: string): string {
  // Apply exponential and trig function normalization to all inline math
  // Pattern: $...$
  return content.replace(/\$([^\n$]+?)\$/g, (match, expr: string) => {
    // Don't normalize if it's display math or contains code block tokens
    if (match.includes("@@")) return match;
    const normalized = normalizeTrigFunctions(normalizeExponents(expr.trim()));
    return `$${normalized}$`;
  });
}

function normalizeMathMarkdown(content: string, { ensureFinalAnswer }: { ensureFinalAnswer: boolean }): string {
  if (!content || typeof content !== "string") return "";

  const stableContent =
    (content.match(/```/g) ?? []).length % 2 === 1 ? `${content}\n\`\`\`` : content;

  const codeBlocks: string[] = [];
  let cleaned = stableContent.replace(CODE_FENCE_PATTERN, (match) => {
    const body = match
      .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
      .replace(/```$/, "")
      .trim();
    if (!body || body === "$" || body === "$$") return "";

    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    codeBlocks.push(match);
    return token;
  });

  cleaned = cleaned
    .replace(/\r\n/g, "\n")
    .replace(/\\boxed\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, "$1")
    .replace(
      /\\\\(frac|sqrt|int|sum|lim|begin|left|right|ln|log|sin|cos|tan|sec|csc|cot|cdot|vec|bar|hat|overline|underline|alpha|beta|theta|pi|infty|leq|geq|neq|text|operatorname)\b/g,
      "\\$1"
    )
    .replace(/\bInt\s+/g, "\\int ")
    .replace(/\${3,}/g, "$$$$")
    .replace(/[ \t]+\$(?=\s*$)/gm, "")
    .replace(/\*\*\s*Formula\s+used\s*:\s*\*\*/gi, "**Formula used:**")
    .replace(/\*\*\s*Rule\s+used\s*:\s*\*\*/gi, "**Rule used:**");

  cleaned = normalizeEscapedMathDelimiters(cleaned);
  cleaned = normalizeDollarFenceLines(cleaned);
  cleaned = normalizeInlineDollarMath(cleaned);
  cleaned = repairInvalidBackslashNumbers(cleaned);
  cleaned = repairSeriesTestProse(cleaned);
  cleaned = normalizeBrokenMarkdown(cleaned);
  cleaned = unwrapNonMathDisplayBlocks(cleaned);
  cleaned = repairSplitInequalityBlocks(cleaned);
  cleaned = collapseNestedDisplayMath(cleaned);
  cleaned = wrapBareLatexEnvironments(cleaned);
  cleaned = collapseNestedDisplayMath(cleaned);
  cleaned = repairLooseMathLines(cleaned);
  cleaned = unwrapNonMathDisplayBlocks(cleaned);

  const displayBlocks: string[] = [];
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    if (!trimmed || trimmed === "$" || trimmed === "$$") return "";
    const token = `@@MATH_BLOCK_${displayBlocks.length}@@`;
    const split = splitMathAndTrailingProse(trimmed);
    if (split.suffix && split.math && containsRawLatexCommand(split.math)) {
      const normalized = normalizeTrigFunctions(normalizeExponents(cleanExtractedMathExpression(split.math)));
      displayBlocks.push(`$$\n${normalized}\n$$`);
      return `${token}\n\n${split.suffix}`;
    }

    const normalized = normalizeTrigFunctions(normalizeExponents(trimmed));
    displayBlocks.push(`$$\n${normalized}\n$$`);
    return token;
  });

  cleaned = repairRawLatexOutsideDisplay(cleaned);
  cleaned = wrapBareInlineMath(cleaned);
  cleaned = normalizeInlineMathExpressions(cleaned);
  cleaned = normalizeInlineMathSpacing(cleaned);

  cleaned = cleaned.replace(/^([^\n]*\\(?:frac|sqrt|int|sum|lim|begin|left|right|ln|log|sin|cos|tan|sec|csc|cot|cdot|vec|bar|hat|overline|underline|alpha|beta|theta|pi|infty|leq|geq|neq|text|operatorname)[^\n]*)$/gm, (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes("@@CODE_BLOCK_") || trimmed.includes("@@MATH_BLOCK_")) return line;
    if (!containsRawLatexCommand(trimmed)) return line;
    if (/^[*-]\s/.test(trimmed)) return line;
    if (/\b(?:Formula used|Rule used|Method used|Step|Final Answer)\b/i.test(trimmed)) return line;
    const split = splitRawLatexLine(line);
    if (split) return split;
    return `$$\n${cleanExtractedMathExpression(trimmed)}\n$$`;
  });

  cleaned = normalizeBrokenMarkdown(cleaned);
  cleaned = unwrapNonMathDisplayBlocks(cleaned);
  cleaned = repairSplitInequalityBlocks(cleaned);
  cleaned = repairSeriesTestProse(cleaned);
  cleaned = cleaned.replace(/@@MATH_BLOCK_(\d+)@@/g, (_match, index: string) => {
    return displayBlocks[Number(index)] ?? "";
  });
  cleaned = collapseNestedDisplayMath(cleaned);
  cleaned = repairLooseMathLines(cleaned);
  cleaned = repairRawLatexOutsideDisplay(cleaned);
  cleaned = repairSplitInequalityBlocks(cleaned);
  cleaned = normalizeDollarFenceLines(cleaned);
  cleaned = collapseNestedDisplayMath(cleaned);

  if (ensureFinalAnswer && !/## Final Answer/i.test(cleaned) && /(\*\*Step-by-Step Solution\*\*|\\int|\\frac|f'\(x\)|=)/.test(cleaned)) {
    const mathBlocks = [...cleaned.matchAll(/\$\$([\s\S]*?)\$\$/g)];
    const lastMathBlock = mathBlocks[mathBlocks.length - 1]?.[1]?.trim();
    if (lastMathBlock) {
      cleaned += `\n\n## Final Answer\n$$\n${lastMathBlock}\n$$`;
    }
  }

  cleaned = cleaned
    .replace(/^\s*\$(?!\$)\s*$/gm, "")
    .replace(/^\s*\$\$\s*$/gm, "$$$$")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/@@CODE_BLOCK_(\d+)@@/g, (_match, index: string) => codeBlocks[Number(index)] ?? "");

  cleaned = normalizeBrokenMarkdown(cleaned);
  cleaned = unwrapNonMathDisplayBlocks(cleaned);
  cleaned = repairSplitInequalityBlocks(cleaned);
  cleaned = collapseNestedDisplayMath(cleaned);
  cleaned = repairLooseMathLines(cleaned);
  cleaned = repairRawLatexOutsideDisplay(cleaned);
  cleaned = repairSplitInequalityBlocks(cleaned);
  cleaned = normalizeDollarFenceLines(cleaned);
  cleaned = normalizeInlineDollarMath(cleaned);
  cleaned = normalizeInlineMathSpacing(cleaned);
  cleaned = repairInvalidBackslashNumbers(cleaned);
  cleaned = collapseNestedDisplayMath(cleaned);

  const fenceCount = (cleaned.match(/\$\$/g) ?? []).length;
  if (fenceCount % 2 === 1) {
    const lastFenceIndex = cleaned.lastIndexOf("$$");
    const afterLastFence = cleaned.slice(lastFenceIndex + 2).trim();
    cleaned = afterLastFence
      ? `${cleaned}\n$$`
      : cleaned.slice(0, lastFenceIndex).trimEnd();
  }

  return cleaned
    .replace(/\$([^\n$]+)\$/g, (_match, expr: string) => `$${expr.trim()}$`)
    .replace(/^\s*\$\$\$\$\s*$/gm, "$$$$\n\n$$$$")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeModelMathOutput(content: string): string {
  return normalizeMathMarkdown(content, { ensureFinalAnswer: true });
}

export function sanitizeMathContent(content: string): string {
  return normalizeMathMarkdown(content, { ensureFinalAnswer: false });
}
