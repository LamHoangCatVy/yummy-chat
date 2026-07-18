import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-mcp-tests"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.USER_API_KEY_ENCRYPTION_SECRET = "test-encryption-secret-32bytes!!"
process.env.APP_ENV = "test"

const { createApp } = await import("../app")

function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")
}

async function signIn(email: string): Promise<string> {
  const app = createApp()
  const user = { name: email, email, password: "password123" }
  await app.request("/api/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  })
  return cookies(
    await app.request("/api/v1/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: user.password }),
    }),
  )
}

describe("MCP server API", () => {
  let userA: string
  let userB: string

  beforeAll(async () => {
    await testDatabase.reset()
    userA = await signIn("mcp-a@test.com")
    userB = await signIn("mcp-b@test.com")
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  it("requires authentication", async () => {
    const response = await createApp().request("/api/v1/mcp")
    expect(response.status).toBe(401)
  })

  it("creates, lists, updates, and deletes a custom remote server without exposing secrets", async () => {
    const app = createApp()
    const createResponse = await app.request("/api/v1/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userA },
      body: JSON.stringify({
        name: "Company tools",
        connection: {
          type: "remote_custom",
          url: "https://mcp.example.com/mcp",
          headers: [
            { name: "Authorization", value: "Bearer super-secret-token", secret: true },
            { name: "X-Tenant", value: "acme", secret: false },
          ],
          query: [{ name: "region", value: "apac", secret: false }],
        },
        enabled: true,
      }),
    })
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created.data.connection.type).toBe("remote_custom")
    expect(created.data.connection.headers[0].hasValue).toBe(true)
    expect(created.data.connection.headers[0].value).toBeUndefined()
    expect(created.data.connection.headers[1].value).toBe("acme")
    expect(JSON.stringify(created)).not.toContain("super-secret-token")

    const listResponse = await app.request("/api/v1/mcp", { headers: { Cookie: userA } })
    const list = await listResponse.json()
    expect(list.data.servers).toHaveLength(1)
    expect(list.data.capabilities.localStdioEnabled).toBe(false)
    expect(JSON.stringify(list)).not.toContain("super-secret-token")

    const id = created.data.id as string
    const patchResponse = await app.request(`/api/v1/mcp/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: userA },
      body: JSON.stringify({ enabled: false }),
    })
    expect(patchResponse.status).toBe(200)
    expect((await patchResponse.json()).data.enabled).toBe(false)

    expect(
      (await app.request(`/api/v1/mcp/${id}`, { method: "DELETE", headers: { Cookie: userB } }))
        .status,
    ).toBe(404)
    expect(
      (await app.request(`/api/v1/mcp/${id}`, { method: "DELETE", headers: { Cookie: userA } }))
        .status,
    ).toBe(200)
  })

  it("supports both OAuth grants without exposing client secrets", async () => {
    const app = createApp()
    for (const connection of [
      {
        type: "remote_oauth",
        url: "https://mcp.example.com/mcp",
        grantType: "authorization_code",
        registrationMode: "dynamic",
        scopes: ["tools.read"],
      },
      {
        type: "remote_oauth",
        url: "https://mcp.example.com/mcp",
        grantType: "client_credentials",
        registrationMode: "manual",
        clientId: "yummy-chat",
        clientSecret: "oauth-super-secret",
        scopes: ["tools.read"],
      },
    ]) {
      const response = await app.request("/api/v1/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userA },
        body: JSON.stringify({ name: "OAuth tools", connection }),
      })
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.data.connection.type).toBe("remote_oauth")
      expect(JSON.stringify(body)).not.toContain("oauth-super-secret")
    }
  })

  it("gates local stdio commands behind deployment opt-in", async () => {
    const app = createApp()
    const input = {
      name: "Local tools",
      connection: {
        type: "local_stdio",
        command: "node",
        args: [{ value: "server.mjs", secret: false }],
        env: [{ name: "API_KEY", value: "local-secret", secret: true }],
        cwd: "/tmp",
      },
    }
    const disabled = await app.request("/api/v1/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userA },
      body: JSON.stringify(input),
    })
    expect(disabled.status).toBe(400)

    process.env.MCP_ALLOW_LOCAL_COMMANDS = "true"
    const enabled = await app.request("/api/v1/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userA },
      body: JSON.stringify(input),
    })
    process.env.MCP_ALLOW_LOCAL_COMMANDS = "false"
    expect(enabled.status).toBe(201)
    const body = await enabled.json()
    expect(body.data.connection.type).toBe("local_stdio")
    expect(body.data.connection.env[0].value).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain("local-secret")
  })

  it("rejects invalid remote URLs, credentials, and transport-controlled headers", async () => {
    const app = createApp()
    for (const url of ["file:///tmp/server", "https://user:pass@mcp.example.com/mcp"]) {
      const response = await app.request("/api/v1/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userA },
        body: JSON.stringify({
          name: "Unsafe",
          connection: { type: "remote_custom", url, headers: [], query: [] },
        }),
      })
      expect(response.status).toBe(400)
    }
    const reserved = await app.request("/api/v1/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userA },
      body: JSON.stringify({
        name: "Unsafe header",
        connection: {
          type: "remote_custom",
          url: "https://mcp.example.com/mcp",
          headers: [{ name: "Content-Type", value: "text/plain" }],
          query: [],
        },
      }),
    })
    expect(reserved.status).toBe(400)
  })
})
