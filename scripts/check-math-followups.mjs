const CHAT_URL = process.env.NIKI_CHAT_URL ?? "http://localhost:3000/api/chat";

const scenarios = [
  {
    id: "derivative-followup-inherits-intent",
    body: {
      message: "do ln5x",
      history: [
        { role: "user", content: "Find the derivative of x^2" },
        {
          role: "assistant",
          content: "**Derivative**\n\n## Final Answer\n$$\n2x\n$$",
        },
      ],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/Derivative of .*ln\(5x\)/i, /f'\(x\)\s*=\s*\\frac\{1\}\{x\}/],
    reject: [/What do you want me to do/i, /Qwen/i],
  },
  {
    id: "integral-followup-inherits-intent",
    body: {
      message: "do ln5x",
      history: [
        { role: "user", content: "Integrate x^2" },
        {
          role: "assistant",
          content: "**Integral**\n\n## Final Answer\n$$\n\\frac{x^3}{3}+C\n$$",
        },
      ],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/Integral of .*ln\(5x\)/i, /x\\ln\(5x\)-x \+ C/],
    reject: [/What do you want me to do/i, /Qwen/i],
  },
  {
    id: "limit-followup-inherits-intent-but-asks-approach",
    body: {
      message: "do ln5x",
      history: [
        { role: "user", content: "Find the limit of x^2 as x approaches 3" },
        {
          role: "assistant",
          content: "**Limit**\n\n## Final Answer\n$$\n9\n$$",
        },
      ],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/evaluate a limit for ln5x/i, /approach value/i, /x approaches 0/i],
    reject: [/What do you want me to do/i, /Qwen/i],
  },
  {
    id: "ambiguous-followup-asks-operation",
    body: {
      message: "do ln5x",
      history: [],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/What do you want me to do with ln5x/i, /differentiate it, integrate it/i],
    reject: [/Derivative of/i, /Integral of/i, /Qwen/i],
  },
  {
    id: "math-correction-switches-operation-cleanly",
    body: {
      message: "I meant integration",
      history: [
        { role: "user", content: "derivative x^2" },
        {
          role: "assistant",
          content: "**Derivative**\n\n## Final Answer\n$$\n2x\n$$",
        },
      ],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/switching to integral/i, /Integral of x\^2/i, /x\^\{3\}.*\+ C/i],
    reject: [/\*\*Derivative\*\*/i, /## Final Answer[\s\S]{0,50}2x/i, /Qwen/i],
  },
  {
    id: "course-correction-switches-study-context-cleanly",
    body: {
      message: "no do calc 2",
      history: [
        { role: "user", content: "help me study for calc 1" },
        {
          role: "assistant",
          content:
            "What is your Calculus 1 study block on? Send the chapter, section, or topic and I will turn it into a focused study plan.",
        },
      ],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/switching to Calculus 2/i, /What is your Calculus 2 study block on/i],
    reject: [/Calculus 1 study block/i, /partial fraction decomposition/i, /Qwen/i],
  },
  {
    id: "focus-mode-guides-vague-study-followup",
    body: {
      message: "quiz tomorrow",
      history: [],
      isNikiMode: true,
      lectureMode: false,
      focusCourseContext: "Calculus 2",
      focusTopicContext: "integration by parts",
    },
    expect: [/current focus on integration by parts/i, /Calculus 2/i],
    reject: [/What course or topic is it on/i, /Qwen/i],
  },
  {
    id: "explicit-course-section-overrides-focus-mode",
    body: {
      message: "calc 1 2.2",
      history: [],
      isNikiMode: true,
      lectureMode: false,
      focusCourseContext: "Calculus 2",
      focusTopicContext: "integration by parts",
    },
    expect: [/Calculus 1 section 2\.2/i],
    reject: [/Calculus 2/i, /integration by parts/i, /Qwen/i],
  },
  {
    id: "focus-mode-scopes-broad-teaching-request",
    body: {
      message: "teach me",
      history: [],
      isNikiMode: true,
      lectureMode: false,
      focusCourseContext: "Calculus 1",
      focusTopicContext: "derivatives",
    },
    expect: [/derivatives/i, /Calculus 1/i],
    reject: [/What do you mean/i, /Qwen/i],
  },
  {
    id: "focus-mode-gently-steers-unrelated-request",
    body: {
      message: "teach me integrals",
      history: [],
      isNikiMode: true,
      lectureMode: false,
      focusCourseContext: "Calculus 1",
      focusTopicContext: "derivatives",
    },
    expect: [/integrals/i, /derivatives/i, /(switch focus|current focus|active focus|focus is)/i],
    reject: [/I can't help/i, /Qwen/i],
  },
  {
    id: "teach-me-method-explains-before-asking-for-input",
    body: {
      message: "teach me integration by parts",
      history: [],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/integration by parts/i, /\\int u \\, dv = uv - \\int v \\, du/i, /(example|for example|let'?s use)/i],
    reject: [/Send me the integrand/i, /Qwen/i],
  },
  {
    id: "incomplete-product-rule-asks-for-full-product",
    body: {
      message: "product rule with sin(x)",
      history: [],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/full product/i, /standard example like x sin\(x\)/i],
    reject: [/Derivative of .*sin\(x\)/i, /f'\(x\)\s*=\s*\\cos\(x\)/i, /Qwen/i],
  },
  {
    id: "teaching-derivative-shows-formula-application-step",
    body: {
      message: "derivative of 5x",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Step 3: Apply the formula to this problem/i, /\\frac\{d\}\{dx\}\\left\(5x\\right\)=5\\cdot\\frac\{d\}\{dx\}\(x\)=5\\cdot 1/i],
    reject: [/Qwen/i],
  },
  {
    id: "teaching-chain-rule-shows-inner-and-outer-clearly",
    body: {
      message: "derivative of sin(x^2)",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [/Step 3: Apply the formula to this problem/i, /Inner function:/i, /Outer function:/i, /\\cos\\left\(x\^\{2\}\\right\)\\cdot2x/i],
    reject: [/Qwen/i],
  },
  {
    id: "teaching-product-rule-shows-u-v-and-clean-factored-form",
    body: {
      message: "derivative of sin(x)e^(2x)",
      history: [],
      isNikiMode: true,
      lectureMode: true,
    },
    expect: [
      /Step 3: Apply the formula to this problem/i,
      /u&=\\sin/i,
      /v&=e\^\{2x\}/i,
      /u'&=\\cos/i,
      /v'&=2e\^\{2x\}/i,
      /e\^\{2x\}\(2\\sin\(x\)\+\\cos\(x\)\)/i,
    ],
    reject: [/Qwen/i],
  },
  {
    id: "derivative-of-exp-does-not-keep-ln-e-artifact",
    body: {
      message: "derivative of e^x",
      history: [],
      isNikiMode: true,
      lectureMode: false,
    },
    expect: [/f'\(x\)\s*=\s*e\^\{x\}/i],
    reject: [/ln\(e\)/i, /Qwen/i],
  },
];

async function postText(body) {
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${CHAT_URL} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

function checkScenario(scenario, output) {
  const failures = [];
  for (const pattern of scenario.expect) {
    if (!pattern.test(output)) failures.push(`missing ${pattern}`);
  }
  for (const pattern of scenario.reject) {
    if (pattern.test(output)) failures.push(`rejected pattern present ${pattern}`);
  }
  return failures;
}

let failed = false;
for (const scenario of scenarios) {
  try {
    const output = await postText(scenario.body);
    const failures = checkScenario(scenario, output);
    if (failures.length) {
      failed = true;
      console.error(`❌ ${scenario.id}`);
      console.error(`   ${failures.join("; ")}`);
      console.error(output.slice(0, 1200));
    } else {
      console.log(`✅ ${scenario.id}`);
    }
  } catch (error) {
    failed = true;
    console.error(`❌ ${scenario.id}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed) process.exit(1);
