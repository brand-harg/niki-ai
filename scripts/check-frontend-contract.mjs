import { readFileSync } from "node:fs";

const pageSource = readFileSync("app/page.tsx", "utf8");
const loginSource = readFileSync("app/login/page.tsx", "utf8");
const signupSource = readFileSync("app/signup/page.tsx", "utf8");
const authCallbackSource = readFileSync("app/auth/callback/page.tsx", "utf8");
const calendarSource = readFileSync("app/calendar/page.tsx", "utf8");
const chatRouteSource = readFileSync("app/api/chat/route.ts", "utf8");
const authProfileSource = readFileSync("lib/authProfile.ts", "utf8");
const authRecoverySource = readFileSync("lib/authRecovery.ts", "utf8");
const calendarSqlSource = readFileSync("scripts/sql/calendar-events.sql", "utf8");
const supabaseClientSource = readFileSync("lib/supabaseClient.ts", "utf8");
const fileUploadSource = readFileSync("components/FileUploadButton.tsx", "utf8");
const nextConfigSource = readFileSync("next.config.ts", "utf8");

const fixtures = [
  {
    name: "supabase-persists-session",
    source: supabaseClientSource,
    pattern: /persistSession:\s*true/,
  },
  {
    name: "supabase-auto-refreshes-token",
    source: supabaseClientSource,
    pattern: /autoRefreshToken:\s*true/,
  },
  {
    name: "supabase-detects-session-url",
    source: supabaseClientSource,
    pattern: /detectSessionInUrl:\s*true/,
  },
  {
    name: "supabase-uses-pkce-flow",
    source: supabaseClientSource,
    pattern: /flowType:\s*["']pkce["']/,
  },
  {
    name: "home-gets-session-before-user-data-load",
    source: pageSource,
    pattern: /supabase\.auth\.getSession\(\)[\s\S]*setSession\(session\)[\s\S]*void loadUserData\(session\.user\.id, session\)/,
  },
  {
    name: "login-links-to-dedicated-signup",
    source: loginSource,
    pattern: /href=["']\/signup["'][\s\S]*Create Account/,
  },
  {
    name: "signup-uses-existing-supabase-auth",
    source: signupSource,
    pattern: /supabase\.auth\.signUp\([\s\S]*emailRedirectTo[\s\S]*\/auth\/callback\?next=\//,
  },
  {
    name: "signup-validates-confirm-password",
    source: signupSource,
    pattern: /password !== confirmPassword[\s\S]*Passwords do not match/,
  },
  {
    name: "signup-redirects-after-success",
    source: signupSource,
    pattern: /router\.replace\(["']\/["']\)[\s\S]*router\.replace\(["']\/login["']\)/,
  },
  {
    name: "google-login-uses-explicit-auth-callback",
    source: loginSource,
    pattern: /signInWithOAuth\([\s\S]*provider:\s*['"]google['"][\s\S]*\/auth\/callback\?next=\//,
  },
  {
    name: "auth-callback-exchanges-code-and-bootstraps-profile",
    source: authCallbackSource,
    pattern: /recoverSessionFromUrl\(\)[\s\S]*ensureProfileForSession[\s\S]*router\.replace\(next\)/,
  },
  {
    name: "auth-recovery-supports-pkce-and-hash-callbacks",
    source: authRecoverySource,
    pattern: /exchangeCodeForSession\(code\)[\s\S]*setSession\([\s\S]*access_token[\s\S]*refresh_token/,
  },
  {
    name: "home-recovers-oauth-callback-before-session-check",
    source: pageSource,
    pattern: /hasAuthCallbackParams\(\)[\s\S]*recoverSessionFromUrl\(\)[\s\S]*clearAuthCallbackUrl\(["']\/["']\)/,
  },
  {
    name: "home-preserves-session-on-auth-init-failure",
    source: pageSource,
    pattern: /Auth initialization failed; preserving stored session for next retry/,
  },
  {
    name: "home-applies-session-fallback-before-background-profile-load",
    source: pageSource,
    pattern: /applySessionFallbackProfile\(session\)[\s\S]*void loadUserData\(session\.user\.id, session\)/,
  },
  {
    name: "auth-profile-creates-google-metadata-fallback",
    source: authProfileSource,
    pattern: /profileFallbackFromSession[\s\S]*user_metadata[\s\S]*avatar_url[\s\S]*ensureProfileForSession/,
  },
  {
    name: "auth-profile-does-not-let-placeholders-override-google-fallback",
    source: authProfileSource,
    pattern: /isPlaceholderName[\s\S]*isPlaceholderUsername[\s\S]*mergeProfileWithFallback/,
  },
  {
    name: "home-has-front-page-calendar-access",
    source: pageSource,
    pattern: /router\.push\(["']\/calendar["']\)[\s\S]*Calendar/,
  },
  {
    name: "knowledge-base-sidebar-supports-all-core-courses",
    source: pageSource,
    pattern: /const KNOWLEDGE_BASE_COURSES[\s\S]*Elementary Algebra[\s\S]*PreCalc 1[\s\S]*Calc 1[\s\S]*Calc 2[\s\S]*Calc 3[\s\S]*Differential Equations[\s\S]*Statistics[\s\S]*Knowledge Base/,
  },
  {
    name: "knowledge-base-sidebar-shows-source-health-and-pinned-syllabus",
    source: pageSource,
    pattern: /Source Health[\s\S]*Pinned Syllabus[\s\S]*handlePinAttachedSyllabus/,
  },
  {
    name: "chat-focus-mode-supports-all-core-courses-and-persists",
    source: pageSource,
    pattern: /CHAT_FOCUS_STORAGE_KEY[\s\S]*window\.localStorage\.setItem\(CHAT_FOCUS_STORAGE_KEY[\s\S]*Focus Mode[\s\S]*Current topic or section/,
  },
  {
    name: "chat-focus-mode-shows-topic-suggestions",
    source: pageSource,
    pattern: /const FOCUS_TOPIC_SUGGESTIONS[\s\S]*getFocusSuggestion[\s\S]*Suggested:[\s\S]*focusSuggestion/,
  },
  {
    name: "calendar-route-allows-guests-but-locks-editing",
    source: calendarSource,
    pattern: /supabase\.auth\.getSession\(\)[\s\S]*setUserId\(null\)[\s\S]*Calendar editing is locked while logged out[\s\S]*disabled=\{!canEdit\}/,
  },
  {
    name: "calendar-empty-state-has-demo-events",
    source: calendarSource,
    pattern: /EXAMPLE_EVENTS[\s\S]*Calc 2 Test[\s\S]*Statistics Quiz[\s\S]*Add a test, quiz, or deadline and Niki will help you stay on track[\s\S]*Example event/,
  },
  {
    name: "calendar-title-guides-natural-input",
    source: calendarSource,
    pattern: /Event title[\s\S]*Try: Calc 2 test Wednesday 1pm/,
  },
  {
    name: "calendar-date-time-inputs-share-dark-group-styling",
    source: calendarSource,
    pattern: /dateTimeFieldClassName[\s\S]*\[color-scheme:dark\][\s\S]*focus-within:border-cyan-500\/40[\s\S]*Select time/,
  },
  {
    name: "calendar-auto-suggests-course-from-title",
    source: calendarSource,
    pattern: /function inferCourseFromTitle[\s\S]*Calc 2[\s\S]*courseAutoSelected[\s\S]*Auto-selected/,
  },
  {
    name: "calendar-ai-awareness-copy-is-visible",
    source: calendarSource,
    pattern: /Niki uses upcoming events quietly to help you study when it matters/,
  },
  {
    name: "calendar-stores-events-in-supabase-table",
    source: calendarSource,
    pattern: /from\(["']calendar_events["']\)[\s\S]*insert\([\s\S]*event_date[\s\S]*event_time[\s\S]*course/,
  },
  {
    name: "calendar-supports-all-core-courses",
    source: calendarSource,
    pattern: /Elementary Algebra[\s\S]*PreCalc 1[\s\S]*Calc 1[\s\S]*Calc 2[\s\S]*Calc 3[\s\S]*Differential Equations[\s\S]*Statistics/,
  },
  {
    name: "calendar-schema-has-rls-and-owner-policies",
    source: calendarSqlSource,
    pattern: /create table if not exists public\.calendar_events[\s\S]*enable row level security[\s\S]*auth\.uid\(\) = user_id/,
  },
  {
    name: "home-injects-calendar-context-into-chat-request",
    source: pageSource,
    pattern: /fetchUpcomingCalendarContext[\s\S]*from\(["']calendar_events["']\)[\s\S]*calendarContext: calendarContext \|\| undefined/,
  },
  {
    name: "chat-request-includes-knowledge-base-context",
    source: pageSource,
    pattern: /knowledgeCourseContext: activeKnowledgeCourse \|\| undefined[\s\S]*pinnedSyllabusContent: pinnedSyllabus\?\.content[\s\S]*pinnedSyllabusName: pinnedSyllabus\?\.name/,
  },
  {
    name: "chat-request-includes-focus-mode-context",
    source: pageSource,
    pattern: /focusCourseContext: chatFocus\.course \|\| undefined[\s\S]*focusTopicContext: chatFocus\.topic\.trim\(\) \|\| undefined/,
  },
  {
    name: "chat-prompt-accepts-pinned-syllabus-context",
    source: chatRouteSource,
    pattern: /pinnedSyllabusContent\?: string[\s\S]*knowledgeCourseContext\?: string[\s\S]*buildUserMessageContent\([\s\S]*pinnedSyllabusContent[\s\S]*knowledgeCourseContext/,
  },
  {
    name: "chat-route-uses-calendar-context-non-intrusively",
    source: chatRouteSource,
    pattern: /calendarContext\?: string[\s\S]*buildCalendarContextSystemMessage[\s\S]*Use this only when it is relevant[\s\S]*test, exam, quiz, midterm, or final/,
  },
  {
    name: "home-keeps-session-fallback-on-user-refresh-failure",
    source: pageSource,
    pattern: /applySessionFallbackProfile\(session\)[\s\S]*void loadUserData/,
  },
  {
    name: "mobile-chat-shell-uses-dynamic-viewport",
    source: pageSource,
    pattern: /h-\[100dvh\]/,
  },
  {
    name: "mobile-composer-does-not-overlay-chat",
    source: pageSource,
    pattern: /<footer className="shrink-0[\s\S]*safe-area-inset-bottom/,
  },
  {
    name: "chat-scroll-region-has-min-height-boundary",
    source: pageSource,
    pattern: /flex-1 min-h-0 overflow-y-auto/,
  },
  {
    name: "mobile-sidebar-starts-closed",
    source: pageSource,
    pattern: /const \[isSidebarOpen, setIsSidebarOpen\] = useState\(false\)/,
  },
  {
    name: "desktop-sidebar-opens-from-media-query",
    source: pageSource,
    pattern: /matchMedia\("\(min-width: 768px\)"\)[\s\S]*setIsSidebarOpen\(query\.matches\)/,
  },
  {
    name: "screenshot-has-safe-color-normalizer",
    source: pageSource,
    pattern: /screenshotSafeColor/,
  },
  {
    name: "screenshot-neutralizes-unsupported-visual-effects",
    source: pageSource,
    pattern: /background-image[\s\S]*box-shadow[\s\S]*text-shadow[\s\S]*backdrop-filter/,
  },
  {
    name: "screenshot-target-is-stable-data-attribute",
    source: pageSource,
    pattern: /data-chat-capture/,
  },
  {
    name: "tools-menu-contains-teaching-toggle",
    source: fileUploadSource,
    pattern: /Teaching: ON[\s\S]*Teaching: OFF/,
  },
  {
    name: "nemanja-mode-shows-teaching-toggle-only",
    source: pageSource,
    pattern: /isNikiMode && \([\s\S]*Teaching: ON[\s\S]*Teaching: OFF[\s\S]*isNikiMode && \([\s\S]*Teaching: ON[\s\S]*Teaching: OFF/,
  },
  {
    name: "pure-logic-responses-offer-explain-bridge",
    source: pageSource,
    pattern: /handleExplainThis[\s\S]*handleResponseFollowup[\s\S]*Do another[\s\S]*Explain step-by-step[\s\S]*Harder problem/,
  },
  {
    name: "tools-menu-contains-screenshot-action",
    source: fileUploadSource,
    pattern: /Screenshot Chat/,
  },
  {
    name: "tools-menu-accepts-syllabus-csv-calendar-files",
    source: fileUploadSource,
    pattern: /text\/csv[\s\S]*text\/calendar[\s\S]*\.csv[\s\S]*\.ics[\s\S]*syllabus/,
  },
  {
    name: "voice-input-uses-browser-speech-recognition",
    source: pageSource,
    pattern: /getSpeechRecognitionConstructor[\s\S]*webkitSpeechRecognition[\s\S]*handleVoiceInput/,
  },
  {
    name: "voice-input-has-accessible-push-to-talk-button",
    source: pageSource,
    pattern: /aria-label=\{isListening \? "Stop voice input" : "Start voice input"\}[\s\S]*Push to talk/,
  },
  {
    name: "source-cards-parse-youtube-video-ids",
    source: pageSource,
    pattern: /function\s+getYouTubeVideoId[\s\S]*searchParams\.get\(["']v["']\)/,
  },
  {
    name: "source-cards-render-youtube-thumbnails",
    source: pageSource,
    pattern: /img\.youtube\.com\/vi\/\$\{videoId\}\/mqdefault\.jpg/,
  },
  {
    name: "source-cards-deep-link-timestamp-urls",
    source: pageSource,
    pattern: /href=\{c\.timestampUrl\}[\s\S]*target="_blank"/,
  },
  {
    name: "source-cards-preview-youtube-clips-in-modal",
    source: pageSource,
    pattern: /getYouTubeEmbedUrl[\s\S]*setActiveClip\(c\)[\s\S]*Lecture clip preview[\s\S]*<iframe/,
  },
  {
    name: "source-modal-keeps-youtube-fallback-link",
    source: pageSource,
    pattern: /Open on YouTube/,
  },
  {
    name: "source-cards-show-open-clip-affordance",
    source: pageSource,
    pattern: /Open clip/,
  },
  {
    name: "source-inspector-opens-from-source-cards",
    source: pageSource,
    pattern: /Peek evidence[\s\S]*aria-label="Source inspector"[\s\S]*Source Inspector/,
  },
  {
    name: "source-inspector-honestly-labels-evidence",
    source: pageSource,
    pattern: /function\s+getCitationEvidenceMeta[\s\S]*Exact[\s\S]*Related[\s\S]*Foundational[\s\S]*No direct transcript snippet was available/,
  },
  {
    name: "math-callouts-detect-efficiency-tips",
    source: pageSource,
    pattern: /function\s+getCalloutKind[\s\S]*Efficiency Tip[\s\S]*math-callout-efficiency/,
  },
  {
    name: "markdown-paragraphs-extract-nested-text-for-callouts",
    source: pageSource,
    pattern: /function\s+getNodeText[\s\S]*React\.isValidElement[\s\S]*const text = getNodeText\(children\)\.trim\(\)/,
  },
  {
    name: "board-setup-label-is-sticky-roadmap",
    source: pageSource,
    pattern: /isBoardSetup[\s\S]*math-board-setup-label sticky/,
  },
  {
    name: "math-callouts-render-with-dedicated-class",
    source: pageSource,
    pattern: /math-callout-label\s+\$\{calloutKind\}/,
  },
  {
    name: "next-allows-youtube-thumbnail-hosts",
    source: nextConfigSource,
    pattern: /hostname:\s*["']img\.youtube\.com["'][\s\S]*hostname:\s*["']i\.ytimg\.com["']/,
  },
];

let failed = false;
for (const fixture of fixtures) {
  const pass = fixture.pattern.test(fixture.source);
  if (pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
