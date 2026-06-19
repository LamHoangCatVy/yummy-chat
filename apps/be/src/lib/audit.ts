import { randomUUID } from "node:crypto"
import { redact } from "./redact"

// ── Event types ─────────────────────────────────────────────────────────────

export const AUDIT_EVENT_TYPES = [
  "auth.login",
  "auth.logout",
  "auth.failure",
  "auth.signup",
  "chat.run",
  "chat.error",
  "skill.create",
  "skill.update",
  "skill.delete",
  "memory.create",
  "memory.update",
  "memory.delete",
  "memory.settings_change",
  "rate_limit.exceeded",
  "conversation.create",
  "conversation.update",
  "conversation.delete",
] as const

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]

// ── Event structure ─────────────────────────────────────────────────────────

export interface AuditEvent {
  readonly event_id: string
  readonly event_type: AuditEventType
  readonly actor: {
    readonly user_id: string | null
    readonly ip: string | null
    readonly user_agent: string | null
  }
  readonly timestamp: string
  readonly request_id: string
  readonly resource?: {
    readonly type: string
    readonly id?: string
  }
  readonly outcome: "success" | "failure"
  readonly details?: Record<string, unknown>
}

// ── Logger ──────────────────────────────────────────────────────────────────

type AuditSink = (event: AuditEvent) => void

let sink: AuditSink = defaultSink

const buffer: AuditEvent[] = []
const BUFFER_MAX = 1000

function defaultSink(event: AuditEvent): void {
  // Structured JSON log line — redacted before output
  const line = JSON.stringify(redact(event))
  if (typeof process !== "undefined" && process.stdout) {
    process.stdout.write(`${line}\n`)
  }
  // Keep a ring buffer for testing / inspection
  buffer.push(event)
  if (buffer.length > BUFFER_MAX) {
    buffer.shift()
  }
}

/** Replace the audit sink (for testing or log aggregation) */
export function setAuditSink(fn: AuditSink): void {
  sink = fn
}

/** Reset sink to default (for test cleanup) */
export function resetAuditSink(): void {
  sink = defaultSink
  buffer.length = 0
}

/** Get buffered events (for testing) */
export function getAuditBuffer(): readonly AuditEvent[] {
  return [...buffer]
}

/** Clear the audit buffer (for testing) */
export function clearAuditBuffer(): void {
  buffer.length = 0
}

// ── Emit ────────────────────────────────────────────────────────────────────

export interface AuditInput {
  readonly event_type: AuditEventType
  readonly user_id?: string | null | undefined
  readonly ip?: string | null | undefined
  readonly user_agent?: string | null | undefined
  readonly request_id: string
  readonly resource?: { readonly type: string; readonly id?: string }
  readonly outcome: "success" | "failure"
  readonly details?: Record<string, unknown>
}

export function emitAuditEvent(input: AuditInput): AuditEvent {
  const event: AuditEvent = {
    event_id: randomUUID(),
    event_type: input.event_type,
    actor: {
      user_id: input.user_id ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    },
    timestamp: new Date().toISOString(),
    request_id: input.request_id,
    ...(input.resource ? { resource: input.resource } : {}),
    outcome: input.outcome,
    ...(input.details ? { details: input.details } : {}),
  }

  sink(event)
  return event
}

// ── Convenience helpers ─────────────────────────────────────────────────────

export function auditFromContext(c: {
  get: (key: "requestId") => string
  req: {
    header: (name: string) => string | undefined
  }
}): Pick<AuditInput, "request_id" | "ip" | "user_agent"> {
  return {
    request_id: c.get("requestId"),
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
    user_agent: c.req.header("user-agent") ?? null,
  } as const
}
