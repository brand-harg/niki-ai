import { readFileSync } from "node:fs";

const refreshSource = readFileSync("scripts/refresh-persona-snippets.mjs", "utf8");
const promptSource = readFileSync("lib/chatPrompts.ts", "utf8");
const routeSource = readFileSync("app/api/rag/query/route.ts", "utf8");

const fixtures = [
  {
    name: "persona-extractor-has-tag-pattern-map",
    pass: /const PERSONA_TAG_PATTERNS = \{/.test(refreshSource),
  },
  {
    name: "persona-extractor-tags-shortcuts",
    pass: /nemanja_shortcut/.test(refreshSource) && /shortcut|quick way|faster/.test(refreshSource),
  },
  {
    name: "persona-extractor-tags-exam-warnings",
    pass: /nemanja_exam_warning/.test(refreshSource) && /on the exam|common mistake|be careful/.test(refreshSource),
  },
  {
    name: "persona-extractor-tags-visual-descriptions",
    pass: /nemanja_visual_description/.test(refreshSource) && /graph|curve|board|horizontal|vertical/.test(refreshSource),
  },
  {
    name: "persona-extractor-tags-analogies",
    pass: /nemanja_analogy/.test(refreshSource) && /think about|imagine|like a|geometric meaning/.test(refreshSource),
  },
  {
    name: "persona-extractor-assigns-tags-per-snippet",
    pass: /function personaTagForSnippet\(/.test(refreshSource) && /persona_tag: personaTagForSnippet\(snippet\)/.test(refreshSource),
  },
  {
    name: "rag-route-returns-persona-tags",
    pass: /personaTag: s\.persona_tag/.test(routeSource),
  },
  {
    name: "lecture-prompt-treats-persona-tags-as-evidence",
    pass:
      /Persona tags such as nemanja_shortcut, nemanja_exam_warning, nemanja_visual_description, and nemanja_analogy are evidence labels/.test(
        promptSource
      ),
  },
];

let failed = false;
for (const fixture of fixtures) {
  if (fixture.pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
