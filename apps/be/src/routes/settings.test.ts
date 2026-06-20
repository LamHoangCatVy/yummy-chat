import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-settings-tests"
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

const ADVANCED_URL = "/api/v1/settings/advanced"

describe("settings API", () => {
  let fetchStub: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()
    cookiesA = await signUpAndSignIn(app, userA)
    cookiesB = await signUpAndSignIn(app, userB)
  })

  beforeEach(() => {
    fetchStub = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  const userA = { name: "User A", email: "settings-a@test.com", password: "password123" }
  const userB = { name: "User B", email: "settings-b@test.com", password: "password123" }

  let cookiesA: string
  let cookiesB: string

  describe("auth guard", () => {
    it("returns 401 on GET without session", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.type).toBe("AUTH_ERROR")
    })

    it("returns 401 on PUT without session", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-test" }),
      })
      expect(res.status).toBe(401)
    })
  })

  describe("GET /api/v1/settings/advanced", () => {
    it("returns defaults when no settings exist (hasApiKey=false, endpoint=null, selectedModel=null)", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({
        hasApiKey: false,
        endpoint: null,
        selectedModel: null,
      })
    })

    it("does NOT include apiKey or encryptedApiKey in response", async () => {
      const app = createApp()
      // First store a key
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ apiKey: "sk-secret-key-12345" }),
      })

      const res = await app.request(ADVANCED_URL, {
        headers: { Cookie: cookiesA },
      })
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.hasApiKey).toBe(true)

      // Ensure no key material leaks
      const dataKeys = Object.keys(body.data)
      expect(dataKeys).not.toContain("apiKey")
      expect(dataKeys).not.toContain("encryptedApiKey")
      expect(dataKeys).not.toContain("iv")
      expect(dataKeys).not.toContain("tag")
      expect(dataKeys).not.toContain("decryptedApiKey")

      // Ensure no string value contains the original key
      const json = JSON.stringify(body.data)
      expect(json).not.toContain("sk-secret-key-12345")
    })
  })

  describe("PUT /api/v1/settings/advanced", () => {
    it("stores apiKey encrypted and returns hasApiKey=true", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ apiKey: "sk-my-openai-key", endpoint: "https://api.openai.com/v1" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.hasApiKey).toBe(true)
      expect(body.data.endpoint).toBe("https://api.openai.com/v1")

      // Verify GET reflects the stored values
      const getRes = await app.request(ADVANCED_URL, {
        headers: { Cookie: cookiesA },
      })
      const getBody = await getRes.json()
      expect(getBody.data.hasApiKey).toBe(true)
      expect(getBody.data.endpoint).toBe("https://api.openai.com/v1")
    })

    it("stores endpoint only (no apiKey)", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesB },
        body: JSON.stringify({ endpoint: "https://custom-llm.example.com/v1" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.hasApiKey).toBe(false)
      expect(body.data.endpoint).toBe("https://custom-llm.example.com/v1")
    })

    it("normalizes endpoint (trims whitespace, strips trailing slash)", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ endpoint: "  https://api.example.com/v1/  " }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.endpoint).toBe("https://api.example.com/v1")
    })

    it("rejects invalid endpoint URL with 400", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ endpoint: "not-a-url" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects invalid JSON body with 400", async () => {
      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: "not json",
      })
      expect(res.status).toBe(400)
    })

    it("round-trip: PUT apiKey then GET shows hasApiKey=true with no raw key", async () => {
      const app = createApp()

      // Store a key
      const putRes = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ apiKey: "sk-roundtrip-test-key" }),
      })
      expect(putRes.status).toBe(200)

      // Read back
      const getRes = await app.request(ADVANCED_URL, {
        headers: { Cookie: cookiesA },
      })
      const getBody = await getRes.json()
      expect(getBody.data.hasApiKey).toBe(true)

      // Key material must never appear in response
      const responseStr = JSON.stringify(getBody)
      expect(responseStr).not.toContain("sk-roundtrip-test-key")
    })
  })

  describe("cross-user isolation", () => {
    it("user B cannot read user A settings (sees own defaults)", async () => {
      const app = createApp()

      // User A stores settings
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ apiKey: "sk-user-a-key", endpoint: "https://user-a.example.com" }),
      })

      // User B reads — should see own defaults, not A's data
      const res = await app.request(ADVANCED_URL, {
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.hasApiKey).toBe(false)
      expect(body.data.endpoint).not.toBe("https://user-a.example.com")
    })

    it("user B cannot update user A settings", async () => {
      const app = createApp()

      // User A stores settings
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ apiKey: "sk-user-a-original" }),
      })

      // User B tries to update (but actually updates own settings since scoped)
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesB },
        body: JSON.stringify({ apiKey: "sk-user-b-key" }),
      })

      // User A settings should be unchanged
      const resA = await app.request(ADVANCED_URL, {
        headers: { Cookie: cookiesA },
      })
      const bodyA = await resA.json()
      expect(bodyA.data.hasApiKey).toBe(true)

      // User B settings should reflect B's update
      const resB = await app.request(ADVANCED_URL, {
        headers: { Cookie: cookiesB },
      })
      const bodyB = await resB.json()
      expect(bodyB.data.hasApiKey).toBe(true)
    })
  })

  describe("update preserves existing fields", () => {
    it("updating apiKey does not clear endpoint", async () => {
      const app = createApp()
      const freshCookies = await signUpAndSignIn(app, {
        name: "Partial Updater",
        email: "partial@test.com",
        password: "password123",
      })

      // Store both
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ apiKey: "sk-both", endpoint: "https://both.example.com" }),
      })

      // Update only apiKey
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ apiKey: "sk-updated-only" }),
      })

      // Endpoint should still be preserved
      const res = await app.request(ADVANCED_URL, {
        headers: { Cookie: freshCookies },
      })
      const body = await res.json()
      expect(body.data.hasApiKey).toBe(true)
      expect(body.data.endpoint).toBe("https://both.example.com")
    })

    it("updating endpoint does not clear apiKey", async () => {
      const app = createApp()
      const freshCookies = await signUpAndSignIn(app, {
        name: "Endpoint Updater",
        email: "endpoint-update@test.com",
        password: "password123",
      })

      // Store apiKey first
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ apiKey: "sk-keep-me" }),
      })

      // Update only endpoint
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ endpoint: "https://new-endpoint.example.com" }),
      })

      // ApiKey should still be present
      const res = await app.request(ADVANCED_URL, {
        headers: { Cookie: freshCookies },
      })
      const body = await res.json()
      expect(body.data.hasApiKey).toBe(true)
      expect(body.data.endpoint).toBe("https://new-endpoint.example.com")
    })
  })

  describe("endpoint validation on save", () => {
    it("accepts valid endpoint+key combination (fetch succeeds)", async () => {
      fetchStub.mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "gpt-4" }] }), { status: 200 }),
      )

      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-valid-key-for-validation-test",
          endpoint: "https://valid-endpoint.example.com/v1",
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.hasApiKey).toBe(true)
      expect(body.data.endpoint).toBe("https://valid-endpoint.example.com/v1")

      expect(fetchStub).toHaveBeenCalledWith(
        "https://valid-endpoint.example.com/v1/models",
        expect.objectContaining({
          headers: { Authorization: "Bearer sk-valid-key-for-validation-test" },
        }),
      )
    })

    it("rejects invalid key (fetch returns 401)", async () => {
      fetchStub.mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      )

      const app = createApp()
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          apiKey: "sk-bad-key",
          endpoint: "https://bad-key.example.com/v1",
        }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.message).toContain("Invalid API key")
    })

    it("accepts endpoint-only change using existing key (fetch succeeds)", async () => {
      fetchStub.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))

      const app = createApp()
      const freshCookies = await signUpAndSignIn(app, {
        name: "Endpoint Only Validator",
        email: "endpoint-only-val@test.com",
        password: "password123",
      })

      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({
          apiKey: "sk-existing-key",
          endpoint: "https://old.example.com/v1",
        }),
      })

      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ endpoint: "https://new.example.com/v1" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.endpoint).toBe("https://new.example.com/v1")

      expect(fetchStub).toHaveBeenCalledWith(
        "https://new.example.com/v1/models",
        expect.objectContaining({
          headers: { Authorization: "Bearer sk-existing-key" },
        }),
      )
    })

    it("validates new apiKey against existing endpoint when only apiKey is updated", async () => {
      fetchStub.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))

      const app = createApp()
      const freshCookies = await signUpAndSignIn(app, {
        name: "ApiKey Only Validator",
        email: "apikey-only-val@test.com",
        password: "password123",
      })

      // Store both endpoint and key
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({
          apiKey: "sk-original-key",
          endpoint: "https://existing-endpoint.example.com/v1",
        }),
      })

      // Update only apiKey — should validate against existing endpoint
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ apiKey: "sk-new-key-for-validation" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.hasApiKey).toBe(true)

      // Verify fetch was called with existing endpoint + new key
      expect(fetchStub).toHaveBeenCalledWith(
        "https://existing-endpoint.example.com/v1/models",
        expect.objectContaining({
          headers: { Authorization: "Bearer sk-new-key-for-validation" },
        }),
      )
    })

    it("rejects new apiKey when existing endpoint rejects it (apiKey-only update)", async () => {
      const app = createApp()
      const freshCookies = await signUpAndSignIn(app, {
        name: "ApiKey Reject Validator",
        email: "apikey-reject-val@test.com",
        password: "password123",
      })

      fetchStub.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({
          apiKey: "sk-original-key",
          endpoint: "https://existing-endpoint.example.com/v1",
        }),
      })

      fetchStub.mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      )
      const res = await app.request(ADVANCED_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: freshCookies },
        body: JSON.stringify({ apiKey: "sk-bad-new-key" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.message).toContain("Invalid API key")
    })
  })
})
