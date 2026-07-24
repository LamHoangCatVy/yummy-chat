import type { ExtractedMemory } from "./client.js"

const BLOCKED_PATTERNS = [
  /\b(password|passcode|pin|otp|one[- ]?time password)\b/i,
  /\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|private[-_ ]?key|secret)\b/i,
  /\b(card number|credit card|cvv|bank account|routing number|iban|swift)\b/i,
  /\b(passport|social security|national id|citizen id|căn cước|cccd|cmnd)\b/i,
]

const CONFIRMATION_CATEGORIES = new Set([
  "health",
  "medical",
  "religion",
  "politics",
  "sexuality",
  "biometric",
])

export type GuardrailDecision = "allow" | "confirmation_required" | "blocked"

export function evaluateMemorySafety(
  candidate: Pick<ExtractedMemory, "key" | "value" | "category">,
  explicit: boolean,
): GuardrailDecision {
  const text = `${candidate.key} ${candidate.value}`
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(text))) return "blocked"
  if (CONFIRMATION_CATEGORIES.has(candidate.category.toLowerCase())) {
    return explicit ? "confirmation_required" : "blocked"
  }
  return "allow"
}

export function normalizeMemoryKey(key: string): string {
  const normalized = key
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized.slice(0, 200)
}
