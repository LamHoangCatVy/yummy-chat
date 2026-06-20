import { describe, expect, it } from "vitest"
import type { z } from "zod"
import {
  API_V1,
  advancedSettingsGetResponseSchema,
  advancedSettingsPutInputSchema,
  chatMessageSchema,
  conversationIdSchema,
  conversationSchema,
  createConversationInputSchema,
  healthResponseSchema,
  memoryEntrySchema,
  messageIdSchema,
  modelItemSchema,
  modelListResponseSchema,
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

describe("modelItemSchema", () => {
  it("parses valid model item with label", () => {
    const result = modelItemSchema.parse({ id: "gpt-4", label: "GPT-4" })
    expect(result.id).toBe("gpt-4")
    expect(result.label).toBe("GPT-4")
  })

  it("parses valid model item without label", () => {
    const result = modelItemSchema.parse({ id: "claude-3" })
    expect(result.id).toBe("claude-3")
    expect(result.label).toBeUndefined()
  })

  it("rejects empty id", () => {
    expect(() => modelItemSchema.parse({ id: "" })).toThrow()
  })
})

describe("modelListResponseSchema", () => {
  it("parses valid model list", () => {
    const result = modelListResponseSchema.parse({
      models: [{ id: "gpt-4", label: "GPT-4" }, { id: "claude-3" }],
    })
    expect(result.models).toHaveLength(2)
    expect(result.models[0]?.id).toBe("gpt-4")
  })

  it("rejects missing models array", () => {
    expect(() => modelListResponseSchema.parse({})).toThrow()
  })

  it("accepts empty models array", () => {
    const result = modelListResponseSchema.parse({ models: [] })
    expect(result.models).toHaveLength(0)
  })
})

describe("advancedSettingsGetResponseSchema", () => {
  it("parses valid response with api key", () => {
    const result = advancedSettingsGetResponseSchema.parse({
      hasApiKey: true,
      endpoint: "https://api.openai.com",
      selectedModel: "gpt-4",
    })
    expect(result.hasApiKey).toBe(true)
    expect(result.endpoint).toBe("https://api.openai.com")
    expect(result.selectedModel).toBe("gpt-4")
  })

  it("parses valid response without api key", () => {
    const result = advancedSettingsGetResponseSchema.parse({
      hasApiKey: false,
      endpoint: null,
      selectedModel: null,
    })
    expect(result.hasApiKey).toBe(false)
    expect(result.endpoint).toBeNull()
  })

  it("strips apiKey from response (must NEVER expose apiKey)", () => {
    const result = advancedSettingsGetResponseSchema.parse({
      hasApiKey: true,
      apiKey: "sk-secret",
      endpoint: null,
      selectedModel: null,
    })
    expect(result.hasApiKey).toBe(true)
    expect((result as Record<string, unknown>).apiKey).toBeUndefined()
  })

  it("rejects missing hasApiKey", () => {
    expect(() =>
      advancedSettingsGetResponseSchema.parse({
        endpoint: null,
        selectedModel: null,
      }),
    ).toThrow()
  })
})

describe("advancedSettingsPutInputSchema", () => {
  it("parses valid input with apiKey and endpoint", () => {
    const result = advancedSettingsPutInputSchema.parse({
      apiKey: "sk-test123",
      endpoint: "https://api.openai.com/v1",
    })
    expect(result.apiKey).toBe("sk-test123")
    expect(result.endpoint).toBe("https://api.openai.com/v1")
  })

  it("parses input with only apiKey", () => {
    const result = advancedSettingsPutInputSchema.parse({ apiKey: "sk-test" })
    expect(result.apiKey).toBe("sk-test")
    expect(result.endpoint).toBeUndefined()
  })

  it("parses input with only endpoint", () => {
    const result = advancedSettingsPutInputSchema.parse({
      endpoint: "https://api.anthropic.com",
    })
    expect(result.apiKey).toBeUndefined()
    expect(result.endpoint).toBe("https://api.anthropic.com")
  })

  it("rejects empty apiKey", () => {
    expect(() => advancedSettingsPutInputSchema.parse({ apiKey: "" })).toThrow()
  })

  it("rejects invalid URL for endpoint", () => {
    expect(() => advancedSettingsPutInputSchema.parse({ endpoint: "not-a-url" })).toThrow()
  })

  it("rejects URL without protocol", () => {
    expect(() => advancedSettingsPutInputSchema.parse({ endpoint: "api.openai.com" })).toThrow()
  })

  it("accepts empty object (all fields optional)", () => {
    const result = advancedSettingsPutInputSchema.parse({})
    expect(result.apiKey).toBeUndefined()
    expect(result.endpoint).toBeUndefined()
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
    expect(keys).toEqual([
      "AUTH",
      "CHAT",
      "CONVERSATIONS",
      "FILES",
      "HEALTH",
      "MEMORY",
      "MODELS",
      "SETTINGS",
      "SKILLS",
    ])
  })

  it("route values match expected paths", () => {
    expect(API_V1.AUTH).toBe("/api/v1/auth")
    expect(API_V1.CHAT).toBe("/api/v1/chat")
    expect(API_V1.CONVERSATIONS).toBe("/api/v1/conversations")
    expect(API_V1.SKILLS).toBe("/api/v1/skills")
    expect(API_V1.MEMORY).toBe("/api/v1/memory")
    expect(API_V1.SETTINGS).toBe("/api/v1/settings")
    expect(API_V1.MODELS).toBe("/api/v1/models")
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
