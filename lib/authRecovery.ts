import { supabase } from "@/lib/supabaseClient";

type RecoveredSession = Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];

function authParamsFromUrl() {
  if (typeof window === "undefined") {
    return { query: new URLSearchParams(), hash: new URLSearchParams() };
  }

  return {
    query: new URLSearchParams(window.location.search),
    hash: new URLSearchParams(window.location.hash.replace(/^#/, "")),
  };
}

export function hasAuthCallbackParams() {
  const { query, hash } = authParamsFromUrl();
  return (
    query.has("code") ||
    query.has("error") ||
    hash.has("access_token") ||
    hash.has("refresh_token") ||
    hash.has("error")
  );
}

export function authCallbackNextPath(fallback = "/") {
  const { query } = authParamsFromUrl();
  const next = query.get("next");
  return next && next.startsWith("/") ? next : fallback;
}

export function clearAuthCallbackUrl(path = window.location.pathname) {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, document.title, path);
}

async function waitForStoredSession(timeoutMs = 5000): Promise<RecoveredSession> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user?.id) return session;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function recoverSessionFromUrl(): Promise<RecoveredSession> {
  const { query, hash } = authParamsFromUrl();
  const authError = query.get("error_description") || hash.get("error_description") || query.get("error") || hash.get("error");
  if (authError) throw new Error(authError);

  const code = query.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) return session;
      throw error;
    }
    return data.session ?? waitForStoredSession();
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return data.session ?? waitForStoredSession();
  }

  return waitForStoredSession();
}
