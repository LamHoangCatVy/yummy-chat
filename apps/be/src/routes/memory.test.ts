import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-memory-tests"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
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

async function enableMemory(app: ReturnType<typeof createApp>, cookies: string): Promise<void> {
  await app.request("/api/v1/memory/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ enabled: true }),
  })
}

describe("memory API", () => {
  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()
    cookiesA = await signUpAndSignIn(app, userA)
    cookiesB = await signUpAndSignIn(app, userB)
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  const userA = { name: "User A", email: "mem-a@test.com", password: "password123" }
  const userB = { name: "User B", email: "mem-b@test.com", password: "password123" }

  let cookiesA: string
  let cookiesB: string
  let memoryId: string

  describe("auth guard", () => {
    it("returns 401 without session", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory")
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.type).toBe("AUTH_ERROR")
    })

    it("returns 401 on settings without session", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory/settings")
      expect(res.status).toBe(401)
    })
  })

  describe("GET /api/v1/memory/settings", () => {
    it("returns disabled by default", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory/settings", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.enabled).toBe(false)
    })
  })

  describe("PUT /api/v1/memory/settings", () => {
    it("enables memory", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ enabled: true }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.enabled).toBe(true)
    })

    it("reflects updated value on GET", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory/settings", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.enabled).toBe(true)
    })

    it("disables memory", async () => {
      const app = createApp()
      await app.request("/api/v1/memory/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ enabled: false }),
      })
      const res = await app.request("/api/v1/memory/settings", {
        headers: { Cookie: cookiesA },
      })
      const body = await res.json()
      expect(body.data.enabled).toBe(false)
    })

    it("rejects invalid body", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ enabled: "yes" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects invalid JSON", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: "not json",
      })
      expect(res.status).toBe(400)
    })
  })

  describe("POST /api/v1/memory", () => {
    beforeAll(async () => {
      const app = createApp()
      await enableMemory(app, cookiesA)
    })

    it("creates a memory entry", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "favorite_color", value: "blue" }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.key).toBe("favorite_color")
      expect(body.data.value).toBe("blue")
      expect(typeof body.data.id).toBe("string")
      expect(typeof body.data.userId).toBe("string")
      memoryId = body.data.id
    })

    it("creates memory with optional fields", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          key: "age_group",
          value: "30s",
          category: "preference",
          source: "chat",
          confidence: 0.85,
        }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.category).toBe("preference")
      expect(body.data.source).toBe("chat")
      expect(body.data.confidence).toBe(0.85)
    })

    it("rejects empty key", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "", value: "test" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects empty value", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "test", value: "" }),
      })
      expect(res.status).toBe(400)
    })

    it("rejects invalid JSON", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: "not json",
      })
      expect(res.status).toBe(400)
    })

    it("rejects sensitive category (password)", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "pw", value: "hunter2", category: "password" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects sensitive category (credential)", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "api_key", value: "sk-xxx", category: "credential" }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe("GET /api/v1/memory", () => {
    beforeAll(async () => {
      const app = createApp()
      await enableMemory(app, cookiesA)
    })

    it("lists memory entries for the user", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(Array.isArray(body.data.entries)).toBe(true)
      expect(body.data.entries.length).toBeGreaterThanOrEqual(2)
      const keys = body.data.entries.map((e: { key: string }) => e.key)
      expect(keys).toContain("favorite_color")
      expect(keys).toContain("age_group")
    })

    it("user B sees empty list", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory", {
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.data.entries)).toBe(true)
      expect(body.data.entries.length).toBe(0)
    })
  })

  describe("GET /api/v1/memory/:id", () => {
    beforeAll(async () => {
      const app = createApp()
      await enableMemory(app, cookiesA)
    })

    it("returns memory by id", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe(memoryId)
      expect(body.data.key).toBe("favorite_color")
      expect(body.data.value).toBe("blue")
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/memory/${fakeId}`, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })

    it("returns 404 for invalid uuid", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/memory/not-a-uuid", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("PATCH /api/v1/memory/:id", () => {
    beforeAll(async () => {
      const app = createApp()
      await enableMemory(app, cookiesA)
    })

    it("updates memory value", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ value: "navy" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.value).toBe("navy")
    })

    it("updates multiple fields", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "favorite_color", value: "navy", category: "preference" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.key).toBe("favorite_color")
      expect(body.data.value).toBe("navy")
      expect(body.data.category).toBe("preference")
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/memory/${fakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ value: "nope" }),
      })
      expect(res.status).toBe(404)
    })

    it("rejects sensitive category on update", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ category: "secret" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects empty key on update", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "" }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe("DELETE /api/v1/memory/:id", () => {
    beforeAll(async () => {
      const app = createApp()
      await enableMemory(app, cookiesA)
    })

    it("deletes a memory entry", async () => {
      const app = createApp()
      const createRes = await app.request("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ key: "temp", value: "delete me" }),
      })
      const { id } = (await createRes.json()).data

      const res = await app.request(`/api/v1/memory/${id}`, {
        method: "DELETE",
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.deleted).toBe(true)

      const getRes = await app.request(`/api/v1/memory/${id}`, {
        headers: { Cookie: cookiesA },
      })
      expect(getRes.status).toBe(404)
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/memory/${fakeId}`, {
        method: "DELETE",
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("cross-user isolation", () => {
    beforeAll(async () => {
      const app = createApp()
      await enableMemory(app, cookiesA)
    })

    it("user B cannot read user A's memory (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(404)
    })

    it("user B cannot update user A's memory (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesB },
        body: JSON.stringify({ value: "hacked" }),
      })
      expect(res.status).toBe(404)
    })

    it("user B cannot delete user A's memory (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/memory/${memoryId}`, {
        method: "DELETE",
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("privacy — disabled memory blocks injection", () => {
    beforeAll(async () => {
      const app = createApp()
      await enableMemory(app, cookiesB)
    })

    it("PUT /settings disables memory and GET reflects it", async () => {
      const app = createApp()
      await app.request("/api/v1/memory/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookiesB },
        body: JSON.stringify({ enabled: false }),
      })
      const res = await app.request("/api/v1/memory/settings", {
        headers: { Cookie: cookiesB },
      })
      const body = await res.json()
      expect(body.data.enabled).toBe(false)
    })
  })
})
