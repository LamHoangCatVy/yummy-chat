import JSZip from "jszip"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-skills-tests"
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

function validPayload() {
  return {
    name: "Test Skill",
    description: "Use for test skill requests.",
    prompt: "You are a helpful assistant.",
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 2048,
  }
}

describe("skills API", () => {
  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()
    cookiesA = await signUpAndSignIn(app, userA)
    cookiesB = await signUpAndSignIn(app, userB)
  })

  afterAll(async () => {
    await testDatabase.close()
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
      expect(typeof body.data.id).toBe("string")
      expect(typeof body.data.ownerId).toBe("string")
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
          description: "Use when concise answers are requested.",
          prompt: "Be concise.",
          model: "gpt-3.5-turbo",
        }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.name).toBe("Minimal Skill")
      expect(body.data.slug).toBe("minimal-skill")
      expect(body.data.enabled).toBe(true)
      expect(body.data.temperature).toBeNull()
      expect(body.data.maxTokens).toBeNull()
    })
  })

  describe("Agent Skills import/export", () => {
    it("imports a SKILL.md bundle and exports its supporting resources", async () => {
      const archive = new JSZip()
      archive.file(
        "SKILL.md",
        `---
name: incident-response
description: Investigate production incidents. Use when an outage or error spike is reported.
license: MIT
---

# Incident response

Read the runbook before proposing remediation.
`,
      )
      archive.file("references/runbook.md", "# Runbook\n\nCheck logs before restarting services.")
      const zip = await archive.generateAsync({ type: "uint8array" })
      const formData = new FormData()
      formData.set("file", new File([zip], "incident-response.zip", { type: "application/zip" }))

      const app = createApp()
      const importRes = await app.request("/api/v1/skills/import", {
        method: "POST",
        headers: { Cookie: cookiesA },
        body: formData,
      })
      expect(importRes.status).toBe(201)
      const imported = await importRes.json()
      expect(imported.data.slug).toBe("incident-response")
      expect(imported.data.description).toContain("outage")

      const exportRes = await app.request(`/api/v1/skills/${imported.data.id}/export`, {
        headers: { Cookie: cookiesA },
      })
      expect(exportRes.status).toBe(200)
      expect(exportRes.headers.get("content-type")).toContain("application/zip")

      const exported = await JSZip.loadAsync(await exportRes.arrayBuffer())
      expect(await exported.file("SKILL.md")?.async("string")).toContain("name: incident-response")
      expect(await exported.file("references/runbook.md")?.async("string")).toContain("Check logs")
    })

    it("rejects a bundle with a traversal resource path", async () => {
      const archive = new JSZip()
      archive.file(
        "SKILL.md",
        `---
name: unsafe-skill
description: A bundle used to verify path validation.
---

# Unsafe
`,
      )
      archive.file("../secret.txt", "secret")
      const formData = new FormData()
      formData.set(
        "file",
        new File([await archive.generateAsync({ type: "uint8array" })], "unsafe.zip"),
      )

      const app = createApp()
      const res = await app.request("/api/v1/skills/import", {
        method: "POST",
        headers: { Cookie: cookiesA },
        body: formData,
      })
      expect(res.status).toBe(400)
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
      expect(Array.isArray(body.data.skills)).toBe(true)
      expect(body.data.skills.length).toBeGreaterThanOrEqual(2)
      const names = body.data.skills.map((s: { name: string }) => s.name)
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
      expect(Array.isArray(body.data.skills)).toBe(true)
      expect(body.data.skills.length).toBe(0)
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

      const getRes = await app.request(`/api/v1/conversations/${conversationId}/skill`, {
        headers: { Cookie: cookiesA },
      })
      expect(getRes.status).toBe(200)
      expect((await getRes.json()).data.skillId).toBe(skillId)
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

      const getRes = await app.request(`/api/v1/conversations/${conversationId}/skill`, {
        headers: { Cookie: cookiesA },
      })
      expect((await getRes.json()).data.skillId).toBeNull()
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
