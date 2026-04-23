import { supabase } from "@/lib/supabaseClient";

type AuthUserLike = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type AuthSessionLike = {
  user?: AuthUserLike;
} | null;

type ProfileFallback = {
  id: string;
  first_name: string;
  username: string;
  avatar_url: string;
};

function metadataString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usernameFromValue(value: string) {
  return value
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
}

export function profileFallbackFromSession(session: AuthSessionLike): ProfileFallback | null {
  const user = session?.user;
  if (!user?.id) return null;

  const metadata = user.user_metadata ?? {};
  const fullName =
    metadataString(metadata.full_name) ||
    metadataString(metadata.name) ||
    metadataString(metadata.preferred_username) ||
    metadataString(user.email).replace(/@.*$/, "");
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] || "User";
  const username =
    usernameFromValue(metadataString(metadata.user_name)) ||
    usernameFromValue(metadataString(metadata.preferred_username)) ||
    usernameFromValue(metadataString(metadata.name)) ||
    usernameFromValue(metadataString(user.email)) ||
    "user";
  const avatarUrl = metadataString(metadata.avatar_url) || metadataString(metadata.picture);

  return {
    id: user.id,
    first_name: firstName,
    username,
    avatar_url: avatarUrl,
  };
}

export async function ensureProfileForSession(session: AuthSessionLike) {
  const fallback = profileFallbackFromSession(session);
  if (!fallback) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, username, avatar_url")
    .eq("id", fallback.id)
    .maybeSingle();

  if (error) {
    console.warn("Profile bootstrap fetch failed:", error);
    return fallback;
  }

  if (!data) {
    const { error: insertError } = await supabase.from("profiles").insert(fallback);
    if (insertError) console.warn("Profile bootstrap insert failed:", insertError);
    return fallback;
  }

  const patch: Partial<ProfileFallback> = {};
  if (!data.first_name && fallback.first_name) patch.first_name = fallback.first_name;
  if (!data.username && fallback.username) patch.username = fallback.username;
  if (!data.avatar_url && fallback.avatar_url) patch.avatar_url = fallback.avatar_url;

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", fallback.id);
    if (updateError) console.warn("Profile bootstrap update failed:", updateError);
  }

  return {
    ...fallback,
    ...data,
    ...patch,
  };
}
