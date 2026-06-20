import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

// Set test env vars BEFORE any app imports (lazy getters in env.ts read at access time)
const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-auth-tests-only"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"

// Dynamic import: ensures @yummy/db singleton connects to test DB via the env vars above
const { createApp } = await import("../app")

function extractCookies(res: Response): string {
  const setCookies = res.headers.getSetCookie()
  return setCookies.map((c) => c.split(";")[0]).join("; ")
}

describe("auth", () => {
  beforeAll(async () => {
    await testDatabase.reset()
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  const testUser = {
    name: "Test User",
    email: "test@example.com",
    password: "password123",
  }

  describe("sign-up", () => {
    it("creates a new user successfully", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty("user")
      expect(body.user).toMatchObject({
        name: testUser.name,
        email: testUser.email,
      })
    })

    it("rejects duplicate email", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      })

      expect(res.status).toBe(422)
    })
  })

  describe("sign-in", () => {
    it("signs in with correct credentials", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password,
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty("user")
      expect(body.user.email).toBe(testUser.email)
    })

    it("rejects wrong password", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testUser.email,
          password: "wrong-password",
        }),
      })

      expect(res.status).toBe(401)
    })
  })

  describe("session", () => {
    it("returns session with valid cookie", async () => {
      const app = createApp()

      // Sign in to get session cookie
      const signInRes = await app.request("/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password,
        }),
      })
      expect(signInRes.status).toBe(200)

      const cookies = extractCookies(signInRes)
      expect(cookies).toBeTruthy()

      // Get session with cookie
      const sessionRes = await app.request("/api/v1/auth/get-session", {
        headers: { Cookie: cookies },
      })
      expect(sessionRes.status).toBe(200)
      const session = await sessionRes.json()
      expect(session).not.toBeNull()
      expect(session.user.email).toBe(testUser.email)
    })
  })

  describe("sign-out", () => {
    it("revokes session on logout", async () => {
      const app = createApp()

      // Sign in
      const signInRes = await app.request("/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password,
        }),
      })
      expect(signInRes.status).toBe(200)
      const cookies = extractCookies(signInRes)

      // Sign out with session cookie
      const signOutRes = await app.request("/api/v1/auth/sign-out", {
        method: "POST",
        headers: { Cookie: cookies },
      })
      expect(signOutRes.status).toBe(200)

      // Verify session is revoked
      const sessionRes = await app.request("/api/v1/auth/get-session", {
        headers: { Cookie: cookies },
      })
      const session = await sessionRes.json()
      expect(session).toBeNull()
    })
  })

  describe("cookie attributes", () => {
    it("sets HttpOnly and SameSite=Lax on session cookie", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password,
        }),
      })
      expect(res.status).toBe(200)

      const setCookies = res.headers.getSetCookie()
      const sessionCookie = setCookies.find((c) => c.includes("session_token"))
      expect(sessionCookie).toBeTruthy()
      expect(sessionCookie).toContain("HttpOnly")
      expect(sessionCookie).toContain("SameSite=Lax")
    })
  })
})
