import path from "node:path"
import { fileURLToPath } from "node:url"
import type { mcpServer } from "@yummy/db/schema"
import { afterEach, describe, expect, it } from "vitest"
import { connectAndListTools } from "./client.js"
import { prepareMcpConnection } from "./config.js"

process.env.USER_API_KEY_ENCRYPTION_SECRET = "test-stdio-encryption-secret"

type McpServerRow = typeof mcpServer.$inferSelect
const fixture = fileURLToPath(new URL("./__fixtures__/stdio-server.mjs", import.meta.url))

afterEach(() => {
  process.env.MCP_ALLOW_LOCAL_COMMANDS = "false"
})

describe("local stdio MCP transport", () => {
  it("passes args, env, and cwd and closes the child process", async () => {
    process.env.MCP_ALLOW_LOCAL_COMMANDS = "true"
    const write = prepareMcpConnection({
      type: "local_stdio",
      command: process.execPath,
      args: [{ value: fixture, secret: false }],
      env: [{ name: "MCP_TEST_MARKER", value: "from-config", secret: true }],
      cwd: path.dirname(fixture),
    })
    const row: McpServerRow = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      name: "Local fixture",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...write,
    }
    const { client, tools } = await connectAndListTools(row)
    expect(tools.map((tool) => tool.name)).toContain("runtime-info")
    const result = await client.callTool({ name: "runtime-info", arguments: {} })
    expect(JSON.stringify(result)).toContain("from-config")
    expect(JSON.stringify(result)).toContain(path.dirname(fixture))
    await client.close()
  })
})
