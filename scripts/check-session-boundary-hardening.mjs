import { readFileSync } from "node:fs";

const pageSource = readFileSync("app/page.tsx", "utf8");
const chatHistorySource = readFileSync("hooks/useChatHistory.ts", "utf8");
const artifactWorkspaceSource = readFileSync("hooks/useArtifactWorkspace.ts", "utf8");

function hasAll(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
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

function extractFunctionThroughNextMarker(source, marker, nextMarker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";
  const nextIndex = source.indexOf(nextMarker, markerIndex + marker.length);
  return nextIndex === -1 ? source.slice(markerIndex) : source.slice(markerIndex, nextIndex);
}

const clearSignedOutStateBlock = extractBlock(pageSource, "const clearSignedOutState");
const authStateChangeBlock = extractBlock(pageSource, "supabase.auth.onAuthStateChange");
const sendChatMessageBlock = extractBlock(pageSource, "const sendChatMessage");
const invalidateHistoryBlock = extractBlock(chatHistorySource, "const invalidateChatHistoryLoads");
const clearHistoryBlock = extractBlock(chatHistorySource, "const clearChatHistoryState");
const fetchHistoryBlock = extractBlock(chatHistorySource, "const fetchHistory");
const saveArtifactBlock = extractBlock(artifactWorkspaceSource, "const handleSaveArtifact");
const deleteArtifactBlock = extractBlock(artifactWorkspaceSource, "const handleDeleteSavedArtifact");
const artifactSessionEffect = extractFunctionThroughNextMarker(
  artifactWorkspaceSource,
  "useEffect(() => {\n    const previousUserId = previousSessionUserIdRef.current",
  "  useEffect(() => {\n    let cancelled = false;\n\n    const syncArtifacts"
);

const checks = [
  {
    name: "logout clears streaming, loading, and user-scoped state",
    pass:
      clearSignedOutStateBlock &&
      hasAll(clearSignedOutStateBlock, [
        "abortControllerRef.current?.abort()",
        "abortControllerRef.current = null",
        "isStreamingRef.current = false",
        "activeSessionUserIdRef.current = null",
        "setIsLoading(false)",
        "abortVoiceInputRef.current()",
        "clearChatHistoryStateRef.current(notice)",
        "setSession(null)",
        "setProfile(null)",
        "setMessages(createGreeting(false))",
        "setInputValue(\"\")",
      ]),
  },
  {
    name: "account switch aborts streams and clears loading before loading new user",
    pass:
      authStateChangeBlock &&
      hasAll(authStateChangeBlock, [
        "const previousUserId = lastSessionIdRef.current",
        "if (isStreamingRef.current)",
        "abortControllerRef.current?.abort()",
        "abortControllerRef.current = null",
        "isStreamingRef.current = false",
        "chatLoadSequenceRef.current += 1",
        "setIsLoading(false)",
        "previousUserId && previousUserId !== newUserId",
        "clearChatHistoryStateRef.current()",
        "setMessages(createGreeting(false))",
        "setProfile(null)",
      ]),
  },
  {
    name: "stale chat sends cannot update old sessions",
    pass:
      sendChatMessageBlock &&
      hasAll(sendChatMessageBlock, [
        "const sendSessionUserId = session?.user?.id ?? null",
        "const isSendSessionCurrent = () => activeSessionUserIdRef.current === sendSessionUserId",
        "if (!isSendSessionCurrent()) return",
        "controller.abort()",
        "if (!isUnmountingRef.current && isSendSessionCurrent()) setIsLoading(false)",
        "if (sendSessionUserId && isSendSessionCurrent()) fetchHistory(sendSessionUserId)",
      ]),
  },
  {
    name: "chat history invalidation cannot leave the sidebar stuck loading",
    pass:
      invalidateHistoryBlock &&
      clearHistoryBlock &&
      fetchHistoryBlock &&
      hasAll(invalidateHistoryBlock, [
        "chatLoadSequenceRef.current += 1",
        "setChatHistoryLoading(false)",
      ]) &&
      hasAll(clearHistoryBlock, [
        "chatLoadSequenceRef.current += 1",
        "setChatHistoryLoading(false)",
        "setChatHistory([])",
        "setActiveChatId(null)",
      ]) &&
      hasAll(fetchHistoryBlock, [
        "const loadToken = chatLoadSequenceRef.current",
        "setChatHistoryLoading(true)",
        "if (loadToken !== chatLoadSequenceRef.current)",
        "return []",
        "if (loadToken === chatLoadSequenceRef.current)",
        "setChatHistoryLoading(false)",
      ]),
  },
  {
    name: "artifact save and delete ignore stale user/session results",
    pass:
      saveArtifactBlock &&
      deleteArtifactBlock &&
      hasAll(saveArtifactBlock, [
        "const saveUserId = sessionUserId",
        "user_id: saveUserId",
        ".eq(\"user_id\", sessionUserId)",
        "if (activeSessionUserIdRef.current !== saveUserId) return",
      ]) &&
      hasAll(deleteArtifactBlock, [
        "const deleteUserId = sessionUserId",
        ".delete()",
        ".eq(\"id\", artifact.id)",
        ".eq(\"user_id\", sessionUserId)",
        "if (activeSessionUserIdRef.current !== deleteUserId) return",
      ]),
  },
  {
    name: "logged-out artifact state clears user-owned resume and library data",
    pass:
      artifactSessionEffect &&
      hasAll(artifactSessionEffect, [
        "if (!sessionUserId)",
        "window.localStorage.removeItem(LAST_ARTIFACT_PANEL_STORAGE_KEY)",
        "setRecentArtifactResumeState(null)",
        "setDismissedRecentArtifactId(null)",
        "setSavedArtifacts([])",
        "setArtifactPanel((prev)",
        "Saved artifacts are hidden after logout.",
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
  console.log("✅ session-boundary-hardening");
}
