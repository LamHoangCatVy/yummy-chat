import {
  advancedSettingsGetResponseSchema,
  advancedSettingsPutInputSchema,
  chatMessageSchema,
  conversationListResponseSchema,
  conversationSchema,
  createConversationInputSchema,
  healthResponseSchema,
  memoryListResponseSchema,
  modelListResponseSchema,
  fileAttachmentSchema,
  pptxSlideSchema,
  pptxJsonDataSchema,
  PPTX_MIME_TYPE,
  GENERATED_FILE_MAX_BYTES,
  PPTX_LIMITS,
  sendMessageInputSchema,
  sendMessageResponseSchema,
  skillListResponseSchema,
} from "@yummy/shared"
import type {
  ApiErrorResponse,
  AuthError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "@yummy/shared"
import { describe, expect, test } from "vitest"
import {
  ApiError,
  checkHealth,
  fetchModels,
  getAdvancedSettings,
  updateAdvancedSettings,
} from "../src/lib/api"

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

  test("conversationListResponseSchema parses valid list without cursor", () => {
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
      nextCursor: null,
    }
    const result = conversationListResponseSchema.parse(raw)
    expect(result.conversations).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  test("conversationListResponseSchema parses list with pagination cursor", () => {
    const raw = {
      conversations: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          userId: "550e8400-e29b-41d4-a716-446655440001",
          title: "Chat 1",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:01:00.000Z",
        },
      ],
      nextCursor: "550e8400-e29b-41d4-a716-446655440002",
    }
    const result = conversationListResponseSchema.parse(raw)
    expect(result.conversations).toHaveLength(1)
    expect(result.nextCursor).toBe("550e8400-e29b-41d4-a716-446655440002")
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
    expect(result.skills[0]?.name).toBe("weather")
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
    expect(result.entries[0]?.key).toBe("preference")
  })

  test("advancedSettingsGetResponseSchema parses configured state", () => {
    const raw = {
      hasApiKey: true,
      endpoint: "https://api.openai.com/v1",
      selectedModel: "gpt-4o-mini",
    }
    const result = advancedSettingsGetResponseSchema.parse(raw)
    expect(result.hasApiKey).toBe(true)
    expect(result.endpoint).toBe("https://api.openai.com/v1")
    expect(result.selectedModel).toBe("gpt-4o-mini")
  })

  test("advancedSettingsPutInputSchema parses endpoint update", () => {
    const result = advancedSettingsPutInputSchema.parse({
      apiKey: "sk-test",
      endpoint: "https://api.openai.com/v1",
    })
    expect(result.apiKey).toBe("sk-test")
    expect(result.endpoint).toBe("https://api.openai.com/v1")
  })

  test("modelListResponseSchema parses model list", () => {
    const result = modelListResponseSchema.parse({
      models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
    })
    expect(result.models[0]?.id).toBe("gpt-4o-mini")
    expect(result.models[0]?.label).toBe("GPT-4o mini")
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
    expect(typed.fields[0]?.field).toBe("title")
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
      throw new Error("Expected ApiError to be thrown")
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

  test("getAdvancedSettings fetches the advanced settings endpoint", async () => {
    const originalFetch = globalThis.fetch
    let requestedPath = ""
    let requestedInit: RequestInit | undefined

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedPath = String(input)
      requestedInit = init
      return new Response(
        JSON.stringify({
          success: true,
          data: { hasApiKey: true, endpoint: "https://api.openai.com/v1", selectedModel: null },
          meta: { timestamp: "2025-01-01T00:00:00.000Z", requestId: "req-settings" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const result = await getAdvancedSettings()
      expect(requestedPath).toBe("/api/v1/settings/advanced")
      expect(requestedInit?.method).toBeUndefined()
      expect(result.hasApiKey).toBe(true)
      expect(result.endpoint).toBe("https://api.openai.com/v1")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("updateAdvancedSettings PUTs the advanced settings endpoint", async () => {
    const originalFetch = globalThis.fetch
    let requestedPath = ""
    let requestedInit: RequestInit | undefined

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedPath = String(input)
      requestedInit = init
      return new Response(
        JSON.stringify({
          success: true,
          data: { hasApiKey: true, endpoint: "https://api.openai.com/v1", selectedModel: null },
          meta: { timestamp: "2025-01-01T00:00:00.000Z", requestId: "req-update" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const result = await updateAdvancedSettings({
        apiKey: "sk-test",
        endpoint: "https://api.openai.com/v1",
      })
      expect(requestedPath).toBe("/api/v1/settings/advanced")
      expect(requestedInit?.method).toBe("PUT")
      expect(JSON.parse(String(requestedInit?.body))).toEqual({
        apiKey: "sk-test",
        endpoint: "https://api.openai.com/v1",
      })
      expect(result.hasApiKey).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("fetchModels fetches the models endpoint", async () => {
    const originalFetch = globalThis.fetch
    let requestedPath = ""

    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedPath = String(input)
      return new Response(
        JSON.stringify({
          success: true,
          data: { models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }] },
          meta: { timestamp: "2025-01-01T00:00:00.000Z", requestId: "req-models" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const result = await fetchModels()
      expect(requestedPath).toBe("/api/v1/models")
      expect(result.models[0]?.id).toBe("gpt-4o-mini")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("updateAdvancedSettings propagates ApiError on failed response", async () => {
    const originalFetch = globalThis.fetch
    const errorBody: ApiErrorResponse = {
      success: false,
      error: {
        type: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        fields: [{ field: "endpoint", message: "Invalid URL" }],
      },
      meta: { timestamp: "2025-01-01T00:00:00.000Z", requestId: "req-invalid" },
    }

    globalThis.fetch = (async () =>
      new Response(JSON.stringify(errorBody), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch

    try {
      await updateAdvancedSettings({ endpoint: "https://api.openai.com/v1" })
      throw new Error("Expected ApiError to be thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      if (err instanceof ApiError) {
        expect(err.statusCode).toBe(422)
        expect(err.errorResponse.error.type).toBe("VALIDATION_ERROR")
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

// ---------------------------------------------------------------------------
// 4. PPTX / File-generation contract schemas
// ---------------------------------------------------------------------------
describe("Contract: PPTX schemas", () => {
  test("fileAttachmentSchema parses valid attachment", () => {
    const raw = {
      filename: "report.pptx",
      downloadUrl: "https://cdn.example.com/r.pptx",
      mimeType: PPTX_MIME_TYPE,
    }
    const result = fileAttachmentSchema.parse(raw)
    expect(result.filename).toBe("report.pptx")
    expect(result.mimeType).toBe(PPTX_MIME_TYPE)
  })

  test("fileAttachmentSchema rejects empty filename", () => {
    expect(() =>
      fileAttachmentSchema.parse({
        filename: "",
        downloadUrl: "https://cdn.example.com/r.pptx",
        mimeType: PPTX_MIME_TYPE,
      }),
    ).toThrow()
  })

  test("fileAttachmentSchema rejects missing downloadUrl", () => {
    expect(() =>
      fileAttachmentSchema.parse({ filename: "r.pptx", mimeType: PPTX_MIME_TYPE }),
    ).toThrow()
  })

  test("pptxSlideSchema parses valid slide", () => {
    const raw = { title: "Introduction", bullets: ["Point one", "Point two"] }
    const result = pptxSlideSchema.parse(raw)
    expect(result.title).toBe("Introduction")
    expect(result.bullets).toHaveLength(2)
  })

  test("pptxSlideSchema rejects empty title", () => {
    expect(() => pptxSlideSchema.parse({ title: "", bullets: ["Point"] })).toThrow()
  })

  test("pptxSlideSchema rejects empty bullets array", () => {
    expect(() => pptxSlideSchema.parse({ title: "Title", bullets: [] })).toThrow()
  })

  test("pptxSlideSchema rejects long title (>100 chars)", () => {
    expect(() => pptxSlideSchema.parse({ title: "x".repeat(101), bullets: ["Point"] })).toThrow()
  })

  test("pptxSlideSchema rejects bullet >180 chars", () => {
    expect(() => pptxSlideSchema.parse({ title: "Title", bullets: ["x".repeat(181)] })).toThrow()
  })

  test("pptxSlideSchema rejects more than 8 bullets", () => {
    expect(() =>
      pptxSlideSchema.parse({
        title: "Title",
        bullets: Array.from({ length: 9 }, (_, i) => `Bullet ${i + 1}`),
      }),
    ).toThrow()
  })

  test("pptxSlideSchema rejects unknown properties (strict mode)", () => {
    expect(() =>
      pptxSlideSchema.parse({ title: "Title", bullets: ["Point"], images: ["img.jpg"] }),
    ).toThrow()
  })

  test("pptxJsonDataSchema parses valid data with closing", () => {
    const raw = {
      title: "Deck Title",
      slides: [{ title: "Slide 1", bullets: ["Bullet A", "Bullet B"] }],
      closing: "Thank you!",
    }
    const result = pptxJsonDataSchema.parse(raw)
    expect(result.title).toBe("Deck Title")
    expect(result.slides).toHaveLength(1)
    expect(result.closing).toBe("Thank you!")
  })

  test("pptxJsonDataSchema parses valid data without closing", () => {
    const raw = {
      title: "Deck Title",
      slides: [{ title: "Slide 1", bullets: ["Bullet A"] }],
    }
    const result = pptxJsonDataSchema.parse(raw)
    expect(result.title).toBe("Deck Title")
    expect(result.closing).toBeUndefined()
  })

  test("pptxJsonDataSchema rejects more than 8 content slides", () => {
    const slides = Array.from({ length: 9 }, (_, i) => ({
      title: `Slide ${i + 1}`,
      bullets: ["Content"],
    }))
    expect(() => pptxJsonDataSchema.parse({ title: "Deck Title", slides })).toThrow()
  })

  test("pptxJsonDataSchema rejects empty slides array", () => {
    expect(() => pptxJsonDataSchema.parse({ title: "Deck Title", slides: [] })).toThrow()
  })

  test("pptxJsonDataSchema rejects missing title", () => {
    const raw = { slides: [{ title: "Slide 1", bullets: ["Bullet"] }] }
    expect(() => pptxJsonDataSchema.parse(raw)).toThrow()
  })

  test("pptxJsonDataSchema rejects deck title >120 chars", () => {
    const raw = { title: "x".repeat(121), slides: [{ title: "S1", bullets: ["B"] }] }
    expect(() => pptxJsonDataSchema.parse(raw)).toThrow()
  })

  test("pptxJsonDataSchema rejects closing >240 chars", () => {
    const raw = {
      title: "Deck",
      slides: [{ title: "S1", bullets: ["B"] }],
      closing: "x".repeat(241),
    }
    expect(() => pptxJsonDataSchema.parse(raw)).toThrow()
  })

  test("pptxJsonDataSchema rejects unknown properties (strict mode)", () => {
    const raw = {
      title: "Deck",
      slides: [{ title: "S1", bullets: ["B"] }],
      theme: "dark",
    }
    expect(() => pptxJsonDataSchema.parse(raw)).toThrow()
  })

  test("PPTX_MIME_TYPE constant is correct", () => {
    expect(PPTX_MIME_TYPE).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
  })

  test("GENERATED_FILE_MAX_BYTES constant is 10MB", () => {
    expect(GENERATED_FILE_MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  test("PPTX_LIMITS constant defines correct limits", () => {
    expect(PPTX_LIMITS.maxSlides).toBe(10)
    expect(PPTX_LIMITS.maxContentSlides).toBe(8)
    expect(PPTX_LIMITS.maxBulletsPerSlide).toBe(8)
    expect(PPTX_LIMITS.maxBulletChars).toBe(180)
    expect(PPTX_LIMITS.maxDeckTitleChars).toBe(120)
    expect(PPTX_LIMITS.maxSlideTitleChars).toBe(100)
  })
})
