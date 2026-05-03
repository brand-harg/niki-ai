import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const source = readFileSync("lib/chatFocus.ts", "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});

const cjsModule = { exports: {} };
vm.runInNewContext(outputText, {
  module: cjsModule,
  exports: cjsModule.exports,
  require,
});

const {
  buildFocusStatusLabel,
  buildFocusSummary,
  buildMobileControlsSummary,
  buildSessionStudyLabel,
  getFocusCourseLabel,
  getFocusModeHeaderClass,
} = cjsModule.exports;

const courses = [
  { label: "Calc 1", courseContext: "Calculus 1" },
  { label: "Statistics", courseContext: "Statistics" },
];

const emptyFocus = { course: "", topic: "" };
const courseOnlyFocus = { course: "Calculus 1", topic: "" };
const topicFocus = { course: "Calculus 1", topic: "  derivatives  " };

assert.equal(getFocusCourseLabel(courses, "Calculus 1"), "Calc 1");
assert.equal(getFocusCourseLabel(courses, "Unknown"), "No subject selected");

assert.equal(buildFocusStatusLabel(emptyFocus, "No subject selected"), "No course selected");
assert.equal(buildFocusStatusLabel(courseOnlyFocus, "Calc 1"), "Focus: Calc 1");
assert.equal(buildFocusStatusLabel(topicFocus, "Calc 1"), "Focus: Calc 1 • derivatives");

assert.equal(buildSessionStudyLabel(emptyFocus, "No subject selected"), "");
assert.equal(buildSessionStudyLabel(courseOnlyFocus, "Calc 1"), "Studying: Calc 1");
assert.equal(buildSessionStudyLabel(topicFocus, "Calc 1"), "Studying: Calc 1 • derivatives");

assert.equal(buildFocusSummary(emptyFocus, "No subject selected"), "No subject selected");
assert.equal(buildFocusSummary(courseOnlyFocus, "Calc 1"), "Calc 1 · No topic set");
assert.equal(buildFocusSummary(topicFocus, "Calc 1"), "Calc 1 · derivatives");

assert.equal(
  buildMobileControlsSummary({
    chatFocus: emptyFocus,
    focusCourseLabel: "No subject selected",
    isNikiMode: false,
    lectureMode: false,
  }),
  "Pure Logic • No course"
);
assert.equal(
  buildMobileControlsSummary({
    chatFocus: topicFocus,
    focusCourseLabel: "Calc 1",
    isNikiMode: true,
    lectureMode: true,
  }),
  "Nemanja • Teaching ON • Calc 1 • derivatives"
);

assert.match(getFocusModeHeaderClass(true), /rounded-2xl/);
assert.match(getFocusModeHeaderClass(false), /rounded-full/);

console.log("✅ chat-focus-display");
