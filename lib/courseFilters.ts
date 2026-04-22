export const COURSE_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "PreCalc1", patterns: [/\bpre\s*calc(?:\s*1)?\b/i, /\bprecalc(?:\s*1)?\b/i, /\bprecalculus(?:\s*1)?\b/i, /\bpracalc\s*1\b/i] },
  { label: "Calculus 1", patterns: [/calc\s*1/i, /calculus\s*i\b/i, /calculus\s*1/i] },
  { label: "Calculus 2", patterns: [/calc\s*2/i, /calculus\s*ii\b/i, /calculus\s*2/i] },
  { label: "Calculus 3", patterns: [/calc\s*3/i, /calculus\s*iii\b/i, /calculus\s*3/i] },
  { label: "Differential Equations", patterns: [/differential\s*equations?/i, /\bde\b/i] },
  { label: "Statistics", patterns: [/\bstats?\b/i, /\bstatistics\b/i] },
  { label: "Elementary Algebra", patterns: [/elementary\s*algebra/i, /\balgebra\b/i] },
];

export function detectCourseFilter(question: string, fallback?: string): string | undefined {
  for (const check of COURSE_PATTERNS) {
    if (check.patterns.some((pattern) => pattern.test(question))) return check.label;
  }
  return fallback || undefined;
}

export function inferCourseFromMathTopic(question: string, fallback?: string): string | undefined {
  const explicit = detectCourseFilter(question, fallback);
  if (explicit) return explicit;

  if (/\b(derivative|differentiate|limit|tangent|chain rule|product rule|quotient rule|l'?hopital|optimization|related rates)\b/i.test(question)) {
    return "Calculus 1";
  }

  if (/\b(integral|integrate|u[-\s]?sub|substitution|integration by parts|series|sequence|converge|diverge|ratio test|comparison test|alternating series|AST|power series|taylor|maclaurin)\b/i.test(question)) {
    return "Calculus 2";
  }

  if (/\b(partial derivative|gradient|vector|dot product|cross product|line integral|surface integral|double integral|triple integral|parametric|polar|cylindrical|spherical)\b/i.test(question)) {
    return "Calculus 3";
  }

  if (/\b(probability|statistics|mean|median|variance|standard deviation|hypothesis|confidence interval|p[-\s]?value|z[-\s]?score|normal distribution|bayes|posterior|prior|conditional probability|overfitting|regularization|bias[-\s]?variance)\b/i.test(question)) {
    return "Statistics";
  }

  if (/\b(differential equation|slope field|separable|first[-\s]?order|laplace|linear equation|initial value)\b/i.test(question)) {
    return "Differential Equations";
  }

  if (/\b(factor|factoring|synthetic division|polynomial division|linear equation|quadratic|exponent rules|radical|system of equations)\b/i.test(question)) {
    return "Elementary Algebra";
  }

  return fallback || undefined;
}
