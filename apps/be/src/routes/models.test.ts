import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-models-tests"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.USER_API_KEY_ENCRYPTION_SECRET = "test-encryption-secret-32bytes!!"
process.env.APP_ENV = "test"

const { createApp } = await import("../app")

function extractCookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
}

async function signUpAndSignIn(
  app: ReturnType<typeof createApp>,
  user: { name: string; email: string; password: string },
): Promise<string> {
  await app.request("/api/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  })
  const signInRes = await app.request("/api/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  })
  return extractCookies(signInRes)
}

const MODELS_URL = "/api/v1/models"
const SETTINGS_URL = "/api/v1/settings/advanced"

describe("models API", () => {
  const userA = { name: "User A", email: "models-a@test.com", password: "password123" }
  const userB = { name: "User B", email: "models-b@test.com", password: "password123" }

  let cookiesA: string
  let cookiesB: string

  const originalFetch = globalThis.fetch

  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()
    cookiesA = await signUpAndSignIn(app, userA)
    cookiesB = await signUpAndSignIn(app, userB)
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
  })

  describe("auth guard", () => {
    it("returns 401 on GET without session", async () => {
      const app = createApp()
      const res = await app.request(MODELS_URL)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.type).toBe("AUTH_ERROR")
    })
  })

  describe("GET /api/v1/models — no BYOK settings", () => {
    it("returns empty models list when no API key configured", async () => {
      const app = createApp()
      const res = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ models: [] })
    })
  })

  describe("GET /api/v1/models — valid BYOK settings", () => {
    it("returns models list from mocked provider", async () => {
      const mockModels = {
        data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }],
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockModels,
      })
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

      const app = createApp()

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-test-models-key",
          endpoint: "https://api.openai.com/v1",
        }),
      })

      const res = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.models).toEqual([
        { id: "gpt-4o", label: "gpt-4o" },
        { id: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
      ])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer "),
          }),
        }),
      )
    })
  })

  describe("GET /api/v1/models — caching", () => {
    it("serves cached data on second request within 60s", async () => {
      const freshUser = { name: "Cache User", email: "cache@test.com", password: "password123" }
      const app = createApp()
      const freshCookies = await signUpAndSignIn(app, freshUser)

      const mockModels = {
        data: [{ id: "gpt-4o" }],
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockModels,
      })
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({
          apiKey: "sk-cache-test-key",
          endpoint: "https://api.cached.com/v1",
        }),
      })

      const res1 = await app.request(MODELS_URL, {
        headers: { Cookie: freshCookies },
      })
      expect(res1.status).toBe(200)
      const body1 = await res1.json()
      expect(body1.data.models).toEqual([{ id: "gpt-4o", label: "gpt-4o" }])
      expect(mockFetch).toHaveBeenCalledTimes(2)

      const res2 = await app.request(MODELS_URL, {
        headers: { Cookie: freshCookies },
      })
      expect(res2.status).toBe(200)
      const body2 = await res2.json()
      expect(body2.data.models).toEqual([{ id: "gpt-4o", label: "gpt-4o" }])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe("cache invalidation on settings update", () => {
    it("clears cache after settings PUT, causing a new fetch on next GET", async () => {
      const freshUser = {
        name: "Invalidate User",
        email: "invalidate@test.com",
        password: "password123",
      }
      const app = createApp()
      const freshCookies = await signUpAndSignIn(app, freshUser)

      const mockModels1 = { data: [{ id: "gpt-4o" }] }
      const mockModels2 = { data: [{ id: "gpt-4o" }, { id: "claude-3" }] }

      let callCount = 0
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => (callCount <= 2 ? mockModels1 : mockModels2),
        })
      })
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({
          apiKey: "sk-invalidate-test",
          endpoint: "https://api.invalidate.com/v1",
        }),
      })

      const res1 = await app.request(MODELS_URL, {
        headers: { Cookie: freshCookies },
      })
      expect(res1.status).toBe(200)
      expect((await res1.json()).data.models).toEqual([{ id: "gpt-4o", label: "gpt-4o" }])
      expect(mockFetch).toHaveBeenCalledTimes(2)

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ apiKey: "sk-updated-key" }),
      })

      const res2 = await app.request(MODELS_URL, {
        headers: { Cookie: freshCookies },
      })
      expect(res2.status).toBe(200)
      expect((await res2.json()).data.models).toEqual([
        { id: "gpt-4o", label: "gpt-4o" },
        { id: "claude-3", label: "claude-3" },
      ])
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
  })

  describe("error handling", () => {
    it("returns safe error for unreachable endpoint — no URL leakage", async () => {
      const app = createApp()

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      }) as unknown as typeof globalThis.fetch

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-unreachable-test",
          endpoint: "https://192.0.2.1/v1",
        }),
      })

      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(
          new Error("fetch failed: connect EHOSTUNREACH"),
        ) as unknown as typeof globalThis.fetch

      const res = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.message).toBe("Could not reach endpoint")

      const responseStr = JSON.stringify(body)
      expect(responseStr).not.toContain("192.0.2.1")
      expect(responseStr).not.toContain("sk-unreachable-test")
      expect(responseStr).not.toContain("EHOSTUNREACH")
    })

    it("returns auth error for 401 from endpoint", async () => {
      const app = createApp()

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      }) as unknown as typeof globalThis.fetch

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-bad-key-test",
          endpoint: "https://api.example.com/v1",
        }),
      })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"error":"invalid_api_key"}',
      }) as unknown as typeof globalThis.fetch

      const res = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.type).toBe("AUTH_ERROR")
      expect(body.error.message).toBe("Invalid API key or endpoint")

      const responseStr = JSON.stringify(body)
      expect(responseStr).not.toContain("sk-bad-key-test")
      expect(responseStr).not.toContain("invalid_api_key")
    })

    it("returns safe error for 403 from endpoint", async () => {
      const app = createApp()

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      }) as unknown as typeof globalThis.fetch

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-forbidden-test",
          endpoint: "https://api.forbidden.com/v1",
        }),
      })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      }) as unknown as typeof globalThis.fetch

      const res = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.message).toBe("Invalid API key or endpoint")
    })

    it("does not leak apiKey or endpoint in error responses", async () => {
      const app = createApp()

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      }) as unknown as typeof globalThis.fetch

      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-secret-do-not-leak",
          endpoint: "https://secret-endpoint.internal/v1",
        }),
      })

      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error("TLS handshake timeout")) as unknown as typeof globalThis.fetch

      const res = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesA },
      })
      const body = await res.json()

      const responseStr = JSON.stringify(body)
      expect(responseStr).not.toContain("sk-secret-do-not-leak")
      expect(responseStr).not.toContain("secret-endpoint.internal")
      expect(responseStr).not.toContain("TLS handshake")
    })
  })

  describe("cross-user isolation", () => {
    it("user B sees own empty models (different cache entries)", async () => {
      const mockModels = { data: [{ id: "gpt-4o" }] }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockModels,
      })
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

      const app = createApp()

      // User A stores settings and fetches models
      await app.request(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-user-a-isolation",
          endpoint: "https://api.a.com/v1",
        }),
      })
      const resA = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesA },
      })
      expect(resA.status).toBe(200)
      expect((await resA.json()).data.models).toEqual([{ id: "gpt-4o", label: "gpt-4o" }])

      // User B has no settings → should see empty models
      const resB = await app.request(MODELS_URL, {
        headers: { Cookie: cookiesB },
      })
      expect(resB.status).toBe(200)
      expect((await resB.json()).data).toEqual({ models: [] })
    })
  })
})
