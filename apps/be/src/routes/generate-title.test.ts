import { createServer, type Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { encrypt } from "../lib/encryption"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-generate-title-tests"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"
process.env.USER_API_KEY_ENCRYPTION_SECRET = "test-title-encryption-secret"
process.env.OPENAI_API_KEY = ""

const { createApp } = await import("../app")

type TestUser = {
  readonly name: string
  readonly email: string
  readonly password: string
}

type LocalCompletionServer = {
  readonly endpoint: string
  readonly requests: string[]
  readonly close: () => Promise<void>
}

function extractCookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
}

async function signUpAndSignIn(app: ReturnType<typeof createApp>, user: TestUser): Promise<string> {
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

async function createLocalCompletionServer(title: string): Promise<LocalCompletionServer> {
  const requests: string[] = []
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
    }
    requests.push(Buffer.concat(chunks).toString("utf8"))
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        id: "chatcmpl-title-test",
        object: "chat.completion",
        created: 1,
        model: "title-test-response-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: title },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      }),
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to start local completion test server")
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
      }),
  }
}

async function userIdByEmail(email: string): Promise<string> {
  const rows = await testDatabase.sql<{ id: string }[]>`
    SELECT id FROM "user" WHERE email = ${email} LIMIT 1
  `
  const row = rows.at(0)
  if (!row) {
    throw new Error("Test user not found")
  }
  return row.id
}

async function insertByokSettings(userId: string, endpoint: string): Promise<void> {
  const encryptionSecret = process.env.USER_API_KEY_ENCRYPTION_SECRET
  if (!encryptionSecret) {
    throw new Error("USER_API_KEY_ENCRYPTION_SECRET not set")
  }
  await testDatabase.sql`
    INSERT INTO user_api_settings (id, user_id, encrypted_api_key, endpoint, selected_model)
    VALUES (
      ${crypto.randomUUID()},
      ${userId},
      ${encrypt("sk-title-route-test-key", encryptionSecret)},
      ${endpoint},
      ${"provider-default-title-model"}
    )
  `
}

describe("generate title API", () => {
  const titleUser = {
    name: "Title User",
    email: "generate-title@test.com",
    password: "password123",
  }

  let cookies: string
  let conversationId: string

  beforeAll(async () => {
    await testDatabase.reset()

    const app = createApp()
    cookies = await signUpAndSignIn(app, titleUser)

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({ title: "Original title" }),
    })
    const convBody = await convRes.json()
    conversationId = convBody.data.id
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  it("returns 401 without session", async () => {
    const app = createApp()
    const res = await app.request(`/api/v1/conversations/${conversationId}/generate-title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-title-test" }),
    })

    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid body", async () => {
    const app = createApp()
    const res = await app.request(`/api/v1/conversations/${conversationId}/generate-title`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({ model: "" }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.type).toBe("VALIDATION_ERROR")
  })

  it("calls non-streaming completion with the requested model", async () => {
    const app = createApp()
    const completionServer = await createLocalCompletionServer("Requested Model Title")
    const requestedModel = "gpt-title-requested-model"

    try {
      const userId = await userIdByEmail(titleUser.email)
      await insertByokSettings(userId, completionServer.endpoint)

      const messageRes = await app.request(`/api/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ role: "user", content: "Please explain model routing." }),
      })
      expect(messageRes.status).toBe(201)

      const assistantRes = await app.request(`/api/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ role: "assistant", content: "Model routing chooses request body model." }),
      })
      expect(assistantRes.status).toBe(201)

      const res = await app.request(`/api/v1/conversations/${conversationId}/generate-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ model: requestedModel }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.title).toBe("Requested Model Title")
      expect(completionServer.requests.length).toBe(1)

      const requestBodyText = completionServer.requests.at(0)
      if (!requestBodyText) {
        throw new Error("Completion request body not captured")
      }
      const completionRequest = JSON.parse(requestBodyText)
      expect(completionRequest).toMatchObject({
        model: requestedModel,
        stream: false,
        max_tokens: 30,
      })
    } finally {
      await completionServer.close()
    }
  })
})
