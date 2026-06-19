import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import * as schema from "@yummy/db/schema"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/yummy_chat_test"
process.env.BETTER_AUTH_SECRET = "test-secret-for-skills-tests"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"

const { createApp } = await import("../app")

const testSql = postgres(process.env.DATABASE_URL)

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

function validPayload() {
  return {
    name: "Test Skill",
    prompt: "You are a helpful assistant.",
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 2048,
  }
}

describe("skills API", () => {
  beforeAll(async () => {
    const adminSql = postgres("postgres://postgres:postgres@localhost:5432/postgres")
    try {
      await adminSql`CREATE DATABASE yummy_chat_test`
    } catch {
      // already exists
    }
    await adminSql.end()

    await testSql`DROP SCHEMA IF EXISTS public CASCADE`
    await testSql`DROP SCHEMA IF EXISTS drizzle CASCADE`
    await testSql`CREATE SCHEMA public`

    const migrateDb = drizzle(testSql, { schema })
    await migrate(migrateDb, { migrationsFolder: "../../packages/db/drizzle" })

    const app = createApp()
    cookiesA = await signUpAndSignIn(app, userA)
    cookiesB = await signUpAndSignIn(app, userB)
  })

  afterAll(async () => {
    await testSql.end()
  })

  const userA = { name: "User A", email: "skill-a@test.com", password: "password123" }
  const userB = { name: "User B", email: "skill-b@test.com", password: "password123" }

  let cookiesA: string
  let cookiesB: string
  let skillId: string

  describe("auth guard", () => {
    it("returns 401 without session", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills")
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.type).toBe("AUTH_ERROR")
    })
  })

  describe("POST /api/v1/skills", () => {
    it("creates a skill", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify(validPayload()),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.name).toBe("Test Skill")
      expect(body.data.prompt).toBe("You are a helpful assistant.")
      expect(body.data.model).toBe("gpt-4")
      expect(body.data.temperature).toBe(0.7)
      expect(body.data.maxTokens).toBe(2048)
      expect(body.data.id).toBeString()
      expect(body.data.ownerId).toBeString()
      skillId = body.data.id
    })

    it("rejects empty name", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ ...validPayload(), name: "" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects missing prompt", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ name: "No Prompt", model: "gpt-4" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe("VALIDATION_ERROR")
    })

    it("rejects invalid JSON", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: "not json",
      })
      expect(res.status).toBe(400)
    })

    it("creates skill with optional fields omitted (temperature, maxTokens)", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({
          name: "Minimal Skill",
          prompt: "Be concise.",
          model: "gpt-3.5-turbo",
        }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.name).toBe("Minimal Skill")
      expect(body.data.temperature).toBeNull()
      expect(body.data.maxTokens).toBeNull()
    })
  })

  describe("GET /api/v1/skills", () => {
    it("lists skills for the user", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toBeArray()
      expect(body.data.length).toBeGreaterThanOrEqual(2)
      const names = body.data.map((s: { name: string }) => s.name)
      expect(names).toContain("Test Skill")
      expect(names).toContain("Minimal Skill")
    })

    it("user B sees empty list", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills", {
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeArray()
      expect(body.data.length).toBe(0)
    })
  })

  describe("GET /api/v1/skills/:id", () => {
    it("returns skill by id", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/skills/${skillId}`, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe(skillId)
      expect(body.data.name).toBe("Test Skill")
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/skills/${fakeId}`, {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })

    it("returns 404 for invalid uuid", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/skills/not-a-uuid", {
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("PATCH /api/v1/skills/:id", () => {
    it("updates skill name and prompt", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ name: "Updated Skill", prompt: "New prompt." }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.name).toBe("Updated Skill")
      expect(body.data.prompt).toBe("New prompt.")
    })

    it("updates single field (model only)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ model: "gpt-4-turbo" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.model).toBe("gpt-4-turbo")
      expect(body.data.name).toBe("Updated Skill")
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/skills/${fakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ name: "Nope" }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe("DELETE /api/v1/skills/:id", () => {
    it("deletes a skill", async () => {
      const app = createApp()
      const createRes = await app.request("/api/v1/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify(validPayload()),
      })
      const { id } = (await createRes.json()).data

      const res = await app.request(`/api/v1/skills/${id}`, {
        method: "DELETE",
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.deleted).toBe(true)

      const getRes = await app.request(`/api/v1/skills/${id}`, {
        headers: { Cookie: cookiesA },
      })
      expect(getRes.status).toBe(404)
    })

    it("returns 404 for non-existent id", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/skills/${fakeId}`, {
        method: "DELETE",
        headers: { Cookie: cookiesA },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("cross-user isolation", () => {
    it("user B cannot read user A's skill (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/skills/${skillId}`, {
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(404)
    })

    it("user B cannot update user A's skill (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesB },
        body: JSON.stringify({ name: "Hacked" }),
      })
      expect(res.status).toBe(404)
    })

    it("user B cannot delete user A's skill (404)", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/skills/${skillId}`, {
        method: "DELETE",
        headers: { Cookie: cookiesB },
      })
      expect(res.status).toBe(404)
    })
  })

  describe("PATCH /api/v1/conversations/:id/skill", () => {
    let conversationId: string

    beforeAll(async () => {
      const app = createApp()
      const res = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ title: "Skill Test Conv" }),
      })
      const body = await res.json()
      conversationId = body.data.id
    })

    it("sets a skill on a conversation", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}/skill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ skillId }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.skillId).toBe(skillId)
      expect(body.data.skillName).toBe("Updated Skill")
    })

    it("clears a skill from a conversation", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}/skill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ skillId: null }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.skillId).toBeNull()
    })

    it("returns 404 for non-existent conversation", async () => {
      const app = createApp()
      const fakeId = crypto.randomUUID()
      const res = await app.request(`/api/v1/conversations/${fakeId}/skill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ skillId: null }),
      })
      expect(res.status).toBe(404)
    })

    it("returns 404 for non-existent skill", async () => {
      const app = createApp()
      const fakeSkillId = crypto.randomUUID()
      const res = await app.request(`/api/v1/conversations/${conversationId}/skill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesA },
        body: JSON.stringify({ skillId: fakeSkillId }),
      })
      expect(res.status).toBe(404)
    })

    it("returns 404 for another user's conversation", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/conversations/${conversationId}/skill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookiesB },
        body: JSON.stringify({ skillId: null }),
      })
      expect(res.status).toBe(404)
    })
  })
})
