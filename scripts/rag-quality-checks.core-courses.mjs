const coreCourseQualityChecks = [
  {
    courseFilter: "PreCalc1",
    question: "Which lecture covers inverse functions and how should I think about them?",
    expectedAny: ["inverse functions", "precalculus1", "function"],
  },
  {
    courseFilter: "PreCalc1",
    question: "Where are rational functions and their graphs covered?",
    expectedAny: ["rational functions", "graphs", "precalculus"],
  },
  {
    courseFilter: "PreCalc1",
    question: "Which lecture explains complex numbers?",
    expectedAny: ["complex numbers", "precalculus1"],
  },
  {
    courseFilter: "PreCalc1",
    question: "Where does the course cover quadratic functions?",
    expectedAny: ["quadratic functions", "precalculus1"],
  },
  {
    courseFilter: "Calculus 1",
    question: "Which lecture explains derivative as a function?",
    expectedAny: ["derivative as a function", "calculus1", "derivative"],
  },
  {
    courseFilter: "Calculus 1",
    question: "Where is L'Hopital's Rule covered?",
    expectedAny: ["lhopitals rule", "l'hopital", "calculus1"],
  },
  {
    courseFilter: "Calculus 1",
    question: "Which lecture teaches u-substitution?",
    expectedAny: ["usub", "substitution", "calculus1"],
  },
  {
    courseFilter: "Calculus 1",
    question: "Where are related rates covered?",
    expectedAny: ["related rates", "calculus1"],
  },
  {
    courseFilter: "Calculus 2",
    question: "Which lecture covers the shell method?",
    expectedAny: ["shell method", "calculus2"],
  },
  {
    courseFilter: "Calculus 2",
    question: "Where are alternating series covered?",
    expectedAny: ["alternating series", "calculus2"],
  },
  {
    courseFilter: "Calculus 2",
    question: "Which lecture covers parametric equations?",
    expectedAny: ["parametric equations", "calculus2"],
  },
  {
    courseFilter: "Calculus 2",
    question: "Where does Calc 2 discuss power series?",
    expectedAny: ["power series", "calculus2"],
  },
  {
    courseFilter: "Calculus 3",
    question: "Which lecture covers cross products?",
    expectedAny: ["cross product", "calculus3"],
  },
  {
    courseFilter: "Calculus 3",
    question: "Where are lines and planes in space covered?",
    expectedAny: ["lines and planes", "space", "calculus3"],
  },
  {
    courseFilter: "Calculus 3",
    question: "Which lecture covers partial derivatives?",
    expectedAny: ["partial derivatives", "calculus3"],
  },
  {
    courseFilter: "Calculus 3",
    question: "Where are double integrals covered?",
    expectedAny: ["double integrals", "calculus3"],
  },
  {
    courseFilter: "Intro To Statistics",
    question: "Which lecture covers measures of center?",
    expectedAny: ["measures of center", "statistics"],
  },
  {
    courseFilter: "Intro To Statistics",
    question: "Where are boxplots and the five-number summary covered?",
    expectedAny: ["fivenumber", "boxplots", "statistics"],
  },
  {
    courseFilter: "Intro To Statistics",
    question: "Which lecture covers probability rules?",
    expectedAny: ["rules of probability", "probability", "statistics"],
  },
  {
    courseFilter: "Intro To Statistics",
    question: "Where are confidence intervals discussed?",
    expectedAny: ["confidence intervals", "statistics"],
  },
  {
    courseFilter: "Differential Equations",
    question: "Which lecture covers slope fields?",
    expectedAny: ["slope fields", "difeq", "differential"],
  },
  {
    courseFilter: "Differential Equations",
    question: "Where are linear first-order equations covered?",
    expectedAny: ["linear firstorder", "first-order", "differential"],
  },
  {
    courseFilter: "Differential Equations",
    question: "Which lecture covers Laplace transforms?",
    expectedAny: ["laplace", "transformation", "differential"],
  },
  {
    courseFilter: "Differential Equations",
    question: "Where are first-order systems of differential equations covered?",
    expectedAny: ["first order systems", "difeq", "differential"],
  },
  {
    courseFilter: "Elementary Algebra",
    question: "Which lecture covers solving systems using substitution?",
    expectedAny: ["substitution", "systems", "elementary algebra"],
  },
  {
    courseFilter: "Elementary Algebra",
    question: "Where are rules for exponents covered?",
    expectedAny: ["rules for exponents", "elementary algebra"],
  },
  {
    courseFilter: "Elementary Algebra",
    question: "Which lecture covers factoring trinomials?",
    expectedAny: ["factoring trinomials", "elementary algebra"],
  },
  {
    courseFilter: "Elementary Algebra",
    question: "Where are special products covered?",
    expectedAny: ["special products", "elementary algebra"],
  },
];

export default coreCourseQualityChecks;
