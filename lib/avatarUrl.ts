import { supabase } from "@/lib/supabaseClient";

const AVATAR_BUCKET = "Avatars";
const PUBLIC_BUCKET_SEGMENT = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
const SIGNED_BUCKET_SEGMENT = `/storage/v1/object/sign/${AVATAR_BUCKET}/`;

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractAvatarPath(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return null;

  if (value.startsWith(`${AVATAR_BUCKET}/`)) {
    return value.slice(AVATAR_BUCKET.length + 1);
  }

  for (const marker of [PUBLIC_BUCKET_SEGMENT, SIGNED_BUCKET_SEGMENT]) {
    const markerIndex = value.indexOf(marker);
    if (markerIndex >= 0) {
      const pathWithQuery = value.slice(markerIndex + marker.length);
      const [path] = pathWithQuery.split("?", 1);
      return decodeURIComponent(path);
    }
  }

  if (!value.includes("://") && value.includes("/")) {
    return value.replace(/^\/+/, "");
  }

  return null;
}

export function resolveAvatarUrl(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (isHttpUrl(trimmed)) {
    return trimmed;
  }

  const avatarPath = extractAvatarPath(trimmed);
  if (!avatarPath) return null;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
  return data?.publicUrl || null;
}
