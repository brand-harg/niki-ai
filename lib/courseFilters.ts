export const COURSE_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Calculus 1", patterns: [/calc\s*1/i, /calculus\s*i\b/i, /calculus\s*1/i] },
  { label: "Calculus 2", patterns: [/calc\s*2/i, /calculus\s*ii\b/i, /calculus\s*2/i] },
  { label: "Calculus 3", patterns: [/calc\s*3/i, /calculus\s*iii\b/i, /calculus\s*3/i] },
  { label: "Differential Equations", patterns: [/differential\s*equations?/i, /\bde\b/i] },
  { label: "Precalculus 1", patterns: [/precalc\s*1/i, /precalculus\s*1/i, /pracalc\s*1/i] },
  { label: "Statistics", patterns: [/\bstats?\b/i, /\bstatistics\b/i] },
  { label: "Elementary Algebra", patterns: [/elementary\s*algebra/i, /\balgebra\b/i] },
];

export function detectCourseFilter(question: string, fallback?: string): string | undefined {
  for (const check of COURSE_PATTERNS) {
    if (check.patterns.some((pattern) => pattern.test(question))) return check.label;
  }
  return fallback || undefined;
}