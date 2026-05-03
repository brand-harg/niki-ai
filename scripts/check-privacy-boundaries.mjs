import { readFileSync } from "node:fs";

const sources = {
  page: readFileSync("app/page.tsx", "utf8"),
  chatHistory: readFileSync("hooks/useChatHistory.ts", "utf8"),
  artifactWorkspace: readFileSync("hooks/useArtifactWorkspace.ts", "utf8"),
  profile: readFileSync("app/profile/page.tsx", "utf8"),
  settings: readFileSync("app/settings/page.tsx", "utf8"),
  generalSettings: readFileSync("app/settings/general/page.tsx", "utf8"),
  personalization: readFileSync("app/personalization/page.tsx", "utf8"),
  chatRoute: readFileSync("app/api/chat/route.ts", "utf8"),
  publicArtifactsRoute: readFileSync("app/api/artifacts/public/route.ts", "utf8"),
  ragRoute: readFileSync("app/api/rag/query/route.ts", "utf8"),
  ragHelpers: readFileSync("lib/ragHelpers.ts", "utf8"),
  supabaseClient: readFileSync("lib/supabaseClient.ts", "utf8"),
  supabaseAdmin: readFileSync("lib/supabaseAdmin.ts", "utf8"),
  studyArtifactsSql: readFileSync("scripts/sql/study-artifacts.sql", "utf8"),
  calendarSql: readFileSync("scripts/sql/calendar-events.sql", "utf8"),
  trainingSql: readFileSync("scripts/sql/training-interactions.sql", "utf8"),
  usageSql: readFileSync("scripts/sql/usage-interactions.sql", "utf8"),
  ragSql: readFileSync("scripts/sql/rag-foundation.sql", "utf8"),
};

function hasAll(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
}

function matchesAll(source, patterns) {
  return patterns.every((pattern) => pattern.test(source));
}

function extractBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";

  const arrowIndex = source.indexOf("=>", markerIndex);
  const openIndex = source.indexOf("{", arrowIndex === -1 ? markerIndex : arrowIndex);
  if (openIndex === -1) return "";

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(markerIndex, index + 1);
    }
  }

  return "";
}

const maybeLogTrainingBlock = extractBlock(sources.chatRoute, "const maybeLogTrainingInteraction");
const maybeLogUsageBlock = extractBlock(sources.chatRoute, "const maybeLogUsageInteraction");
const uploadFileBlock = extractBlock(sources.page, "const uploadFileToSupabase");
const publicArtifactRouteBlock = sources.publicArtifactsRoute;
const lectureSourcesCombined = [
  sources.ragRoute,
  sources.ragHelpers,
  readFileSync("app/api/knowledge-base/status/route.ts", "utf8"),
  readFileSync("app/api/lectures/related/route.ts", "utf8"),
].join("\n");

const checks = [
  {
    name: "chat history reads and mutations stay scoped to the current user",
    pass: matchesAll(sources.chatHistory, [
      /\.from\("chats"\)[\s\S]*\.select\("id, title, is_pinned"\)[\s\S]*\.eq\("id", chatId\)[\s\S]*\.eq\("user_id", userId\)/,
      /\.from\("chats"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("user_id", userId\)/,
      /\.from\("chats"\)[\s\S]*\.update\(\{ is_pinned:[\s\S]*\.eq\("id", chatId\)[\s\S]*\.eq\("user_id", sessionUserId\)/,
      /\.from\("chats"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id", chatId\)[\s\S]*\.eq\("user_id", sessionUserId\)/,
      /\.from\("chats"\)[\s\S]*\.update\(\{ title: trimmed[\s\S]*\.eq\("id", chatId\)[\s\S]*\.eq\("user_id", sessionUserId\)/,
    ]),
  },
  {
    name: "chat creation, message save, and chat timestamp updates use owned chat scope",
    pass: hasAll(sources.page, [
      "const sendSessionUserId = session?.user?.id ?? null",
      "user_id: sendSessionUserId",
      ".from(\"messages\").insert({",
      "chat_id: chatId",
      ".from(\"chats\")",
      ".eq(\"id\", chatId)",
      ".eq(\"user_id\", sendSessionUserId)",
      "if (!isSendSessionCurrent()) return",
    ]),
  },
  {
    name: "artifact library operations are owned, and public artifact reads are explicit",
    pass:
      hasAll(sources.artifactWorkspace, [
        ".from(\"study_artifacts\")",
        ".eq(\"user_id\", userId)",
        "user_id: saveUserId",
        ".eq(\"user_id\", sessionUserId)",
        "if (activeSessionUserIdRef.current !== saveUserId) return",
        "if (activeSessionUserIdRef.current !== deleteUserId) return",
      ]) &&
      hasAll(publicArtifactRouteBlock, [
        ".from(\"study_artifacts\")",
        ".select(\"id, title, content, source_prompt, kind, course_tag, topic_tag, is_public, created_at, updated_at\")",
        ".eq(\"is_public\", true)",
      ]),
  },
  {
    name: "artifact SQL keeps private rows private and public discovery narrow",
    pass: hasAll(sources.studyArtifactsSql, [
      "alter table public.study_artifacts enable row level security",
      "study artifacts select own rows",
      "using (auth.uid() = user_id)",
      "study artifacts select public rows",
      "using (is_public = true)",
      "study artifacts insert own rows",
      "with check (auth.uid() = user_id)",
      "study artifacts update own rows",
      "study artifacts delete own rows",
    ]),
  },
  {
    name: "upload paths are login-gated and user-prefixed",
    pass:
      uploadFileBlock &&
      hasAll(uploadFileBlock, [
        "const uploadUserId = session?.user?.id",
        "if (!uploadUserId) return null",
        "const path = `${uploadUserId}/${chatId}/${Date.now()}.${ext}`",
        ".from(\"chat-uploads\")",
        ".upload(path, file, { upsert: false })",
        "if (activeSessionUserIdRef.current !== uploadUserId) return null",
      ]) &&
      hasAll(sources.profile, [
        "const filePath = `${session.user.id}/${Math.random()}.${fileExt}`",
        ".from(\"Avatars\")",
        ".upload(filePath, file)",
      ]),
  },
  {
    name: "profile, personalization, and settings updates are user-scoped",
    pass:
      hasAll(sources.profile, [
        ".from(\"profiles\")",
        ".update({",
        ".eq(\"id\", session.user.id)",
      ]) &&
      hasAll(sources.settings, [
        "await supabase.from(\"profiles\").update(patch).eq(\"id\", session.user.id)",
        ".update({",
        ".eq(\"id\", session.user.id)",
      ]) &&
      hasAll(sources.generalSettings, [
        ".from('profiles')",
        ".update({",
        ".eq('id', session.user.id)",
      ]) &&
      hasAll(sources.personalization, [
        ".from(\"profiles\")",
        ".update({",
        ".eq(\"id\", session.user.id)",
      ]),
  },
  {
    name: "calendar SQL is RLS-protected by user ownership",
    pass: hasAll(sources.calendarSql, [
      "alter table public.calendar_events enable row level security",
      "calendar events select own rows",
      "calendar events insert own rows",
      "calendar events update own rows",
      "calendar events delete own rows",
      "auth.uid() = user_id",
    ]),
  },
  {
    name: "global lecture data stays publicly readable and not user-scoped",
    pass:
      hasAll(sources.ragSql, [
        "lecture sources are publicly readable",
        "using (true)",
        "lecture chunks are publicly readable",
      ]) &&
      !/lecture_sources[\s\S]{0,400}\.eq\(["']user_id["']/.test(lectureSourcesCombined) &&
      !/lecture_chunks[\s\S]{0,400}\.eq\(["']user_id["']/.test(lectureSourcesCombined),
  },
  {
    name: "training logs are consent-gated and separate from chat history",
    pass:
      maybeLogTrainingBlock &&
      hasAll(maybeLogTrainingBlock, [
        "if (!trainConsent) return",
        "sanitizeTrainingLogText",
        ".from(\"training_interactions\")",
        "user_id: userId || null",
        "prompt: sanitizedPrompt",
        "assistant_response: sanitizedResponse",
      ]) &&
      hasAll(sources.trainingSql, [
        "Separate consent-gated quality/training log",
        "alter table public.training_interactions enable row level security",
      ]),
  },
  {
    name: "usage logs are consent-gated metadata only",
    pass:
      maybeLogUsageBlock &&
      hasAll(maybeLogUsageBlock, [
        "if (!effectiveUsageLogsConsent) return",
        ".from(\"usage_interactions\")",
        "user_id: userId || null",
        "mode: isNikiMode ? \"nemanja\" : \"pure\"",
        "teaching_mode: lectureMode",
        "focus_topic: focusTopicContext || null",
      ]) &&
      !/\b(prompt|response|assistant_response|user_prompt|message|content|file)\b\s*:/.test(
        maybeLogUsageBlock
      ) &&
      hasAll(sources.usageSql, [
        "Separate metadata-only usage log",
        "alter table public.usage_interactions enable row level security",
      ]),
  },
  {
    name: "user-owned local artifact resume state clears on logout",
    pass: hasAll(sources.artifactWorkspace, [
      "if (!sessionUserId)",
      "window.localStorage.removeItem(LAST_ARTIFACT_PANEL_STORAGE_KEY)",
      "setRecentArtifactResumeState(null)",
      "setSavedArtifacts([])",
      "Saved artifacts are hidden after logout.",
    ]),
  },
  {
    name: "sensitive chat and RAG debug logs are development-gated",
    pass:
      hasAll(sources.chatRoute, [
        "const isDevLog = process.env.NODE_ENV !== \"production\"",
        "if (isDevLog)",
        "console.log(\"FINAL MESSAGES\", JSON.stringify(ollamaMessages, null, 2))",
      ]) &&
      hasAll(sources.ragRoute, [
        "const isDevLog = process.env.NODE_ENV !== \"production\"",
        "if (isDevLog)",
        "console.log(\"lectureContext\", context.join(\"\\n\\n---\\n\\n\"))",
      ]),
  },
  {
    name: "Supabase clients separate browser anon auth from server service-role access",
    pass:
      hasAll(sources.supabaseClient, [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "persistSession: true",
        "flowType: \"pkce\"",
      ]) &&
      hasAll(sources.supabaseAdmin, [
        "SUPABASE_SERVICE_ROLE_KEY",
        "persistSession: false",
        "autoRefreshToken: false",
      ]),
  },
];

let failed = false;
for (const check of checks) {
  if (check.pass) {
    console.log(`✅ ${check.name}`);
  } else {
    failed = true;
    console.error(`❌ ${check.name}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("✅ privacy-boundaries");
}
