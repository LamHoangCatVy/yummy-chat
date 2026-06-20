import { describe, expect, test } from "vitest"
import { AUDIT_EVENT_TYPES, clearAuditBuffer, emitAuditEvent, getAuditBuffer } from "./audit"

describe("audit", () => {
  test("emits structured event with all required fields", () => {
    clearAuditBuffer()

    const event = emitAuditEvent({
      event_type: "auth.login",
      user_id: "user-123",
      ip: "127.0.0.1",
      user_agent: "TestAgent/1.0",
      request_id: "req-abc",
      outcome: "success",
    })

    expect(event.event_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(event.event_type).toBe("auth.login")
    expect(event.actor.user_id).toBe("user-123")
    expect(event.actor.ip).toBe("127.0.0.1")
    expect(event.actor.user_agent).toBe("TestAgent/1.0")
    expect(event.request_id).toBe("req-abc")
    expect(event.outcome).toBe("success")
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test("buffers events for inspection", () => {
    clearAuditBuffer()

    emitAuditEvent({
      event_type: "chat.run",
      user_id: "user-1",
      request_id: "req-1",
      outcome: "success",
    })
    emitAuditEvent({
      event_type: "skill.create",
      user_id: "user-1",
      request_id: "req-2",
      outcome: "success",
    })

    const buffer = getAuditBuffer()
    expect(buffer).toHaveLength(2)
    expect(buffer[0]?.event_type).toBe("chat.run")
    expect(buffer[1]?.event_type).toBe("skill.create")
  })

  test("all event types are valid", () => {
    for (const eventType of AUDIT_EVENT_TYPES) {
      const event = emitAuditEvent({
        event_type: eventType,
        request_id: "req-test",
        outcome: "success",
      })
      expect(event.event_type).toBe(eventType)
    }
  })

  test("includes resource when provided", () => {
    clearAuditBuffer()

    const event = emitAuditEvent({
      event_type: "skill.delete",
      user_id: "user-1",
      request_id: "req-1",
      resource: { type: "skill", id: "skill-123" },
      outcome: "success",
    })

    expect(event.resource).toEqual({ type: "skill", id: "skill-123" })
  })

  test("includes details when provided", () => {
    clearAuditBuffer()

    const event = emitAuditEvent({
      event_type: "chat.run",
      user_id: "user-1",
      request_id: "req-1",
      outcome: "success",
      details: { model: "gpt-4", tokenCount: 100 },
    })

    expect(event.details).toEqual({ model: "gpt-4", tokenCount: 100 })
  })

  test("handles null actor fields", () => {
    clearAuditBuffer()

    const event = emitAuditEvent({
      event_type: "auth.failure",
      request_id: "req-1",
      outcome: "failure",
    })

    expect(event.actor.user_id).toBeNull()
    expect(event.actor.ip).toBeNull()
    expect(event.actor.user_agent).toBeNull()
  })
})
