import { describe, expect, it } from "vitest"
import type { z } from "zod"
import {
  API_V1,
  chatMessageSchema,
  conversationIdSchema,
  conversationSchema,
  createConversationInputSchema,
  healthResponseSchema,
  memoryEntrySchema,
  messageIdSchema,
  sendMessageInputSchema,
  skillSchema,
  userIdSchema,
} from "./index"
import type { ChatMessage, ConversationId, MessageId, UserId, YummyError } from "./index"

const UUID = "550e8400-e29b-41d4-a716-446655440000"
const UUID2 = "660e8400-e29b-41d4-a716-446655440000"
const UUID3 = "770e8400-e29b-41d4-a716-446655440000"
const NOW = new Date().toISOString()

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`)
}

// ─── Schema validation ──────────────────────────────────────────────

describe("chatMessageSchema", () => {
  const valid = {
    id: UUID,
    conversationId: UUID2,
    role: "user" as const,
    content: "Hello",
    createdAt: NOW,
    updatedAt: NOW,
  }

  it("parses valid message", () => {
    const result = chatMessageSchema.parse(valid)
    expect(result.id).toBe(UUID as MessageId)
    expect(result.role).toBe("user")
    expect(result.content).toBe("Hello")
  })

  it("rejects empty content", () => {
    expect(() => chatMessageSchema.parse({ ...valid, content: "" })).toThrow()
  })

  it("rejects invalid role", () => {
    expect(() => chatMessageSchema.parse({ ...valid, role: "invalid" })).toThrow()
  })

  it("rejects invalid UUID", () => {
    expect(() => chatMessageSchema.parse({ ...valid, id: "not-a-uuid" })).toThrow()
  })

  it("accepts optional parentId", () => {
    const result = chatMessageSchema.parse({ ...valid, parentId: UUID3 })
    expect(result.parentId).toBe(UUID3 as MessageId)
  })
})

describe("conversationSchema", () => {
  const valid = {
    id: UUID,
    userId: UUID2,
    title: "Test Chat",
    createdAt: NOW,
    updatedAt: NOW,
  }

  it("parses valid conversation", () => {
    const result = conversationSchema.parse(valid)
    expect(result.id).toBe(UUID as ConversationId)
    expect(result.title).toBe("Test Chat")
  })

  it("rejects empty title", () => {
    expect(() => conversationSchema.parse({ ...valid, title: "" })).toThrow()
  })

  it("rejects title exceeding max length", () => {
    expect(() => conversationSchema.parse({ ...valid, title: "x".repeat(201) })).toThrow()
  })
})

describe("sendMessageInputSchema", () => {
  const valid = {
    content: "Hello",
    model: "gpt-4",
    sessionId: UUID,
  }

  it("parses valid input", () => {
    const result = sendMessageInputSchema.parse(valid)
    expect(result.content).toBe("Hello")
    expect(result.model).toBe("gpt-4")
  })

  it("rejects empty content", () => {
    expect(() => sendMessageInputSchema.parse({ ...valid, content: "" })).toThrow()
  })

  it("rejects invalid sessionId", () => {
    expect(() => sendMessageInputSchema.parse({ ...valid, sessionId: "bad" })).toThrow()
  })

  it("accepts optional conversationId", () => {
    const result = sendMessageInputSchema.parse({
      ...valid,
      conversationId: UUID2,
    })
    expect(result.conversationId).toBe(UUID2 as ConversationId)
  })
})

describe("createConversationInputSchema", () => {
  it("parses valid input", () => {
    const result = createConversationInputSchema.parse({ title: "New Chat" })
    expect(result.title).toBe("New Chat")
  })

  it("rejects empty title", () => {
    expect(() => createConversationInputSchema.parse({ title: "" })).toThrow()
  })
})

describe("skillSchema", () => {
  const valid = {
    id: UUID,
    ownerId: UUID2,
    name: "web-search",
    prompt: "You are a search assistant.",
    model: "gpt-4",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  }

  it("parses valid skill", () => {
    const result = skillSchema.parse(valid)
    expect(result.name).toBe("web-search")
    expect(result.prompt).toBe("You are a search assistant.")
    expect(result.model).toBe("gpt-4")
    expect(result.temperature).toBeUndefined()
    expect(result.maxTokens).toBeUndefined()
  })

  it("parses skill with optional fields", () => {
    const result = skillSchema.parse({ ...valid, temperature: 0.5, maxTokens: 4096 })
    expect(result.temperature).toBe(0.5)
    expect(result.maxTokens).toBe(4096)
  })

  it("rejects empty name", () => {
    expect(() => skillSchema.parse({ ...valid, name: "" })).toThrow()
  })

  it("rejects empty model", () => {
    expect(() => skillSchema.parse({ ...valid, model: "" })).toThrow()
  })
})

describe("memoryEntrySchema", () => {
  const valid = {
    id: UUID,
    userId: UUID2,
    key: "theme",
    value: "dark",
    createdAt: NOW,
    updatedAt: NOW,
  }

  it("parses valid entry", () => {
    const result = memoryEntrySchema.parse(valid)
    expect(result.key).toBe("theme")
    expect(result.value).toBe("dark")
  })

  it("rejects empty key", () => {
    expect(() => memoryEntrySchema.parse({ ...valid, key: "" })).toThrow()
  })
})

describe("healthResponseSchema", () => {
  it("parses ok status", () => {
    const valid = { status: "ok" as const, version: "1.0.0", timestamp: NOW }
    const result = healthResponseSchema.parse(valid)
    expect(result.status).toBe("ok")
    expect(result.version).toBe("1.0.0")
  })

  it("rejects invalid status", () => {
    expect(() =>
      healthResponseSchema.parse({
        status: "unknown",
        version: "1.0.0",
        timestamp: NOW,
      }),
    ).toThrow()
  })
})

// ─── Branded ID type safety ─────────────────────────────────────────

describe("branded ID schemas", () => {
  it("userIdSchema accepts valid UUID", () => {
    expect(userIdSchema.parse(UUID)).toBe(UUID as UserId)
  })

  it("userIdSchema accepts non-UUID Better Auth IDs", () => {
    expect(userIdSchema.parse("YAUT0yg4k651uTM0figQ2dBaBMyhRyEd")).toBe(
      "YAUT0yg4k651uTM0figQ2dBaBMyhRyEd" as UserId,
    )
  })

  it("conversationIdSchema accepts valid UUID", () => {
    expect(conversationIdSchema.parse(UUID)).toBe(UUID as ConversationId)
  })

  it("messageIdSchema accepts valid UUID", () => {
    expect(messageIdSchema.parse(UUID)).toBe(UUID as MessageId)
  })

  it("branded types are not assignable from plain string (compile-time)", () => {
    const parsed = userIdSchema.parse(UUID)
    const _typeCheck: string = parsed
    expect(_typeCheck).toBe(UUID)
  })
})

// ─── Error switch exhaustiveness ────────────────────────────────────

describe("YummyError exhaustiveness", () => {
  function getStatusCode(error: YummyError): number {
    switch (error.type) {
      case "VALIDATION_ERROR":
        return error.statusCode
      case "AUTH_ERROR":
        return error.statusCode
      case "NOT_FOUND_ERROR":
        return error.statusCode
      case "FORBIDDEN_ERROR":
        return error.statusCode
      case "RATE_LIMIT_ERROR":
        return error.statusCode
      case "INTERNAL_ERROR":
        return error.statusCode
      case "UNSUPPORTED_MEDIA_TYPE_ERROR":
        return error.statusCode
      default:
        return assertNever(error)
    }
  }

  it("handles ValidationError", () => {
    const err: YummyError = {
      type: "VALIDATION_ERROR",
      message: "bad input",
      statusCode: 400,
      fields: [{ field: "email", message: "invalid" }],
    }
    expect(getStatusCode(err)).toBe(400)
  })

  it("handles AuthError", () => {
    const err: YummyError = {
      type: "AUTH_ERROR",
      message: "unauthorized",
      statusCode: 401,
    }
    expect(getStatusCode(err)).toBe(401)
  })

  it("handles NotFoundError", () => {
    const err: YummyError = {
      type: "NOT_FOUND_ERROR",
      message: "not found",
      statusCode: 404,
      resource: "conversation",
    }
    expect(getStatusCode(err)).toBe(404)
  })

  it("handles ForbiddenError", () => {
    const err: YummyError = {
      type: "FORBIDDEN_ERROR",
      message: "forbidden",
      statusCode: 403,
    }
    expect(getStatusCode(err)).toBe(403)
  })

  it("handles RateLimitError", () => {
    const err: YummyError = {
      type: "RATE_LIMIT_ERROR",
      message: "rate limited",
      statusCode: 429,
      retryAfter: 60,
    }
    expect(getStatusCode(err)).toBe(429)
  })

  it("handles InternalError", () => {
    const err: YummyError = {
      type: "INTERNAL_ERROR",
      message: "server error",
      statusCode: 500,
    }
    expect(getStatusCode(err)).toBe(500)
  })

  it("handles UnsupportedMediaTypeError", () => {
    const err: YummyError = {
      type: "UNSUPPORTED_MEDIA_TYPE_ERROR",
      message: "unsupported",
      statusCode: 415,
      acceptedTypes: ["application/json"],
    }
    expect(getStatusCode(err)).toBe(415)
  })
})

// ─── Route prefix consistency ───────────────────────────────────────

describe("API_V1 routes", () => {
  const entries = Object.entries(API_V1) as ReadonlyArray<readonly [string, string]>

  it("all routes start with /api/v1/", () => {
    for (const [, path] of entries) {
      expect(path.startsWith("/api/v1/")).toBe(true)
    }
  })

  it("has expected route keys", () => {
    const keys = entries.map(([k]) => k).sort()
    expect(keys).toEqual(["AUTH", "CHAT", "CONVERSATIONS", "FILES", "HEALTH", "MEMORY", "SKILLS"])
  })

  it("route values match expected paths", () => {
    expect(API_V1.AUTH).toBe("/api/v1/auth")
    expect(API_V1.CHAT).toBe("/api/v1/chat")
    expect(API_V1.CONVERSATIONS).toBe("/api/v1/conversations")
    expect(API_V1.SKILLS).toBe("/api/v1/skills")
    expect(API_V1.MEMORY).toBe("/api/v1/memory")
    expect(API_V1.HEALTH).toBe("/api/v1/health")
    expect(API_V1.FILES).toBe("/api/v1/files")
  })
})

// ─── ChatMessage type-level test ────────────────────────────────────

describe("ChatMessage type", () => {
  it("valid message satisfies ChatMessage type", () => {
    const validMsg = {
      id: UUID as MessageId,
      conversationId: UUID2 as ConversationId,
      role: "user" as const,
      content: "Hello",
      createdAt: NOW,
      updatedAt: NOW,
    } satisfies ChatMessage

    const result = chatMessageSchema.parse(validMsg)
    expect(result.content).toBe("Hello")
  })
})

// ─── Zod schema type inference ──────────────────────────────────────

describe("schema type inference", () => {
  it("sendMessageInputSchema infers correct types", () => {
    type Input = z.infer<typeof sendMessageInputSchema>
    const input: Input = {
      content: "test",
      model: "gpt-4",
      sessionId: UUID as Input["sessionId"],
    }
    expect(input.content).toBe("test")
  })
})
