import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-conversation-tests-only"
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

describe("conversations API", () => {
  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()
    cookiesA = await signUpAndSignIn(app, userA)
    cookiesB = await signUpAndSignIn(app, userB)
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  const userA = { name: "User A", email: "conv-a@test.com", password: "password123" }
  const userB = { name: "User B", email: "conv-b@test.com", password: "password123" }

  let cookiesA: string
  let cookiesB: string
  let conversationId: string

  describe("auth guard", () => {
    it("returns 401 without session", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations")
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.type).toBe("AUTH_ERROR")
    })
  })

  describe("POST /api/v1/conversations", () => {
    it("creates a conversation", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "My Chat" }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.title).toBe("My Chat")
      expect(typeof body.data.id).toBe("string")
      conversationId = body.data.id
    })

    it("rejects empty title", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects title exceeding max length", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "x".repeat(201) }),
      })
      expect(res.status).toBe(400)
    })

    it("rejects invalid JSON", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: "not json",
      })
      expect(res.status).toBe(400)
    })
  })

  describe("GET /api/v1/conversations", () => {
    it("lists conversations (paginated)", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(Array.isArray(body.data.conversations)).toBe(true)
      expect(body.data.conversations.length).toBeGreaterThanOrEqual(1)
      expect(body.data.nextCursor === null || typeof body.data.nextCursor === "string").toBe(true)
    })

    it("respects limit parameter", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations?limit=1", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.conversations.length).toBeLessThanOrEqual(1)
    })

    it("rejects invalid limit", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations?limit=0", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(400)
    })
  })

  describe("GET /api/v1/conversations/:id", () => {
    it("returns conversation by id", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}`, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe(conversationId)
      expect(body.data.title).toBe("My Chat")
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/conversations/${fakeId}`, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })

    it("returns 404 for invalid uuid", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations/not-a-uuid", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("PATCH /api/v1/conversations/:id", () => {
    it("updates conversation title", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "Updated Title" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.title).toBe("Updated Title")
    })

    it("rejects empty title", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "" }),
      })
      expect(res.status).toBe(400)
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/conversations/${fakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "Nope" }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe("DELETE /api/v1/conversations/:id", () => {
    it("deletes (archives) a conversation", async () => {
      const app = createApp()
      const createRes = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "To Delete" }),
      })
      const { id } = (await createRes.json()).data

      const res = await app.request(`/api/v1/conversations/${id}`, {
        method: "DELETE",
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.deleted).toBe(true)

      const getRes = await app.request(`/api/v1/conversations/${id}`, {
        headers: { Cookie: cookiesA },
      })
      expect(getRes.status).toBe(404)
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/conversations/${fakeId}`, {
        method: "DELETE",
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("cross-user isolation", () => {
    it("user B cannot read user A's conversation (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}`, {
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(404)
    })

    it("user B cannot update user A's conversation (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesB },
        body: JSON.stringify({ title: "Hacked" }),
      })
      expect(res.status).toBe(404)
    })

    it("user B cannot delete user A's conversation (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}`, {
        method: "DELETE",
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(404)
    })

    it("user B sees empty list (no user A conversations)", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      const titles = body.data.conversations.map((c: { title: string }) => c.title)
      expect(titles).not.toContain("Updated Title")
    })
  })

  describe("messages API", () => {
    let msgConvId: string

    beforeAll(async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "Message Test" }),
      })
      const body = await res.json()
      msgConvId = body.data.id
    })

    describe("POST /api/v1/conversations/:id/messages", () => {
      it("appends a message", async () => {
        const app = createApp()
        const res = await app.request(`/api/v1/conversations/${msgConvId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookiesA },
          body: JSON.stringify({ role: "user", content: "Hello!" }),
        })
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.role).toBe("user")
        expect(body.data.content).toBe("Hello!")
      })

      it("rejects empty content", async () => {
        const app = createApp()
        const res = await app.request(`/api/v1/conversations/${msgConvId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookiesA },
          body: JSON.stringify({ role: "user", content: "" }),
        })
        expect(res.status).toBe(400)
      })

      it("rejects invalid role", async () => {
        const app = createApp()
        const res = await app.request(`/api/v1/conversations/${msgConvId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookiesA },
          body: JSON.stringify({ role: "invalid", content: "test" }),
        })
        expect(res.status).toBe(400)
      })

      it("returns 404 for another user's conversation", async () => {
        const app = createApp()
        const res = await app.request(`/api/v1/conversations/${msgConvId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookiesB },
          body: JSON.stringify({ role: "user", content: "intruder" }),
        })
        expect(res.status).toBe(404)
      })
    })

    describe("GET /api/v1/conversations/:id/messages", () => {
      it("lists messages (paginated)", async () => {
        const app = createApp()
        const res = await app.request(`/api/v1/conversations/${msgConvId}/messages`, {
          headers: { Cookie: cookiesA },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(Array.isArray(body.data.data)).toBe(true)
        expect(body.data.data.length).toBeGreaterThanOrEqual(1)
      })

      it("returns 404 for another user's conversation", async () => {
        const app = createApp()
        const res = await app.request(`/api/v1/conversations/${msgConvId}/messages`, {
          headers: { Cookie: cookiesB },
        })
        expect(res.status).toBe(404)
      })

      it("returns 404 for non-existent conversation", async () => {
        const app = createApp()
        const fakeId = crypto.randomUUID()
        const res = await app.request(`/api/v1/conversations/${fakeId}/messages`, {
          headers: { Cookie: cookiesA },
        })
        expect(res.status).toBe(404)
      })
    })
  })
})
