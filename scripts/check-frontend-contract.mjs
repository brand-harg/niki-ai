import { readFileSync } from "node:fs";

const pageSource = readFileSync("app/page.tsx", "utf8");
const loginSource = readFileSync("app/login/page.tsx", "utf8");
const updatePasswordSource = readFileSync("app/update-password/page.tsx", "utf8");
const signupSource = readFileSync("app/signup/page.tsx", "utf8");
const authCallbackSource = readFileSync("app/auth/callback/page.tsx", "utf8");
const authConfirmedSource = readFileSync("app/auth/confirmed/page.tsx", "utf8");
const calendarSource = readFileSync("app/calendar/page.tsx", "utf8");
const personalizationSource = readFileSync("app/personalization/page.tsx", "utf8");
const profileSource = readFileSync("app/profile/page.tsx", "utf8");
const settingsSource = readFileSync("app/settings/page.tsx", "utf8");
const generalPageSource = readFileSync("app/settings/general/page.tsx", "utf8");
const chatRouteSource = readFileSync("app/api/chat/route.ts", "utf8");
const publicArtifactsRouteSource = readFileSync("app/api/artifacts/public/route.ts", "utf8");
const relatedLecturesRouteSource = readFileSync("app/api/lectures/related/route.ts", "utf8");
const knowledgeBaseStatusRouteSource = readFileSync("app/api/knowledge-base/status/route.ts", "utf8");
const chatModeControlsSource = readFileSync("components/ChatModeControls.tsx", "utf8");
const knowledgeBasePanelSource = readFileSync("components/KnowledgeBasePanel.tsx", "utf8");
const artifactWorkspacePanelSource = readFileSync("components/ArtifactWorkspacePanel.tsx", "utf8");
const nemanjaRoadmapSource = readFileSync("components/NemanjaRoadmap.tsx", "utf8");
const artifactWorkspaceHookSource = readFileSync("hooks/useArtifactWorkspace.ts", "utf8");
const knowledgeBaseHookSource = readFileSync("hooks/useKnowledgeBasePanel.ts", "utf8");
const artifactWorkspaceLibSource = readFileSync("lib/artifactWorkspace.ts", "utf8");
const avatarUrlSource = readFileSync("lib/avatarUrl.ts", "utf8");
const authProfileSource = readFileSync("lib/authProfile.ts", "utf8");
const authRecoverySource = readFileSync("lib/authRecovery.ts", "utf8");
const calendarSqlSource = readFileSync("scripts/sql/calendar-events.sql", "utf8");
const studyArtifactsSqlSource = readFileSync("scripts/sql/study-artifacts.sql", "utf8");
const trainingSqlSource = readFileSync("scripts/sql/training-interactions.sql", "utf8");
const usageSqlSource = readFileSync("scripts/sql/usage-interactions.sql", "utf8");
const ragFoundationSqlSource = readFileSync("scripts/sql/rag-foundation.sql", "utf8");
const personalizationLibSource = readFileSync("lib/personalization.ts", "utf8");
const generalSettingsLibSource = readFileSync("lib/generalSettings.ts", "utf8");
const supabaseClientSource = readFileSync("lib/supabaseClient.ts", "utf8");
const fileUploadSource = readFileSync("components/FileUploadButton.tsx", "utf8");
const nextConfigSource = readFileSync("next.config.ts", "utf8");
const ragHelpersSource = readFileSync("lib/ragHelpers.ts", "utf8");
const artifactWorkspaceSource = [
  pageSource,
  artifactWorkspacePanelSource,
  artifactWorkspaceHookSource,
  artifactWorkspaceLibSource,
].join("\n");
const chatControlsSource = [pageSource, chatModeControlsSource].join("\n");
const knowledgeBaseSource = [
  pageSource,
  knowledgeBasePanelSource,
  knowledgeBaseHookSource,
  knowledgeBaseStatusRouteSource,
].join("\n");

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
    name: "forgot-password-redirects-to-update-password",
    source: loginSource,
    pattern: /resetPasswordForEmail\([\s\S]*redirectTo:\s*`\$\{window\.location\.origin\}\/update-password`/,
  },
  {
    name: "signup-uses-existing-supabase-auth",
    source: signupSource,
    pattern: /supabase\.auth\.signUp\([\s\S]*emailRedirectTo[\s\S]*\/auth\/callback\?next=\/auth\/confirmed[\s\S]*Check your email to confirm your account\./,
  },
  {
    name: "signup-validates-confirm-password",
    source: signupSource,
    pattern: /password !== confirmPassword[\s\S]*Passwords do not match/,
  },
  {
    name: "signup-redirects-after-success",
    source: signupSource,
    pattern: /data\.session\?\.user\?\.id[\s\S]*router\.replace\(["']\/["']\)[\s\S]*setNotice\(["']Check your email to confirm your account\./,
  },
  {
    name: "google-login-uses-explicit-auth-callback",
    source: loginSource,
    pattern: /signInWithOAuth\([\s\S]*provider:\s*['"]google['"][\s\S]*\/auth\/callback\?next=\//,
  },
  {
    name: "google-login-surfaces-oauth-startup-errors",
    source: loginSource,
    pattern: /signInWithOAuth\([\s\S]*oauthError[\s\S]*setError\([\s\S]*Google sign in could not start\./,
  },
  {
    name: "auth-callback-exchanges-code-and-bootstraps-profile",
    source: authCallbackSource,
    pattern: /recoverSessionFromUrl\(\)[\s\S]*ensureProfileForSession[\s\S]*router\.replace\(next\)/,
  },
  {
    name: "auth-confirmed-page-shows-success-and-login-path",
    source: `${authConfirmedSource}\n${loginSource}`,
    pattern: /Email confirmed successfully\.[\s\S]*You can now log in\.[\s\S]*\/login\?confirmed=success[\s\S]*Email confirmed successfully\. You can now log in\./,
  },
  {
    name: "auth-recovery-supports-pkce-and-hash-callbacks",
    source: authRecoverySource,
    pattern: /exchangeCodeForSession\(code\)[\s\S]*setSession\([\s\S]*access_token[\s\S]*refresh_token/,
  },
  {
    name: "update-password-page-recovers-session-and-updates-password",
    source: updatePasswordSource,
    pattern: /hasAuthCallbackParams\(\)[\s\S]*recoverSessionFromUrl\(\)[\s\S]*updateUser\(\{\s*password\s*\}\)[\s\S]*expired or invalid/i,
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
    name: "personalization-supports-local-storage-fallback",
    source: `${personalizationLibSource}\n${personalizationSource}`,
    pattern: /PERSONALIZATION_STORAGE_KEY[\s\S]*readLocalPersonalizationSettings[\s\S]*writeLocalPersonalizationSettings[\s\S]*Saved On This Device/,
  },
  {
    name: "personalization-reacts-to-auth-state-changes",
    source: personalizationSource,
    pattern: /(?=[\s\S]*hydratePersonalizationState)(?=[\s\S]*onAuthStateChange)(?=[\s\S]*hydratePersonalizationState\(nextSession\))(?=[\s\S]*setIsGuestMode\(true\))(?=[\s\S]*setIsGuestMode\(false\))/,
  },
  {
    name: "personalization-shows-inline-sync-feedback",
    source: personalizationSource,
    pattern: /syncBadgeText[\s\S]*Unsynced changes[\s\S]*Saved on device[\s\S]*Cloud synced/,
  },
  {
    name: "chat-request-includes-personalization-context",
    source: `${pageSource}\n${chatRouteSource}`,
    pattern: /aboutUserContext:\s*effectivePersonalization\.about_user[\s\S]*responseStyleContext:\s*effectivePersonalization\.response_style[\s\S]*User context:[\s\S]*Response style:/,
  },
  {
    name: "new-chats-respect-default-nemanja-mode",
    source: pageSource,
    pattern: /(?=[\s\S]*applyPreferredModeToFreshChat)(?=[\s\S]*const preferredMode = effectivePersonalization\.default_niki_mode)(?=[\s\S]*setMessages\(createGreeting\(preferredMode\)\))(?=[\s\S]*setIsNikiMode\(preferredMode\))(?=[\s\S]*startNewSession[\s\S]*applyPreferredModeToFreshChat\(\{ resetTeaching: true \}\))/,
  },
  {
    name: "general-settings-autosave-with-local-fallback",
    source: `${generalPageSource}\n${generalSettingsLibSource}`,
    pattern: /readLocalGeneralSettings[\s\S]*writeLocalGeneralSettings[\s\S]*writeLocalPersonalizationSettings[\s\S]*Saved On This Device[\s\S]*Saved/,
  },
  {
    name: "general-settings-show-inline-sync-badges",
    source: generalPageSource,
    pattern: /syncBadgeText[\s\S]*Saved locally[\s\S]*Cloud synced[\s\S]*Auto-save active/,
  },
  {
    name: "general-settings-default-chat-mode-is-real",
    source: `${generalPageSource}\n${pageSource}`,
    pattern: /Default Chat Mode[\s\S]*Pure Logic[\s\S]*Nemanja Mode[\s\S]*default_niki_mode[\s\S]*effectivePersonalization\.default_niki_mode/,
  },
  {
    name: "chat-input-respects-ctrl-cmd-enter-setting",
    source: `${generalPageSource}\n${pageSource}`,
    pattern: /Ctrl \/ Cmd \+ Enter to Send[\s\S]*effectiveCmdEnterToSend[\s\S]*e\.metaKey \|\| e\.ctrlKey/,
  },
  {
    name: "home-has-front-page-calendar-access",
    source: pageSource,
    pattern: /router\.push\(["']\/calendar["']\)[\s\S]*Calendar/,
  },
  {
    name: "home-shows-first-time-onboarding-prompts",
    source: pageSource,
    pattern: /(?=[\s\S]*ONBOARDING_PROMPTS)(?=[\s\S]*Create notes on derivatives ->)(?=[\s\S]*Explain limits step-by-step ->)(?=[\s\S]*Give me practice problems ->)(?=[\s\S]*Help me study for Calc 1 ->)(?=[\s\S]*Quick Start)(?=[\s\S]*shouldShowOnboarding)(?=[\s\S]*!artifactPanel)(?=[\s\S]*substantiveMessageCount === 0)(?=[\s\S]*handleOnboardingPrompt)/,
  },
  {
    name: "knowledge-base-sidebar-supports-all-core-courses",
    source: pageSource,
    pattern: /const KNOWLEDGE_BASE_COURSES[\s\S]*Elementary Algebra[\s\S]*PreCalc 1[\s\S]*Calc 1[\s\S]*Calc 2[\s\S]*Calc 3[\s\S]*Differential Equations[\s\S]*Statistics[\s\S]*Knowledge Base/,
  },
  {
    name: "nemanja-roadmap-renders-clickable-course-tree-with-details",
    source: nemanjaRoadmapSource,
    pattern: /(?=[\s\S]*Nemanja Roadmap)(?=[\s\S]*Foundations)(?=[\s\S]*Core Calculus)(?=[\s\S]*Advanced \/ Applied)(?=[\s\S]*Elementary Algebra)(?=[\s\S]*PreCalc 1)(?=[\s\S]*Calc 1)(?=[\s\S]*Calc 2)(?=[\s\S]*Calc 3)(?=[\s\S]*Differential Equations)(?=[\s\S]*Statistics)(?=[\s\S]*setSelectedCourseId\(course\.id\))(?=[\s\S]*Course Detail)(?=[\s\S]*Topic Focus)(?=[\s\S]*Lesson Intent)(?=[\s\S]*Shortcut)(?=[\s\S]*(Lecture Source Context|Related Lectures))(?=[\s\S]*Verified by NikiAI)(?=[\s\S]*Verification Status)/,
  },
  {
    name: "knowledge-base-sidebar-shows-source-health-and-pinned-syllabus",
    source: knowledgeBaseSource,
    pattern: /Source Health[\s\S]*Pinned Syllabus[\s\S]*handlePinAttachedSyllabus/,
  },
  {
    name: "knowledge-base-panel-is-an-interactive-control-surface",
    source: knowledgeBaseSource,
    pattern: /Start New Session[\s\S]*Active Lecture Set[\s\S]*Set Active[\s\S]*Clear[\s\S]*Upload \/ Attach File[\s\S]*Recent Context/,
  },
  {
    name: "knowledge-base-can-open-roadmap-panel",
    source: `${pageSource}\n${knowledgeBasePanelSource}\n${nemanjaRoadmapSource}`,
    pattern: /(?=[\s\S]*Open Roadmap)(?=[\s\S]*onOpenRoadmap)(?=[\s\S]*isRoadmapOpen)(?=[\s\S]*Nemanja Roadmap)(?=[\s\S]*Close roadmap)/,
  },
  {
    name: "knowledge-base-course-chips-drive-focus-mode",
    source: knowledgeBaseSource,
    pattern: /(?=[\s\S]*handleSelectKnowledgeCourse)(?=[\s\S]*chatFocus\.course === courseContext \? "" : courseContext)(?=[\s\S]*topic:\s*"")(?=[\s\S]*course\.courseContext === activeKnowledgeCourse)(?=[\s\S]*course\.courseContext === chatFocusCourse)/,
  },
  {
    name: "knowledge-base-auth-gates-syllabus-and-library-actions",
    source: knowledgeBaseSource,
    pattern: /(?=[\s\S]*showLoginGatePrompt)(?=[\s\S]*Log in to save your study progress)(?=[\s\S]*router\.push\(["']\/login["']\))(?=[\s\S]*Save later when you log in)/,
  },
  {
    name: "knowledge-base-pinned-syllabus-is-session-scoped",
    source: knowledgeBaseHookSource,
    pattern: /(?=[\s\S]*getPinnedSyllabusStorageKey)(?=[\s\S]*setPinnedSyllabus\(null\))(?=[\s\S]*setIsSyllabusPreviewOpen\(false\))(?=[\s\S]*removeItem\(PINNED_SYLLABUS_STORAGE_KEY\))(?=[\s\S]*readStoredPinnedSyllabus\(nextStorageKey\))/,
  },
  {
    name: "settings-menu-reacts-to-auth-state-changes",
    source: settingsSource,
    pattern: /(?=[\s\S]*applySignedOutState)(?=[\s\S]*onAuthStateChange)(?=[\s\S]*syncAuthState\(nextSession\))(?=[\s\S]*setProfile\(nextProfile\))/,
  },
  {
    name: "profile-page-reacts-to-auth-state-changes",
    source: profileSource,
    pattern: /applyLoggedOutState[\s\S]*router\.replace\(["']\/login["']\)[\s\S]*onAuthStateChange[\s\S]*fetchVaultData\(nextSession\)/,
  },
  {
    name: "knowledge-base-panel-loads-real-health-metrics",
    source: knowledgeBaseSource,
    pattern: /fetchKnowledgeBaseStatus[\s\S]*indexedLectureCount[\s\S]*courseCounts[\s\S]*status/,
  },
  {
    name: "knowledge-base-lecture-counts-stay-auth-independent",
    source: `${knowledgeBaseStatusRouteSource}\n${ragHelpersSource}\n${ragFoundationSqlSource}`,
    pattern: /getLectureCourseCounts[\s\S]*from\("lecture_sources"\)[\s\S]*public\.lecture_sources[\s\S]*enable row level security[\s\S]*lecture sources are publicly readable[\s\S]*using \(true\)/i,
  },
  {
    name: "knowledge-base-source-health-expands-with-course-breakdown",
    source: knowledgeBaseSource,
    pattern: /sourceHealthExpanded[\s\S]*Using lecture sources for this answer[\s\S]*By course[\s\S]*applyKnowledgeCourse/,
  },
  {
    name: "chat-focus-mode-supports-all-core-courses-and-persists",
    source: chatControlsSource,
    pattern: /CHAT_FOCUS_STORAGE_KEY[\s\S]*window\.localStorage\.setItem\(CHAT_FOCUS_STORAGE_KEY[\s\S]*Focus Mode[\s\S]*Current topic or section/,
  },
  {
    name: "chat-focus-mode-shows-topic-suggestions",
    source: chatControlsSource,
    pattern: /const FOCUS_TOPIC_SUGGESTIONS[\s\S]*getFocusSuggestion[\s\S]*Suggested:[\s\S]*focusSuggestion/,
  },
  {
    name: "chat-focus-mode-is-collapsible-and-mobile-friendly",
    source: chatControlsSource,
    pattern: /(?=[\s\S]*MOBILE_CHAT_CONTROLS_EXPANDED_KEY)(?=[\s\S]*mobileControlsExpanded)(?=[\s\S]*toggleMobileControls)(?=[\s\S]*focusModeExpanded)(?=[\s\S]*toggleFocusMode)(?=[\s\S]*Focus Mode)(?=[\s\S]*focusSummary)(?=[\s\S]*Control how chat interprets your question)(?=[\s\S]*hidden sm:block)/,
  },
  {
    name: "mobile-chat-controls-collapse-into-summary-bar",
    source: chatControlsSource,
    pattern: /mobileControlsSummary[\s\S]*No course[\s\S]*toggleMobileControls[\s\S]*rounded-\[0\.95rem\][\s\S]*Pure Logic[\s\S]*Nemanja Mode[\s\S]*Teaching: ON[\s\S]*Teaching: OFF/,
  },
  {
    name: "chat-focus-mode-syncs-with-knowledge-base-and-allows-no-subject",
    source: knowledgeBaseSource,
    pattern: /(?=[\s\S]*No subject selected)(?=[\s\S]*setActiveKnowledgeCourse\(normalizedFocusCourse\))(?=[\s\S]*setRecentKnowledgeContexts\(\[nextContext\]\))(?=[\s\S]*setRecentKnowledgeContexts\(\[\]\))/,
  },
  {
    name: "chat-ui-shows-live-focus-context-label",
    source: pageSource,
    pattern: /(?=[\s\S]*data-chat-capture)(?=[\s\S]*focusStatusLabel)(?=[\s\S]*No course selected)(?=[\s\S]*aria-live=["']polite["'])(?=[\s\S]*messages\.map\()/,
  },
  {
    name: "chat-ui-shows-study-session-identity",
    source: pageSource,
    pattern: /sessionStudyLabel[\s\S]*Studying:\s*\$\{focusCourseLabel\}[\s\S]*Studying:\s*\$\{focusCourseLabel\} • \$\{trimmedTopic\}/,
  },
  {
    name: "chat-shows-lightweight-study-progress-feedback",
    source: artifactWorkspaceSource,
    pattern: /studyProgressNotice[\s\S]*You're working through \${focusCourseLabel} topics\.[\s\S]*You're building reusable study material\./,
  },
  {
    name: "chat-supports-lightweight-practice-mode-label-and-followups",
    source: pageSource,
    pattern: /(?=[\s\S]*isPracticeRequestText)(?=[\s\S]*practiceModeActive)(?=[\s\S]*Practice Mode)(?=[\s\S]*Check my answers)(?=[\s\S]*Give me more problems)/,
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
    name: "training-log-schema-is-separate-and-consent-gated",
    source: trainingSqlSource,
    pattern: /create table if not exists public\.training_interactions[\s\S]*prompt text[\s\S]*response text[\s\S]*user_prompt text not null[\s\S]*assistant_response text not null[\s\S]*Separate consent-gated quality\/training log[\s\S]*enable row level security/,
  },
  {
    name: "usage-log-schema-is-separate-and-metadata-only",
    source: usageSqlSource,
    pattern: /create table if not exists public\.usage_interactions[\s\S]*mode text not null[\s\S]*teaching_mode boolean not null[\s\S]*course text[\s\S]*requested_course text[\s\S]*active_course text[\s\S]*focus_course text[\s\S]*focus_topic text[\s\S]*Separate metadata-only usage log[\s\S]*enable row level security/,
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
    name: "lecture-mode-prefetches-rag-citations-for-source-cards",
    source: pageSource,
    pattern: /const teachingMode = options\?\.teachingMode \?\? lectureMode;[\s\S]*!isExplicitKnowledgeBaseRequest\(question\) && !teachingMode[\s\S]*\/api\/rag\/query/,
  },
  {
    name: "ungrounded-lecture-answers-offer-related-lectures",
    source: `${pageSource}\n${relatedLecturesRouteSource}`,
    pattern: /(?=[\s\S]*Related Lectures you may find helpful)(?=[\s\S]*These lectures cover similar topics\.)(?=[\s\S]*lectures\.slice\(0, 3\))(?=[\s\S]*formatRelatedLectureTitle)(?=[\s\S]*\/api\/lectures\/related)(?=[\s\S]*teachingMode && \(!rag\?\.citations \|\| rag\.citations\.length === 0\))(?=[\s\S]*lecture_sources)/,
  },
  {
    name: "lecture-mode-uses-nuanced-source-support-messaging",
    source: `${pageSource}\n${chatRouteSource}`,
    pattern: /(?=[\s\S]*This answer is based on lecture material)(?=[\s\S]*Partially supported by lecture material)(?=[\s\S]*No direct lecture source found for this topic)(?=[\s\S]*Answered using general math knowledge\.)/,
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
    name: "chat-route-only-inserts-training-log-when-consented",
    source: chatRouteSource,
    pattern: /const trainConsent = body\.trainConsent === true;[\s\S]*sanitizeTrainingLogText[\s\S]*if \(!trainConsent\) return;[\s\S]*from\("training_interactions"\)\.insert[\s\S]*prompt:\s*sanitizedPrompt[\s\S]*response:\s*sanitizedResponse/,
  },
  {
    name: "chat-request-includes-usage-log-consent",
    source: pageSource,
    pattern: /usageLogsConsent: profile\?\.share_usage_data/,
  },
  {
    name: "chat-route-derives-effective-usage-log-consent",
    source: chatRouteSource,
    pattern: /const usageLogsConsent = body\.usageLogsConsent[\s\S]*const effectiveUsageLogsConsent =[\s\S]*usageLogsConsent === true[\s\S]*profile\?\.share_usage_data === true/,
  },
  {
    name: "chat-route-only-inserts-usage-log-metadata",
    source: chatRouteSource,
    pattern: /const maybeLogUsageInteraction = async \(\) => \{[\s\S]*if \(!effectiveUsageLogsConsent\) return;[\s\S]*from\("usage_interactions"\)\.insert[\s\S]*mode:[\s\S]*teaching_mode:[\s\S]*requested_course:[\s\S]*active_course:[\s\S]*focus_course:[\s\S]*focus_topic:[\s\S]*course:/,
  },
  {
    name: "home-shows-soft-training-opt-in-with-snooze",
    source: pageSource,
    pattern: /TRAINING_PROMPT_SNOOZE_KEY[\s\S]*update\(\{\s*train_on_data:\s*true\s*\}\)[\s\S]*Help improve NikiAI for everyone\?[\s\S]*Allow anonymized math interactions to improve future responses\.[\s\S]*Turn On[\s\S]*Not now/,
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
    pattern: /<footer className="(?:sticky bottom-0 z-20 )?shrink-0[\s\S]*safe-area-inset-bottom|<footer className="sticky bottom-0 z-20[\s\S]*safe-area-inset-bottom/,
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
    source: chatControlsSource,
    pattern: /Pure Logic[\s\S]*Nemanja Mode[\s\S]*\{isNikiMode && \([\s\S]*Lecture Mode[\s\S]*Teaching: ON[\s\S]*Teaching: OFF/,
  },
  {
    name: "pure-logic-responses-offer-explain-bridge",
    source: pageSource,
    pattern: /handleExplainThis[\s\S]*handleResponseFollowup[\s\S]*Do another[\s\S]*Explain step-by-step[\s\S]*Harder problem/,
  },
  {
    name: "artifact-panel-opens-with-live-preview-and-export",
    source: artifactWorkspaceSource,
    pattern: /handleOpenArtifact[\s\S]*OPEN ARTIFACT[\s\S]*📘 Study Artifact[\s\S]*Structured notes generated from your request[\s\S]*Export PDF[\s\S]*data-artifact-export/,
  },
  {
    name: "artifact-pdf-export-downloads-without-popup-window",
    source: artifactWorkspaceSource,
    pattern: /(?=[\s\S]*buildSinglePagePdfFromJpeg)(?=[\s\S]*URL\.createObjectURL)(?=[\s\S]*link\.download)(?=[\s\S]*link\.click\(\))(?=[\s\S]*\.pdf)/,
  },
  {
    name: "artifact-creation-shows-workspace-feedback",
    source: artifactWorkspaceSource,
    pattern: /artifactCreationNotice[\s\S]*Study artifact created[\s\S]*reopenCreationNoticeArtifact[\s\S]*Open workspace/,
  },
  {
    name: "chat-offers-to-continue-last-study-artifact",
    source: artifactWorkspaceSource,
    pattern: /(?=[\s\S]*visibleRecentArtifactResume)(?=[\s\S]*Continue your last study artifact)(?=[\s\S]*handleResumeRecentArtifact)(?=[\s\S]*dismissRecentArtifactResume)(?=[\s\S]*Not now)(?=[\s\S]*LAST_ARTIFACT_PANEL_STORAGE_KEY)(?=[\s\S]*savedArtifacts\.length > 0)(?=[\s\S]*savedArtifacts\.some\(\(artifact\) => artifact\.id === recentArtifactResumeState\.savedArtifactId\))/,
  },
  {
    name: "artifact-resume-state-is-session-scoped",
    source: artifactWorkspaceHookSource,
    pattern: /(?=[\s\S]*getArtifactResumeStorageKey)(?=[\s\S]*setRecentArtifactResumeState\(null\))(?=[\s\S]*removeItem\(LAST_ARTIFACT_PANEL_STORAGE_KEY\))(?=[\s\S]*window\.localStorage\.getItem\(scopedStorageKey\))(?=[\s\S]*window\.localStorage\.getItem\(LAST_ARTIFACT_PANEL_STORAGE_KEY\))/,
  },
  {
    name: "artifact-panel-supports-saveable-study-library",
    source: artifactWorkspaceSource,
    pattern: /(?=[\s\S]*handleOpenSavedArtifact)(?=[\s\S]*handleSaveArtifact)(?=[\s\S]*showLoginGatePrompt)(?=[\s\S]*study_artifacts)(?=[\s\S]*Save to Study Library)/,
  },
  {
    name: "artifact-library-supports-delete-with-owner-check",
    source: artifactWorkspaceSource,
    pattern: /(?=[\s\S]*handleDeleteSavedArtifact)(?=[\s\S]*window\.confirm\(`Delete "\$\{artifact\.title\}" from your Study Library\?`\))(?=[\s\S]*from\("study_artifacts"\)\s*\.delete\(\)\s*\.eq\("id", artifact\.id\)\s*\.eq\("user_id", sessionUserId\))(?=[\s\S]*Artifact deleted)(?=[\s\S]*Delete)/,
  },
  {
    name: "logged-out-restricted-actions-show-soft-login-prompt",
    source: pageSource,
    pattern: /type LoginGatePrompt[\s\S]*showLoginGatePrompt[\s\S]*Log in to save your study progress[\s\S]*Keep your progress[\s\S]*Not now[\s\S]*router\.push\(["']\/login["']\)/,
  },
  {
    name: "artifact-panel-behaves-like-a-study-workspace",
    source: artifactWorkspaceSource,
    pattern: /(?=[\s\S]*artifactKindLabel)(?=[\s\S]*No lecture source attached)(?=[\s\S]*Unsaved changes)(?=[\s\S]*Save Changes)(?=[\s\S]*Recent Artifacts)(?=[\s\S]*(Make Private|Make Public))/,
  },
  {
    name: "artifact-panel-protects-unsaved-work",
    source: artifactWorkspaceSource,
    pattern: /serializeArtifactWorkspace[\s\S]*artifactBaselineSnapshot[\s\S]*You have unsaved changes[\s\S]*beforeunload[\s\S]*closeArtifactWorkspace/,
  },
  {
    name: "study-artifacts-schema-supports-public-visibility",
    source: studyArtifactsSqlSource,
    pattern: /is_public boolean[\s\S]*alter table public\.study_artifacts[\s\S]*alter column is_public set default false[\s\S]*study artifacts select public rows[\s\S]*is_public = true/,
  },
  {
    name: "public-artifacts-route-only-returns-public-rows",
    source: publicArtifactsRouteSource,
    pattern: /from\("study_artifacts"\)[\s\S]*select\("id, title, content, source_prompt, kind, course_tag, topic_tag, is_public, created_at, updated_at"\)[\s\S]*eq\("is_public", true\)/,
  },
  {
    name: "artifact-library-badges-reflect-public-and-private-state",
    source: knowledgeBaseSource,
    pattern: /🌐 Public[\s\S]*🔒 Private[\s\S]*Only artifacts explicitly marked public are discoverable here\./,
  },
  {
    name: "profile-page-shows-real-sync-feedback",
    source: profileSource,
    pattern: /syncState[\s\S]*persistedProfile[\s\S]*Unsynced changes[\s\S]*Cloud synced[\s\S]*Changes are waiting for sync/,
  },
  {
    name: "settings-menu-shows-live-status-and-session-snapshot",
    source: settingsSource,
    pattern: /sessionSummary[\s\S]*No active topic[\s\S]*Mode[\s\S]*Personalization[\s\S]*Training[\s\S]*Sync[\s\S]*Current Session/,
  },
  {
    name: "settings-menu-has-inline-toggles-and-quick-actions",
    source: settingsSource,
    pattern: /Quick Toggles[\s\S]*Default Mode[\s\S]*Improve Model[\s\S]*Quick Actions[\s\S]*New Chat[\s\S]*Open Artifact Panel[\s\S]*Reset Settings/,
  },
  {
    name: "settings-menu-opens-artifacts-from-saved-library-data",
    source: settingsSource,
    pattern: /fetchLatestSavedArtifact[\s\S]*from\("study_artifacts"\)[\s\S]*order\("updated_at", \{ ascending: false \}\)[\s\S]*maybeSingle\(\)[\s\S]*handleOpenArtifactPanel[\s\S]*Log in to access your artifacts[\s\S]*No saved artifact yet[\s\S]*LAST_ARTIFACT_PANEL_STORAGE_KEY[\s\S]*handleQuickHomeAction\("open-artifact", "Opening artifact"\)[\s\S]*Latest artifact:/,
  },
  {
    name: "settings-menu-shows-inline-save-feedback",
    source: settingsSource,
    pattern: /syncState[\s\S]*syncBadgeText[\s\S]*syncBadgeClass[\s\S]*Saved locally|syncState[\s\S]*syncBadgeText[\s\S]*syncBadgeClass[\s\S]*Cloud synced/,
  },
  {
    name: "home-syncs-menu-session-snapshot-and-pending-actions",
    source: artifactWorkspaceSource,
    pattern: /(?=[\s\S]*CURRENT_CHAT_MODE_STORAGE_KEY)(?=[\s\S]*CURRENT_SESSION_SNAPSHOT_STORAGE_KEY)(?=[\s\S]*LAST_ARTIFACT_PANEL_STORAGE_KEY)(?=[\s\S]*PENDING_HOME_ACTION_STORAGE_KEY)(?=[\s\S]*applyPreferredModeToFreshChat\(\{ resetTeaching: true \}\))(?=[\s\S]*openStoredArtifactFromStorage\(\{ promptOnReplace: false \}\))/, 
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
    name: "source-cards-show-knowledge-base-transparency",
    source: pageSource,
    pattern: /Active lecture set:[\s\S]*Current question looks like[\s\S]*Low relevance/,
  },
  {
    name: "source-inspector-opens-from-source-cards",
    source: pageSource,
    pattern: /View source[\s\S]*aria-label="Source inspector"[\s\S]*Lecture Source details/,
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
  {
    name: "avatars-normalize-storage-paths-and-empty-values",
    source: avatarUrlSource,
    pattern: /function\s+extractAvatarPath[\s\S]*if\s*\(!value\)\s*return null;[\s\S]*getPublicUrl/,
  },
  {
    name: "avatar-images-bypass-optimizer-at-render-points",
    source: `${pageSource}\n${profileSource}\n${settingsSource}`,
    pattern: /resolveAvatarUrl[\s\S]*unoptimized[\s\S]*resolveAvatarUrl[\s\S]*unoptimized[\s\S]*resolveAvatarUrl[\s\S]*unoptimized/,
  },
  {
    name: "next-allows-supabase-and-google-avatar-hosts",
    source: nextConfigSource,
    pattern: /storage\/v1\/object\/public\/Avatars\/\*\*[\s\S]*storage\/v1\/object\/sign\/Avatars\/\*\*[\s\S]*hostname:\s*["']lh3\.googleusercontent\.com["']/,
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

if (/lecture_sources[\s\S]{0,400}\.eq\(["']user_id["']/.test(ragHelpersSource)) {
  failed = true;
  console.error("❌ knowledge-base-lecture-counts-do-not-filter-by-user");
} else {
  console.log("✅ knowledge-base-lecture-counts-do-not-filter-by-user");
}

if (failed) process.exit(1);
