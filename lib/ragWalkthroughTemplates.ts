type GroundedLectureWalkthroughInput = {
  lectureTitle: string;
  course: string;
  lower: string;
  keyIdeas: string[];
  excerpts: { time: string; excerpt: string; sortValue: number }[];
};

export function buildGroundedLectureWalkthrough({
  lectureTitle,
  course,
  lower,
  keyIdeas,
  excerpts,
}: GroundedLectureWalkthroughInput): string[] {
  const titleLower = lectureTitle.toLowerCase();
  const courseLower = course.toLowerCase();
  const combined = `${courseLower} ${titleLower} ${lower}`;
  const lines: string[] = [];

  lines.push("**Board Setup**");
  lines.push(`Today we are rebuilding **${lectureTitle}** from the recovered transcript evidence.`);
  lines.push("");
  lines.push("What we are trying to understand:");
  if (keyIdeas.length) {
    lines.push(...keyIdeas.map((idea) => `- ${idea}`));
  } else {
    lines.push("- The transcript chunks below are the grounding source, so we will follow the lecture order instead of inventing a new lesson.");
  }
  lines.push("");
  lines.push("**Lecture Walkthrough**");

  if (/derivative|rate of change|differentiation/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("A derivative is not just a button you press on an expression. It measures change. On a graph, that means slope. So when the lecture talks about derivative as a function, the point is that we start with one function and produce another function that reports slope/change.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("f'(x)=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}");
    lines.push("$$");
    lines.push("");
    lines.push("This is the board definition behind the shortcut rules. The rules are faster, but this limit is what gives them meaning.");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Use the limit definition to understand what is happening, then use derivative rules to move faster once the structure is clear.");
    lines.push("");
    lines.push("**Application**");
    lines.push("Apply the recovered lecture idea by translating each example into a slope/change question before using a shortcut rule.");

    if (/x squared|x\s*(?:\^|\\\^)?2|2x/.test(lower)) {
      lines.push("");
      lines.push("**Model example from the lecture**");
      lines.push("The transcript connects this to the standard example: the derivative of x squared becomes 2x. That example matters because it shows an input function turning into a new output function.");
      lines.push("$$");
      lines.push("f(x)=x^2");
      lines.push("$$");
      lines.push("$$");
      lines.push("f'(x)=2x");
      lines.push("$$");
    }

    if (/horizontal|minimum|maximum|min|max/.test(lower)) {
      lines.push("");
      lines.push("**What happens at flat points**");
      lines.push("When the tangent line is horizontal, its slope is 0. That is why local maximum and minimum points are connected to derivative value 0.");
      lines.push("$$");
      lines.push("f'(x)=0");
      lines.push("$$");
      lines.push("Keep this one in your head because it comes back in optimization and graph analysis.");
    }

    if (/average speed|average rate|secant|rate of change/.test(lower)) {
      lines.push("");
      lines.push("**Average rate versus instant rate**");
      lines.push("Average rate of change uses a secant line over an interval. Instantaneous rate of change uses the tangent line at one point. Derivatives are about that instantaneous rate.");
      lines.push("$$");
      lines.push("\\text{average rate of change}=\\frac{f(b)-f(a)}{b-a}");
      lines.push("$$");
    }

    if (/constant.*0|change of a constant is 0|no change/.test(lower)) {
      lines.push("");
      lines.push("**Constant functions**");
      lines.push("A constant has no change, so its derivative is 0.");
      lines.push("$$");
      lines.push("\\frac{d}{dx}(c)=0");
      lines.push("$$");
    }

    lines.push("");
    lines.push("**If You Missed Class**");
    lines.push("Do not memorize this as random symbol pushing. The board logic is: derivative means slope/change, the limit formula defines it, shortcut rules make it faster, and flat tangent lines give derivative 0.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("If a graph has a horizontal tangent line at x = 4, what should f'(4) be?");
    return lines;
  }

  if (/alternating series|alternating series test|\bast\b/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("The Alternating Series Test is for series whose signs switch back and forth. The point is not to find the exact sum. The point is to prove convergence by checking the positive part.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("\\sum_{n=1}^{\\infty}(-1)^{n-1}b_n");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Do not try to add the series. Strip off the alternating sign, test the positive b_n, and then apply the test.");
    lines.push("");
    lines.push("**Application**");
    lines.push("First, b_n should decrease. Second, b_n should approach 0.");
    lines.push("$$");
    lines.push("b_{n+1}\\le b_n");
    lines.push("$$");
    lines.push("$$");
    lines.push("\\lim_{n\\to\\infty}b_n=0");
    lines.push("$$");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("If b_n goes to 0 but is not decreasing, why is the Alternating Series Test not ready to use yet?");
    return lines;
  }

  if (/series|power series|radius|interval of convergence/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("A power series rewrites a function as an infinite polynomial-like expression. The main job is to identify the center, coefficients, and where the series converges.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("\\sum_{n=0}^{\\infty}c_n(x-a)^n");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Use the ratio test to find the radius of convergence, then test the endpoints separately because the ratio test usually becomes inconclusive there.");
    lines.push("");
    lines.push("**Application**");
    lines.push("For a recovered lecture, identify the center a, compute the radius from the coefficient pattern, then test each endpoint as its own series problem.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("After finding the radius of convergence, why do the endpoints still need to be tested?");
    return lines;
  }

  if (/limit|continuity|continuous|asymptote/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("A limit asks what value the function approaches, not necessarily what the function equals at that point. The board move is to simplify first when direct substitution creates an indeterminate form.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("\\lim_{x\\to a}f(x)=L");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("First try substitution. If that creates 0 over 0, factor, cancel, rationalize, or use a known limit before substituting again.");
    lines.push("");
    lines.push("**Application**");
    lines.push("Use the recovered lecture trail to decide whether the example is a direct-substitution limit, a removable discontinuity, or an asymptote/one-sided behavior problem.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("If direct substitution gives 0 over 0, why are we allowed to simplify before evaluating the limit?");
    return lines;
  }

  if (/integral|integration|antiderivative|area|substitution|parts/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("An indefinite integral asks for the family of antiderivatives. A definite integral accumulates signed area over an interval.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("\\int f(x)\\,dx=F(x)+C");
    lines.push("$$");
    lines.push("$$");
    lines.push("\\int_a^b f(x)\\,dx=F(b)-F(a)");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Identify the pattern first. Use substitution when the inside derivative is present, integration by parts when the expression is a product, and the fundamental theorem for definite integrals.");
    lines.push("");
    lines.push("**Application**");
    lines.push("For each recovered example, name the pattern before doing algebra: substitution, parts, accumulated area, or a basic antiderivative rule.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("How do you decide whether substitution or integration by parts is the better first move?");
    return lines;
  }

  if (/differential equation|ode|equation.*derivative|laplace|homogeneous|nonhomogeneous/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("A differential equation asks for a function, not just a number. The board move is to identify the type of equation before trying to solve it.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("y'=f(x,y)");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Check whether the equation is separable, linear, homogeneous, or higher order. Then use the matching method instead of forcing one technique onto every problem.");
    lines.push("");
    lines.push("**Application**");
    lines.push("Start by classifying the recovered example, then apply the matching method and only simplify after the structure is identified.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("What feature tells you that a differential equation is separable?");
    return lines;
  }

  if (/matrix|matrices|determinant|eigen|vector|row reduction|linear algebra/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("Matrices organize several calculations at once. The first board move is to identify whether we are multiplying, row reducing, finding a determinant, or looking for eigenvalues.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("A\\vec{x}=\\lambda\\vec{x}");
    lines.push("$$");
    lines.push("$$");
    lines.push("\\det(A-\\lambda I)=0");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("For row reduction, keep operations organized. For eigenvalues, form A minus lambda I, take the determinant, then solve the characteristic equation.");
    lines.push("");
    lines.push("**Application**");
    lines.push("Match the recovered board problem to the operation first, then write each row operation, determinant step, or eigenvalue step in order.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("Why do eigenvalues come from solving det(A - lambda I) = 0?");
    return lines;
  }

  if (/statistic|statistics|probability|mean|variance|standard deviation|normal|z-score|confidence/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("Statistics problems usually ask you to identify the quantity being measured, choose the correct formula, and interpret the result in context.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("\\mu=\\frac{1}{N}\\sum_{i=1}^{N}x_i");
    lines.push("$$");
    lines.push("$$");
    lines.push("z=\\frac{x-\\mu}{\\sigma}");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Separate the given values from the unknown. Then choose whether the problem is about center, spread, probability, sampling, or inference.");
    lines.push("");
    lines.push("**Application**");
    lines.push("Use the recovered lecture example to name the variable, plug into the matching formula, and interpret the number in the original context.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("What does a positive z-score tell you about a data value?");
    return lines;
  }

  if (/factor|quadratic|polynomial|rational|synthetic|algebra|equation|system/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("Algebra problems are about changing form without changing value. The board move is to choose the form that makes the next step easier.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("ax^2+bx+c=0");
    lines.push("$$");
    lines.push("$$");
    lines.push("x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Look for factoring first when the expression is simple. Use the quadratic formula when factoring is not clean. For systems, choose substitution or elimination based on which variable is easiest to remove.");
    lines.push("");
    lines.push("**Application**");
    lines.push("Apply the recovered board method by changing the expression into the form that exposes the next move: factors, roots, intercepts, or eliminated variables.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("When would elimination be faster than substitution in a system of equations?");
    return lines;
  }

  if (/trig|sine|cosine|tangent|unit circle|identity/.test(combined)) {
    lines.push("");
    lines.push("**Intuition**");
    lines.push("Trig problems usually depend on identities, unit-circle values, or rewriting everything in terms of sine and cosine.");
    lines.push("");
    lines.push("**Definition**");
    lines.push("$$");
    lines.push("\\sin^2(x)+\\cos^2(x)=1");
    lines.push("$$");
    lines.push("");
    lines.push("**Shortcut**");
    lines.push("Identify the identity that matches the expression, rewrite one piece at a time, and avoid changing both sides randomly.");
    lines.push("");
    lines.push("**Application**");
    lines.push("In the recovered example, rewrite the most complicated piece first, then use the identity or unit-circle value that makes the next line simpler.");
    lines.push("");
    lines.push("**Concept Check**");
    lines.push("Why is rewriting tangent as sine over cosine often useful?");
    return lines;
  }

  lines.push("");
  lines.push("**Intuition**");
  lines.push("The transcript evidence is partial, so the safest reconstruction is to teach from the recovered timestamps in order and extract the board logic from each segment.");
  lines.push("");
  lines.push("**Definition**");
  lines.push("The lecture-specific definition or rule has to come from the timestamped source evidence below.");
  lines.push("");
  lines.push("**Shortcut**");
  lines.push("Turn each recovered clip into one rule, one example, and one warning instead of memorizing the transcript wording.");
  lines.push("");
  lines.push("**Application**");
  for (const item of excerpts.slice(0, 3)) {
    lines.push(`- ${item.time ? `${item.time} ` : ""}${item.excerpt}`);
  }
  lines.push("");
  lines.push("**If You Missed Class**");
  lines.push("Use the timestamped clips below as source evidence. Start with the first clip, then pause after each main idea and write the board rule in your own words.");
  lines.push("");
  lines.push("**Concept Check**");
  lines.push("What is the first rule, definition, or method the lecture asks you to use?");
  return lines;
}
