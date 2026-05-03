type SafeLogLevel = "error" | "warn" | "info";

type SafeLogMetadata = Record<string, unknown>;

const SENSITIVE_METADATA_KEY =
  /(prompt|message|content|file|profile|artifact|password|passcode|passwd|token|secret|cookie|authorization|session|email|response|text|key)/i;

const TOKEN_LIKE_VALUE =
  /(bearer\s+)[a-z0-9._-]{20,}|((?:access_token|refresh_token|id_token|api_key|apikey|password|passwd|passcode)\s*[:=]\s*)[^\s&]+/gi;

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : typeof error;
}

function safeErrorDigest(error: unknown): string | undefined {
  if (error && typeof error === "object" && "digest" in error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" ? digest.slice(0, 120) : undefined;
  }
  return undefined;
}

function redactString(value: string): string {
  const redacted = value.replace(TOKEN_LIKE_VALUE, (_match, bearerPrefix, secretPrefix) => {
    return `${bearerPrefix ?? secretPrefix ?? ""}[REDACTED]`;
  });
  return redacted.length > 160 ? `${redacted.slice(0, 157)}...` : redacted;
}

function sanitizeMetadataValue(key: string, value: unknown): unknown {
  if (SENSITIVE_METADATA_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (value && typeof value === "object") return "[object]";
  if (typeof value === "undefined") return undefined;
  return String(value);
}

function sanitizeMetadata(metadata?: SafeLogMetadata): SafeLogMetadata | undefined {
  if (!metadata) return undefined;

  const sanitizedEntries = Object.entries(metadata)
    .map(([key, value]) => [key, sanitizeMetadataValue(key, value)] as const)
    .filter(([, value]) => typeof value !== "undefined");

  return sanitizedEntries.length ? Object.fromEntries(sanitizedEntries) : undefined;
}

export function buildSafeErrorLog(
  action: string,
  error: unknown,
  metadata?: SafeLogMetadata
) {
  return {
    action,
    errorType: safeErrorName(error),
    digest: safeErrorDigest(error),
    metadata: sanitizeMetadata(metadata),
    ...(process.env.NODE_ENV !== "production" && error instanceof Error
      ? { devMessage: redactString(error.message) }
      : {}),
  };
}

export function logSafeError(action: string, error: unknown, metadata?: SafeLogMetadata) {
  console.error("[niki:error]", buildSafeErrorLog(action, error, metadata));
}

export function logSafeWarning(action: string, error: unknown, metadata?: SafeLogMetadata) {
  console.warn("[niki:warn]", buildSafeErrorLog(action, error, metadata));
}

export function logSafeInfo(action: string, metadata?: SafeLogMetadata) {
  const payload = {
    action,
    metadata: sanitizeMetadata(metadata),
  };
  const logger: Record<SafeLogLevel, typeof console.error> = {
    error: console.error,
    warn: console.warn,
    info: console.info,
  };
  logger.info("[niki:info]", payload);
}
