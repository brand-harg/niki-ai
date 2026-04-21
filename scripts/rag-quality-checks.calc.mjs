const calcQualityChecks = [
    {
        question: "How do I know when integration by parts is a better choice than u-substitution?",
        expectedAny: ["integration by parts", "u-substitution", "integral", "choice"],
    },
    {
        question: "What does the second derivative tell me about concavity and inflection points?",
        expectedAny: ["second derivative", "concavity", "inflection", "critical"],
    },
    {
        question: "How do I set up a related rates problem correctly?",
        expectedAny: ["related rates", "differentiate", "with respect to time", "implicit"],
    },
    {
        question: "What is the ratio test and when does it fail to decide convergence?",
        expectedAny: ["ratio test", "convergence", "series", "inconclusive"],
    },
    {
        question: "Can you explain what a Taylor polynomial is approximating?",
        expectedAny: ["taylor", "polynomial", "approximation", "derivative"],
    },
];

export default calcQualityChecks;
