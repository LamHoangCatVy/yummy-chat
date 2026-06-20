// ── PII / Secret redaction for logs ─────────────────────────────────────────

/** Keys whose values should always be redacted in logs */
const REDACTED_KEYS = new Set([
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "api-key",
  "apiKey",
  "encryptedApiKey",
  "user_api_key",
  "authorization",
  "cookie",
  "session_token",
  "access_token",
  "refresh_token",
  "credit_card",
  "creditCard",
  "ssn",

  "DATABASE_URL",
  "LLM_PROVIDER_API_KEY",
  "BETTER_AUTH_SECRET",
])

/** Regex patterns that look like secrets even if the key name doesn't match */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /^sk-[a-zA-Z0-9]{20,}$/, // OpenAI-style keys
  /^ghp_[a-zA-Z0-9]{36}$/, // GitHub PATs
  /^Bearer\s+/i, // Bearer tokens in headers
  /^[a-zA-Z0-9]{32,}$/, // Long random strings (likely tokens)
  /^postgres:\/\/.*:.*@/, // DB URLs with credentials
]

const REDACTED = "[REDACTED]"

/** Check if a value looks like a secret */
function isSecretValue(value: unknown): boolean {
  if (typeof value !== "string") return false
  return SECRET_PATTERNS.some((re) => re.test(value))
}

/** Redact a single value if the key suggests it's sensitive */
function redactValue(key: string, value: unknown): unknown {
  const lowerKey = key.toLowerCase().replace(/[-_]/g, "")

  for (const redactedKey of REDACTED_KEYS) {
    const normalizedRedacted = redactedKey.toLowerCase().replace(/[-_]/g, "")
    if (lowerKey === normalizedRedacted) {
      return REDACTED
    }
  }

  const sensitiveSubstrings = [
    "password",
    "secret",
    "token",
    "apikey",
    "authorization",
    "cookie",
    "credential",
  ]
  for (const substr of sensitiveSubstrings) {
    if (lowerKey.includes(substr)) {
      return REDACTED
    }
  }

  if (isSecretValue(value)) {
    return REDACTED
  }

  return value
}

/** Deep-redact an object, replacing sensitive values with [REDACTED] */
export function redact<T>(input: T, depth = 0): T {
  if (depth > 10) return input // Prevent infinite recursion

  if (input === null || input === undefined) return input
  if (typeof input !== "object") return input

  if (Array.isArray(input)) {
    return input.map((item) => redact(item, depth + 1)) as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = redact(value, depth + 1)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => redact(item, depth + 1))
    } else {
      result[key] = redactValue(key, value)
    }
  }
  return result as T
}

/** Redact a URL, masking query parameters that look like secrets */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const [key] of parsed.searchParams) {
      const lowerKey = key.toLowerCase()
      if (
        lowerKey.includes("key") ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("password")
      ) {
        parsed.searchParams.set(key, REDACTED)
      }
    }
    // Redact userinfo (user:pass@host)
    if (parsed.username || parsed.password) {
      parsed.username = REDACTED
      parsed.password = REDACTED
    }
    return parsed.toString()
  } catch {
    return REDACTED
  }
}

/** Redact an Authorization header value */
export function redactAuthHeader(value: string | undefined): string {
  if (!value) return ""
  return REDACTED
}

/**
 * Redact secret-like substrings inside a plain string.
 *
 * Uses the same SECRET_PATTERNS but with anchors stripped and word boundaries
 * applied so secrets embedded in longer error messages (e.g. SSE errors)
 * are caught.  Patterns that are too broad for substring matching (e.g. the
 * generic 32-char alphanumeric token heuristic) are omitted to avoid false
 * positives.
 */
export function redactString(str: string): string {
  let result = str

  // sk-… OpenAI-style keys
  result = result.replace(/\bsk-[a-zA-Z0-9-]{20,}\b/g, REDACTED)
  // ghp_… GitHub PATs
  result = result.replace(/\bghp_[a-zA-Z0-9]{36}\b/g, REDACTED)
  // Bearer tokens in headers
  result = result.replace(/Bearer\s+[^\s,;]+/gi, REDACTED)
  // postgres:// URLs with credentials
  result = result.replace(/postgres:\/\/[^@\s]*?:\S+?@/gi, REDACTED)

  return result
}
