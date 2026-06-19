import { describe, test, expect } from "bun:test"
import {
  healthResponseSchema,
  conversationSchema,
  conversationListResponseSchema,
  sendMessageResponseSchema,
  sendMessageInputSchema,
  createConversationInputSchema,
  skillListResponseSchema,
  memoryListResponseSchema,
  chatMessageSchema,
} from "@yummy/shared"
import type {
  ApiErrorResponse,
  ValidationError,
  AuthError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  InternalError,
  UnsupportedMediaTypeError,
} from "@yummy/shared"
import { ApiError, checkHealth } from "../src/lib/api"

// ---------------------------------------------------------------------------
// 1. Schema conformance – shared Zod schemas accept BE response shapes
// ---------------------------------------------------------------------------
describe("Contract: Shared Zod schemas accept BE response shapes", () => {
  test("healthResponseSchema parses valid health-check data", () => {
    const raw = { status: "ok", version: "0.1.0", timestamp: "2025-01-01T00:00:00.000Z" }
    const result = healthResponseSchema.parse(raw)
    expect(result.status).toBe("ok")
    expect(result.version).toBe("0.1.0")
  })

  test("healthResponseSchema rejects invalid status value", () => {
    const raw = { status: "unknown", version: "0.1.0", timestamp: "2025-01-01T00:00:00.000Z" }
    expect(() => healthResponseSchema.parse(raw)).toThrow()
  })

  test("healthResponseSchema rejects non-datetime timestamp", () => {
    const raw = { status: "ok", version: "0.1.0", timestamp: "not-a-date" }
    expect(() => healthResponseSchema.parse(raw)).toThrow()
  })

  test("conversationSchema parses valid conversation", () => {
    const raw = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      title: "Test Chat",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:01:00.000Z",
    }
    const result = conversationSchema.parse(raw)
    expect(result.title).toBe("Test Chat")
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000")
  })

  test("conversationSchema rejects non-uuid id", () => {
    const raw = {
      id: "not-a-uuid",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      title: "Test",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:01:00.000Z",
    }
    expect(() => conversationSchema.parse(raw)).toThrow()
  })

  test("conversationSchema rejects empty title", () => {
    const raw = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      title: "",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:01:00.000Z",
    }
    expect(() => conversationSchema.parse(raw)).toThrow()
  })

  test("conversationListResponseSchema parses valid list", () => {
    const raw = {
      conversations: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          userId: "550e8400-e29b-41d4-a716-446655440001",
          title: "Chat 1",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:01:00.000Z",
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          userId: "550e8400-e29b-41d4-a716-446655440001",
          title: "Chat 2",
          createdAt: "2025-01-02T00:00:00.000Z",
          updatedAt: "2025-01-02T00:01:00.000Z",
        },
      ],
      total: 2,
    }
    const result = conversationListResponseSchema.parse(raw)
    expect(result.conversations).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  test("conversationListResponseSchema rejects negative total", () => {
    const raw = { conversations: [], total: -1 }
    expect(() => conversationListResponseSchema.parse(raw)).toThrow()
  })

  test("sendMessageInputSchema parses valid input", () => {
    const raw = {
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      content: "Hello world",
      model: "gpt-4",
      sessionId: "550e8400-e29b-41d4-a716-4466554400ff",
    }
    const result = sendMessageInputSchema.parse(raw)
    expect(result.content).toBe("Hello world")
  })

  test("sendMessageInputSchema works without optional conversationId", () => {
    const raw = {
      content: "Hello world",
      model: "gpt-4",
      sessionId: "550e8400-e29b-41d4-a716-4466554400ff",
    }
    const result = sendMessageInputSchema.parse(raw)
    expect(result.content).toBe("Hello world")
    expect(result.conversationId).toBeUndefined()
  })

  test("sendMessageResponseSchema parses valid response", () => {
    const raw = {
      messageId: "550e8400-e29b-41d4-a716-446655440000",
      conversationId: "550e8400-e29b-41d4-a716-446655440001",
      content: "Hi there!",
    }
    const result = sendMessageResponseSchema.parse(raw)
    expect(result.messageId).toBe("550e8400-e29b-41d4-a716-446655440000")
    expect(result.content).toBe("Hi there!")
  })

  test("createConversationInputSchema parses valid input", () => {
    const raw = { title: "New Chat" }
    const result = createConversationInputSchema.parse(raw)
    expect(result.title).toBe("New Chat")
  })

  test("createConversationInputSchema rejects empty title", () => {
    expect(() => createConversationInputSchema.parse({ title: "" })).toThrow()
  })

  test("skillListResponseSchema parses valid list", () => {
    const raw = {
      skills: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          ownerId: "550e8400-e29b-41d4-a716-446655440001",
          name: "weather",
          prompt: "You are a weather assistant.",
          model: "gpt-4o-mini",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:01:00.000Z",
        },
      ],
    }
    const result = skillListResponseSchema.parse(raw)
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe("weather")
  })

  test("memoryListResponseSchema parses valid entries", () => {
    const raw = {
      entries: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          userId: "550e8400-e29b-41d4-a716-446655440001",
          key: "preference",
          value: "dark mode",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:01:00.000Z",
        },
      ],
    }
    const result = memoryListResponseSchema.parse(raw)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.key).toBe("preference")
  })

  test("chatMessageSchema parses valid message with optional fields", () => {
    const raw = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      conversationId: "550e8400-e29b-41d4-a716-446655440001",
      role: "assistant",
      content: "Hello!",
      parentId: "550e8400-e29b-41d4-a716-446655440002",
      metadata: { tokens: 42 },
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:01:00.000Z",
    }
    const result = chatMessageSchema.parse(raw)
    expect(result.role).toBe("assistant")
    expect(result.parentId).toBe("550e8400-e29b-41d4-a716-446655440002")
    expect(result.metadata).toEqual({ tokens: 42 })
  })

  test("chatMessageSchema rejects invalid role", () => {
    const raw = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      conversationId: "550e8400-e29b-41d4-a716-446655440001",
      role: "admin",
      content: "Hello!",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:01:00.000Z",
    }
    expect(() => chatMessageSchema.parse(raw)).toThrow()
  })

  test("chatMessageSchema works without optional fields", () => {
    const raw = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      conversationId: "550e8400-e29b-41d4-a716-446655440001",
      role: "user",
      content: "Hi",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:01:00.000Z",
    }
    const result = chatMessageSchema.parse(raw)
    expect(result.parentId).toBeUndefined()
    expect(result.metadata).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Error envelope – ApiErrorResponse shape consistency
// ---------------------------------------------------------------------------
describe("Contract: Error envelope shape consistency", () => {
  const meta = { timestamp: "2025-01-01T00:00:00.000Z", requestId: "req-abc-123" }

  test("NOT_FOUND_ERROR envelope", () => {
    const error: NotFoundError = {
      type: "NOT_FOUND_ERROR",
      message: "Route GET /api/v1/nonexistent not found",
      statusCode: 404,
      resource: "/api/v1/nonexistent",
    }
    const envelope: ApiErrorResponse = { success: false, error, meta }
    expect(envelope.success).toBe(false)
    expect(envelope.error.type).toBe("NOT_FOUND_ERROR")
    expect(envelope.error.statusCode).toBe(404)
    expect("resource" in envelope.error).toBe(true)
    expect((envelope.error as NotFoundError).resource).toBe("/api/v1/nonexistent")
  })

  test("AUTH_ERROR envelope", () => {
    const error: AuthError = {
      type: "AUTH_ERROR",
      message: "Invalid credentials",
      statusCode: 401,
    }
    const envelope: ApiErrorResponse = { success: false, error, meta }
    expect(envelope.success).toBe(false)
    expect(envelope.error.type).toBe("AUTH_ERROR")
    expect(envelope.error.statusCode).toBe(401)
  })

  test("VALIDATION_ERROR envelope includes fields", () => {
    const error: ValidationError = {
      type: "VALIDATION_ERROR",
      message: "Validation failed",
      statusCode: 400,
      fields: [
        { field: "title", message: "Title is required" },
        { field: "content", message: "Content too long" },
      ],
    }
    const envelope: ApiErrorResponse = { success: false, error, meta }
    expect(envelope.error.statusCode).toBe(400)
    expect("fields" in envelope.error).toBe(true)
    const typed = envelope.error as ValidationError
    expect(typed.fields).toHaveLength(2)
    expect(typed.fields[0]!.field).toBe("title")
  })

  test("FORBIDDEN_ERROR envelope", () => {
    const error: ForbiddenError = {
      type: "FORBIDDEN_ERROR",
      message: "Access denied",
      statusCode: 403,
    }
    const envelope: ApiErrorResponse = { success: false, error, meta }
    expect(envelope.error.statusCode).toBe(403)
  })

  test("RATE_LIMIT_ERROR envelope includes retryAfter", () => {
    const error: RateLimitError = {
      type: "RATE_LIMIT_ERROR",
      message: "Too many requests",
      statusCode: 429,
      retryAfter: 60,
    }
    const envelope: ApiErrorResponse = { success: false, error, meta }
    expect(envelope.error.statusCode).toBe(429)
    expect("retryAfter" in envelope.error).toBe(true)
    expect((envelope.error as RateLimitError).retryAfter).toBe(60)
  })

  test("INTERNAL_ERROR envelope", () => {
    const error: InternalError = {
      type: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      statusCode: 500,
    }
    const envelope: ApiErrorResponse = { success: false, error, meta }
    expect(envelope.error.statusCode).toBe(500)
  })

  test("UNSUPPORTED_MEDIA_TYPE_ERROR envelope includes acceptedTypes", () => {
    const error: UnsupportedMediaTypeError = {
      type: "UNSUPPORTED_MEDIA_TYPE_ERROR",
      message: "Unsupported media type",
      statusCode: 415,
      acceptedTypes: ["application/json"],
    }
    const envelope: ApiErrorResponse = { success: false, error, meta }
    expect(envelope.error.statusCode).toBe(415)
    expect((envelope.error as UnsupportedMediaTypeError).acceptedTypes).toEqual([
      "application/json",
    ])
  })

  test("every error envelope carries consistent meta shape", () => {
    const errors: Array<{ type: string; statusCode: number }> = [
      { type: "VALIDATION_ERROR", statusCode: 400 },
      { type: "AUTH_ERROR", statusCode: 401 },
      { type: "FORBIDDEN_ERROR", statusCode: 403 },
      { type: "NOT_FOUND_ERROR", statusCode: 404 },
      { type: "RATE_LIMIT_ERROR", statusCode: 429 },
      { type: "INTERNAL_ERROR", statusCode: 500 },
      { type: "UNSUPPORTED_MEDIA_TYPE_ERROR", statusCode: 415 },
    ]
    for (const err of errors) {
      const envelope: ApiErrorResponse = {
        success: false,
        error: { ...err, message: "test" } as ApiErrorResponse["error"],
        meta,
      }
      expect(envelope.success).toBe(false)
      expect(envelope.meta.timestamp).toBeTruthy()
      expect(envelope.meta.requestId).toBeTruthy()
      expect(envelope.error.type).toBe(err.type)
      expect(envelope.error.statusCode).toBe(err.statusCode)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. FE client – fetchApi integration (mocked fetch)
// ---------------------------------------------------------------------------
describe("Contract: FE client error handling", () => {
  test("ApiError constructs with correct properties", () => {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: { type: "NOT_FOUND_ERROR", message: "Not found", statusCode: 404, resource: "/test" },
      meta: { timestamp: "2025-01-01T00:00:00.000Z", requestId: "req-1" },
    }
    const err = new ApiError(404, errorResponse)
    expect(err.statusCode).toBe(404)
    expect(err.errorResponse).toBe(errorResponse)
    expect(err.message).toBe("Not found")
    expect(err.name).toBe("ApiError")
  })

  test("ApiError propagates through fetchApi on non-2xx", async () => {
    const errorBody: ApiErrorResponse = {
      success: false,
      error: { type: "AUTH_ERROR", message: "Unauthorized", statusCode: 401 },
      meta: { timestamp: "2025-01-01T00:00:00.000Z", requestId: "req-2" },
    }

    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify(errorBody), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })

    try {
      await checkHealth()
      expect.fail("Expected ApiError to be thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      if (err instanceof ApiError) {
        expect(err.statusCode).toBe(401)
        expect(err.errorResponse.error.type).toBe("AUTH_ERROR")
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("non-JSON error response throws (any error)", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response("<html>error</html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      })

    await expect(checkHealth()).rejects.toThrow()
    globalThis.fetch = originalFetch
  })
})
