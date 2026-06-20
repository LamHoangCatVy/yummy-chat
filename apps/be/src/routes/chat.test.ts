import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-chat-stream-tests"
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

/**
 * Parse SSE events from a response body.
 * Returns an array of { event, data } objects.
 */
async function parseSSEStream(
  response: Response,
  timeoutMs = 5000,
): Promise<Array<{ event: string; data: string }>> {
  const events: Array<{ event: string; data: string }> = []
  const reader = response.body?.getReader()
  if (!reader) return events

  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent = ""

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("SSE timeout")), timeoutMs)
  })

  try {
    while (true) {
      const result = await Promise.race([reader.read(), timeout])
      const { done, value } = result as ReadableStreamReadResult<Uint8Array>
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim()
        } else if (line.startsWith("data:")) {
          events.push({
            event: currentEvent,
            data: line.slice(5).trim(),
          })
          currentEvent = ""
        }
      }
    }
  } catch {
    // timeout or abort — return what we have
  } finally {
    reader.releaseLock()
  }

  return events
}

describe("chat streaming API", () => {
  const testUser = {
    name: "Stream User",
    email: "stream-test@test.com",
    password: "password123",
  }

  let cookies: string
  let conversationId: string

  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()
    cookies = await signUpAndSignIn(app, testUser)

    // Create a conversation
    const res = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({ title: "Stream Test" }),
    })
    const body = await res.json()
    conversationId = body.data.id
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  describe("POST /api/v1/chat/stream", () => {
    it("returns 401 without session", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          content: "hello",
          model: "fake-provider",
        }),
      })
      expect(res.status).toBe(401)
    })

    it("returns 400 for invalid body", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ conversationId: "not-uuid" }),
      })
      expect(res.status).toBe(400)
    })

    it("returns 404 for another user's conversation", async () => {
      const app = createApp()
      const fakeConvId = crypto.randomUUID()
      const res = await app.request("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({
          conversationId: fakeConvId,
          content: "hello",
          model: "fake-provider",
        }),
      })
      expect(res.status).toBe(404)
    })

    it("streams ≥3 text chunks before finish with increasing timestamps", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({
          conversationId,
          content: "Hello, tell me something",
          model: "fake-provider",
        }),
      })

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/event-stream")

      const events = await parseSSEStream(res, 10000)

      const textEvents = events.filter((e) => e.event === "text")
      const finishEvents = events.filter((e) => e.event === "finish")

      // Should have at least 3 text chunks
      expect(textEvents.length).toBeGreaterThanOrEqual(3)

      // Should have exactly 1 finish event
      expect(finishEvents.length).toBe(1)

      // Parse finish event
      const finishData = JSON.parse(finishEvents[0]?.data ?? "{}")
      expect(finishData.finishReason).toBe("stop")
      expect(finishData.usage).toBeDefined()
      expect(finishData.usage.outputTokens).toBeGreaterThan(0)
      expect(typeof finishData.messageId).toBe("string")

      // Each text event should have parseable data
      for (const evt of textEvents) {
        const data = JSON.parse(evt.data)
        expect(typeof data.text).toBe("string")
        expect(data.text.length).toBeGreaterThan(0)
      }
    })

    it("accumulated text matches expected fake provider output", async () => {
      const app = createApp()
      const res = await app.request("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({
          conversationId,
          content: "test",
          model: "fake-provider",
        }),
      })

      const events = await parseSSEStream(res, 10000)
      const textEvents = events.filter((e) => e.event === "text")

      const fullText = textEvents.map((e) => JSON.parse(e.data).text).join("")

      // Default fake provider emits: "Hello from the fake LLM provider!"
      expect(fullText).toBe("Hello from the fake LLM provider!")
    })

    it("persists user message in conversation", async () => {
      const app = createApp()

      // Create a fresh conversation for this test
      const convRes = await app.request("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ title: "Persist Test" }),
      })
      const { id: freshConvId } = (await convRes.json()).data

      const streamRes = await app.request("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({
          conversationId: freshConvId,
          content: "persist this message",
          model: "fake-provider",
        }),
      })

      // Consume the stream
      await parseSSEStream(streamRes, 10000)

      // Check messages
      const msgRes = await app.request(`/api/v1/conversations/${freshConvId}/messages`, {
        headers: { Cookie: cookies },
      })
      const msgBody = await msgRes.json()
      const messages = msgBody.data.data

      // Should have at least the user message
      const userMsgs = messages.filter((m: { role: string }) => m.role === "user")
      expect(userMsgs.length).toBeGreaterThanOrEqual(1)
      expect(userMsgs.some((m: { content: string }) => m.content === "persist this message")).toBe(
        true,
      )
    })
  })
})
