export type ChatFocusDisplayState = {
  course: string;
  topic: string;
};

export type FocusCourseDisplayOption = {
  label: string;
  courseContext: string;
};

export function getFocusCourseLabel(
  courses: FocusCourseDisplayOption[],
  selectedCourse: string
) {
  return (
    courses.find((course) => course.courseContext === selectedCourse)?.label ??
    "No subject selected"
  );
}

export function buildFocusSummary(
  chatFocus: ChatFocusDisplayState,
  focusCourseLabel: string
) {
  const trimmedTopic = chatFocus.topic.trim();
  if (!chatFocus.course) {
    return trimmedTopic ? `No subject selected · ${trimmedTopic}` : "No subject selected";
  }
  return `${focusCourseLabel} · ${trimmedTopic || "No topic set"}`;
}

export function buildFocusStatusLabel(
  chatFocus: ChatFocusDisplayState,
  focusCourseLabel: string
) {
  const trimmedTopic = chatFocus.topic.trim();
  if (!chatFocus.course && !trimmedTopic) return "No course selected";
  if (!chatFocus.course) return `Focus: ${trimmedTopic}`;
  if (!trimmedTopic) return `Focus: ${focusCourseLabel}`;
  return `Focus: ${focusCourseLabel} • ${trimmedTopic}`;
}

export function buildSessionStudyLabel(
  chatFocus: ChatFocusDisplayState,
  focusCourseLabel: string
) {
  const trimmedTopic = chatFocus.topic.trim();
  if (!chatFocus.course) return "";
  if (!trimmedTopic) return `Studying: ${focusCourseLabel}`;
  return `Studying: ${focusCourseLabel} • ${trimmedTopic}`;
}

export function buildMobileControlsSummary({
  chatFocus,
  focusCourseLabel,
  isNikiMode,
  lectureMode,
}: {
  chatFocus: ChatFocusDisplayState;
  focusCourseLabel: string;
  isNikiMode: boolean;
  lectureMode: boolean;
}) {
  const trimmedTopic = chatFocus.topic.trim();
  const focusPart = !chatFocus.course
    ? trimmedTopic
      ? `No course • ${trimmedTopic}`
      : "No course"
    : trimmedTopic
      ? `${focusCourseLabel} • ${trimmedTopic}`
      : focusCourseLabel;

  return [
    isNikiMode ? "Nemanja" : "Pure Logic",
    isNikiMode ? (lectureMode ? "Teaching ON" : "Teaching OFF") : null,
    focusPart,
  ]
    .filter(Boolean)
    .join(" • ");
}

export function getFocusModeHeaderClass(focusModeExpanded: boolean | null) {
  return focusModeExpanded === true
    ? "rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
    : "rounded-full border border-white/8 bg-white/[0.02] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:rounded-2xl sm:px-3 sm:py-3";
}
