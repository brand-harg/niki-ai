function validateMathResponse(text) {
  const hasStep = /Step\s*1:/i.test(text);
  const hasFinalAnswer = /Final Answer:/i.test(text);
  const hasMath = /\$[^$]+\$|\$\$[\s\S]+?\$\$/.test(text);
  return { hasStep, hasFinalAnswer, hasMath };
}

const fixtures = [
  {
    name: "valid-step-format",
    text: `Step 1: Choose substitution
- Let $u = x^2$
Step 2: Differentiate
$$du = 2x\\,dx$$
Final Answer:
$$\\int 2x\\,dx = x^2 + C$$`,
    expect: { hasStep: true, hasFinalAnswer: true, hasMath: true },
  },
  {
    name: "invalid-missing-final-answer",
    text: `Step 1: Differentiate
$$f'(x)=2x$$`,
    expect: { hasStep: true, hasFinalAnswer: false, hasMath: true },
  },
];

let failed = false;

for (const fixture of fixtures) {
  const actual = validateMathResponse(fixture.text);
  const pass =
    actual.hasStep === fixture.expect.hasStep &&
    actual.hasFinalAnswer === fixture.expect.hasFinalAnswer &&
    actual.hasMath === fixture.expect.hasMath;

  if (!pass) {
    failed = true;
    console.error(`❌ ${fixture.name}`, { expected: fixture.expect, actual });
  } else {
    console.log(`✅ ${fixture.name}`);
  }
}

if (failed) process.exit(1);