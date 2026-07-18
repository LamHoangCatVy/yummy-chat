import type { mcpServer } from "@yummy/db/schema"
import { describe, expect, it } from "vitest"
import { prepareMcpConnection, readMcpSecrets, serializeMcpConnection } from "./config.js"

process.env.USER_API_KEY_ENCRYPTION_SECRET = "test-mcp-config-encryption-secret"

type McpServerRow = typeof mcpServer.$inferSelect

function rowFromWrite(write: ReturnType<typeof prepareMcpConnection>): McpServerRow {
  return {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    name: "Test",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...write,
  }
}

describe("MCP connection configuration", () => {
  it("encrypts secret entries and returns only masked presence", () => {
    const row = rowFromWrite(
      prepareMcpConnection({
        type: "remote_custom",
        url: "https://mcp.example.com/mcp",
        headers: [
          { name: "Authorization", value: "Bearer hidden", secret: true },
          { name: "X-Tenant", value: "acme", secret: false },
        ],
        query: [],
      }),
    )
    expect(JSON.stringify(row.config)).not.toContain("Bearer hidden")
    expect(row.encryptedSecrets).not.toContain("Bearer hidden")
    expect(Object.values(readMcpSecrets(row))).toContain("Bearer hidden")

    const connection = serializeMcpConnection(row)
    expect(connection.type).toBe("remote_custom")
    if (connection.type !== "remote_custom") return
    expect(connection.headers[0]?.value).toBeUndefined()
    expect(connection.headers[0]?.hasValue).toBe(true)
    expect(connection.headers[1]?.value).toBe("acme")
  })

  it("retains an omitted saved secret during updates", () => {
    const original = rowFromWrite(
      prepareMcpConnection({
        type: "local_stdio",
        command: "node",
        args: [],
        env: [{ name: "API_KEY", value: "saved-secret", secret: true }],
      }),
    )
    const connection = serializeMcpConnection(original)
    if (connection.type !== "local_stdio") throw new Error("Expected local stdio")
    const updated = rowFromWrite(
      prepareMcpConnection(
        {
          type: "local_stdio",
          command: "node",
          args: [],
          env: [{ id: connection.env[0]?.id, name: "API_KEY", secret: true }],
        },
        original,
      ),
    )
    expect(Object.values(readMcpSecrets(updated))).toContain("saved-secret")
  })
})
