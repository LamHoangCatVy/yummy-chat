import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-files-route-tests-only"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"

const { createApp } = await import("../app")

const testSql = testDatabase.sql

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID()
}

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

// ── Test data ────────────────────────────────────────────────────────────────

const fileContent = Buffer.from("fake-pptx-binary-data")
const fileId = uid()
const conversationId = uid()
const mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const filename = "report.pptx"

const owner = { name: "File Owner", email: "file-owner@test.com", password: "password123" }
const other = { name: "Other User", email: "file-other@test.com", password: "password123" }

let ownerCookies: string
let otherCookies: string

describe("files API", () => {
  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()

    // Sign up both users to get their session cookies
    ownerCookies = await signUpAndSignIn(app, owner)
    otherCookies = await signUpAndSignIn(app, other)

    // Look up user IDs from the database
    const [ownerRow] = await testSql`SELECT id FROM "user" WHERE email = ${owner.email}`
    const ownerId = ownerRow.id as string

    // Seed a conversation owned by the file owner
    await testSql`INSERT INTO "conversation" (id, user_id, title) VALUES (${conversationId}, ${ownerId}, 'Test conversation')`

    // Seed a generated file row
    await testSql`INSERT INTO "generated_chat_file" (id, user_id, conversation_id, filename, mime_type, byte_size, content) VALUES (${fileId}, ${ownerId}, ${conversationId}, ${filename}, ${mimeType}, ${fileContent.length}, ${fileContent})`
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  describe("auth guard", () => {
    it("returns 401 without session", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/files/${fileId}`)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.type).toBe("AUTH_ERROR")
    })
  })

  describe("invalid UUID", () => {
    it("returns 404 for non-UUID id", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/files/not-a-uuid", {
        headers: { Cookie: ownerCookies },
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.type).toBe("NOT_FOUND_ERROR")
      expect(body.error.statusCode).toBe(404)
    })
  })

  describe("owner download", () => {
    it("returns 200 with correct bytes and headers for file owner", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/files/${fileId}`, {
        headers: { Cookie: ownerCookies },
      })

      expect(res.status).toBe(200)

      // Content-Type should match mimeType
      expect(res.headers.get("Content-Type")).toBe(mimeType)

      // Content-Disposition should be attachment with the correct filename
      const disposition = res.headers.get("Content-Disposition")
      expect(disposition).toContain("attachment")
      expect(disposition).toContain(`filename="${filename}"`)

      // Content-Length should match byteSize
      expect(res.headers.get("Content-Length")).toBe(String(fileContent.length))

      // Body bytes should match inserted content
      const buf = await res.arrayBuffer()
      expect(Buffer.from(buf)).toEqual(fileContent)
    })
  })

  describe("wrong owner", () => {
    it("returns 404 for valid UUID owned by different user", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/files/${fileId}`, {
        headers: { Cookie: otherCookies },
      })

      // Should be 404 to prevent file existence leak (not 403)
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.type).toBe("NOT_FOUND_ERROR")
    })
  })

  describe("valid UUID, file exists, owner matches", () => {
    it("returns 200 with attachment headers for the file owner", async () => {
      const app = createApp()
      const res = await app.request(`/api/v1/files/${fileId}`, {
        headers: { Cookie: ownerCookies },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get("Content-Type")).toBe(mimeType)
      expect(res.headers.get("Content-Disposition")).toContain("attachment")
      expect(res.headers.get("Content-Disposition")).toContain(`filename="${filename}"`)
      expect(res.headers.get("Content-Length")).toBe(String(fileContent.length))

      const buf = await res.arrayBuffer()
      expect(Buffer.from(buf)).toEqual(fileContent)
    })
  })
})
