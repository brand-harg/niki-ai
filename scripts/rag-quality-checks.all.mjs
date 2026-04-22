const allCourseQualityChecks = [
    {
        courseFilter: "PreCalc1",
        question: "How do inverse functions and rational functions prepare me for calculus?",
        expectedAny: ["inverse functions", "rational functions", "precalculus", "function"],
    },
    {
        courseFilter: "PreCalc1",
        question: "Where do complex numbers and quadratic functions show up in PreCalc?",
        expectedAny: ["complex numbers", "quadratic functions", "precalculus"],
    },
    {
        courseFilter: "Calculus 1",
        question: "How does the chain rule work for composite functions?",
        expectedAny: ["chain rule", "composite", "derivative", "calculus1"],
    },
    {
        courseFilter: "Calculus 2",
        question: "How do comparison tests help decide whether an infinite series converges?",
        expectedAny: ["comparison test", "series", "converge", "calculus2"],
    },
    {
        courseFilter: "Calculus 2",
        question: "What is the ratio test and how is it used for power series?",
        expectedAny: ["ratio test", "power series", "series", "calculus2"],
    },
    {
        courseFilter: "Calculus 3",
        question: "How do dot products and cross products differ for vectors in space?",
        expectedAny: ["dot product", "cross product", "vectors", "calculus3"],
    },
    {
        courseFilter: "Calculus 3",
        question: "How do partial derivatives describe functions of several variables?",
        expectedAny: ["partial derivative", "several variables", "calculus3", "derivative"],
    },
    {
        courseFilter: "Intro To Statistics",
        question: "How do measures of center and variation summarize data?",
        expectedAny: ["mean", "median", "variation", "standard deviation"],
    },
    {
        courseFilter: "Intro To Statistics",
        question: "What are the basic rules of probability for events?",
        expectedAny: ["probability", "events", "rules", "statistics"],
    },
    {
        courseFilter: "Differential Equations",
        question: "How do slope fields help visualize differential equations?",
        expectedAny: ["slope field", "differential", "solution", "difeq"],
    },
    {
        courseFilter: "Differential Equations",
        question: "How do linear first-order differential equations get solved?",
        expectedAny: ["linear", "first-order", "integrating factor", "differential"],
    },
    {
        courseFilter: "Elementary Algebra",
        question: "How does substitution solve a system of equations?",
        expectedAny: ["substitution", "systems", "equations", "algebra"],
    },
    {
        courseFilter: "Elementary Algebra",
        question: "How do exponent rules work when multiplying powers?",
        expectedAny: ["exponents", "powers", "multiply", "algebra"],
    },
];

export default allCourseQualityChecks;
