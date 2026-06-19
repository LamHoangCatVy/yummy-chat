import { describe, expect, it } from "bun:test"

// Set test env vars BEFORE app module loads (env.ts lazy getters and @yummy/db read at import time)
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/yummy_chat_test"
process.env.BETTER_AUTH_SECRET = "test-secret-for-health-tests-only-but-still-long-enough"
process.env.BETTER_AUTH_URL = "http://localhost:3000"

// Dynamic import: ensures @yummy/db singleton reads the env vars above before connecting
const { createApp } = await import("./app")

describe("health endpoint", () => {
  it("returns 200 with correct response shape", async () => {
    const app = createApp()
    const res = await app.request("/api/v1/health")

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        version: expect.any(String),
        timestamp: expect.any(String),
      },
      meta: {
        timestamp: expect.any(String),
        requestId: expect.any(String),
      },
    })
  })

  it("returns X-Request-Id response header", async () => {
    const app = createApp()
    const res = await app.request("/api/v1/health")

    const requestId = res.headers.get("x-request-id")
    expect(requestId).toBeTruthy()
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it("echoes back a client-provided X-Request-Id", async () => {
    const app = createApp()
    const res = await app.request("/api/v1/health", {
      headers: { "X-Request-Id": "test-request-id-12345" },
    })

    expect(res.headers.get("x-request-id")).toBe("test-request-id-12345")

    const body = await res.json()
    expect(body.meta.requestId).toBe("test-request-id-12345")
  })

  it("includes timestamp in ISO 8601 format", async () => {
    const app = createApp()
    const res = await app.request("/api/v1/health")
    const body = await res.json()

    const timestamp = new Date(body.data.timestamp)
    expect(timestamp.toISOString()).toBe(body.data.timestamp)
  })
})

describe("error handler", () => {
  it("returns 404 with ApiErrorResponse envelope for unknown routes", async () => {
    const app = createApp()
    const res = await app.request("/api/v1/nonexistent")

    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body).toMatchObject({
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        statusCode: 404,
      },
      meta: {
        timestamp: expect.any(String),
        requestId: expect.any(String),
      },
    })
  })

  it("includes X-Request-Id in 404 responses", async () => {
    const app = createApp()
    const res = await app.request("/api/v1/nonexistent")

    expect(res.headers.get("x-request-id")).toBeTruthy()
  })
})

describe("security headers", () => {
  it("includes X-Content-Type-Options header", async () => {
    const app = createApp()
    const res = await app.request("/api/v1/health")

    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  })
})
