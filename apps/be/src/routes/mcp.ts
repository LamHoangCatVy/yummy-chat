import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { and, desc, eq } from "@yummy/db"
import { db } from "@yummy/db"
import { mcpOauthAttempt, mcpServer } from "@yummy/db/schema"
import {
  type ApiErrorResponse,
  type ApiResponse,
  type McpConnectionInput,
  type McpServer,
  type McpServerListResponse,
  type McpToolListResponse,
  type UserId,
  mcpServerCreateInputSchema,
  mcpServerUpdateInputSchema,
} from "@yummy/shared"
import { Hono } from "hono"
import { env } from "../lib/env.js"
import {
  assertSafeRemoteUrl,
  connectAndListTools,
  getOwnedMcpServer,
  validatedMcpFetch,
} from "../lib/mcp/client.js"
import { McpConfigError, prepareMcpConnection, serializeMcpConnection } from "../lib/mcp/config.js"
import {
  PersistentOAuthProvider,
  consumeOAuthAttempt,
  createOAuthAttempt,
  decryptAttemptCodeVerifier,
} from "../lib/mcp/oauth.js"
import { redactString } from "../lib/redact.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

type RouteVariables = RequestIdVariables & SessionVariables
type McpServerRow = typeof mcpServer.$inferSelect

const RESERVED_HEADERS = new Set([
  "accept",
  "connection",
  "content-length",
  "content-type",
  "host",
  "mcp-protocol-version",
  "mcp-session-id",
  "transfer-encoding",
])

export const mcpRouter = new Hono<{ Variables: RouteVariables }>()
mcpRouter.use("*", requireAuth)

function userId(c: { get: (key: "user") => SessionVariables["user"] }): UserId {
  const user = c.get("user")
  if (!user) throw new Error("User not authenticated")
  return user.id as UserId
}

function meta(c: { get: (key: "requestId") => string }) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

function serialize(row: McpServerRow): McpServer {
  return {
    id: row.id,
    name: row.name,
    connection: serializeMcpConnection(row),
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function errorResponse(
  c: { get: (key: "requestId") => string },
  status: 400 | 404 | 500 | 502,
  message: string,
) {
  const error: ApiErrorResponse["error"] =
    status === 400
      ? { type: "VALIDATION_ERROR", message, statusCode: 400, fields: [] }
      : status === 404
        ? { type: "NOT_FOUND_ERROR", message, statusCode: 404, resource: "mcp_server" }
        : { type: "INTERNAL_ERROR", message, statusCode: 500 }
  const res: ApiErrorResponse = { success: false, error, meta: meta(c) }
  return res
}

function normalizeMcpUrl(raw: string): string {
  const url = new URL(raw.trim())
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new McpConfigError("MCP URL must use HTTP or HTTPS")
  }
  if (url.username || url.password)
    throw new McpConfigError("Credentials are not allowed in the MCP URL")
  return url.toString()
}

function normalizeConnection(connection: McpConnectionInput): McpConnectionInput {
  if (connection.type === "local_stdio") {
    if (!env.mcpLocalCommandsEnabled) {
      throw new McpConfigError("Local MCP commands are disabled by the deployment operator")
    }
    return connection
  }
  const url = normalizeMcpUrl(connection.url)
  if (connection.type === "remote_custom") {
    for (const header of connection.headers) {
      if (RESERVED_HEADERS.has(header.name.toLowerCase())) {
        throw new McpConfigError(`${header.name} is controlled by the MCP transport`)
      }
    }
  }
  return { ...connection, url }
}

function settingsRedirect(status: "success" | "error", reason?: string): string {
  const url = new URL("/chat", env.betterAuthUrl)
  url.searchParams.set("settings", "mcp")
  url.searchParams.set("mcpOauth", status)
  if (reason) url.searchParams.set("reason", reason)
  return url.toString()
}

mcpRouter.get("/", async (c) => {
  const rows = await db
    .select()
    .from(mcpServer)
    .where(eq(mcpServer.userId, userId(c)))
    .orderBy(desc(mcpServer.createdAt))
  const res: ApiResponse<McpServerListResponse> = {
    success: true,
    data: {
      servers: rows.map(serialize),
      capabilities: { localStdioEnabled: env.mcpLocalCommandsEnabled },
    },
    meta: meta(c),
  }
  return c.json(res, 200)
})

mcpRouter.post("/", async (c) => {
  const parsed = mcpServerCreateInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json(errorResponse(c, 400, "Invalid MCP server configuration"), 400)
  try {
    const connection = prepareMcpConnection(normalizeConnection(parsed.data.connection))
    const [row] = await db
      .insert(mcpServer)
      .values({
        userId: userId(c),
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        ...connection,
      })
      .returning()
    if (!row) return c.json(errorResponse(c, 500, "Failed to create MCP server"), 500)
    return c.json({ success: true, data: serialize(row), meta: meta(c) }, 201)
  } catch (error) {
    const message =
      error instanceof McpConfigError ? error.message : "Invalid MCP server configuration"
    return c.json(errorResponse(c, 400, message), 400)
  }
})

mcpRouter.patch("/:id", async (c) => {
  const parsed = mcpServerUpdateInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json(errorResponse(c, 400, "Invalid MCP server update"), 400)
  const owned = await getOwnedMcpServer(userId(c), c.req.param("id"))
  if (!owned) return c.json(errorResponse(c, 404, "MCP server not found"), 404)
  try {
    const updates: Partial<typeof mcpServer.$inferInsert> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled
    if (parsed.data.connection !== undefined) {
      Object.assign(
        updates,
        prepareMcpConnection(normalizeConnection(parsed.data.connection), owned),
      )
      await db.delete(mcpOauthAttempt).where(eq(mcpOauthAttempt.serverId, owned.id))
    }
    const [row] = await db
      .update(mcpServer)
      .set(updates)
      .where(and(eq(mcpServer.id, owned.id), eq(mcpServer.userId, userId(c))))
      .returning()
    if (!row) return c.json(errorResponse(c, 404, "MCP server not found"), 404)
    return c.json({ success: true, data: serialize(row), meta: meta(c) }, 200)
  } catch (error) {
    const message = error instanceof McpConfigError ? error.message : "Invalid MCP server update"
    return c.json(errorResponse(c, 400, message), 400)
  }
})

mcpRouter.delete("/:id", async (c) => {
  const [row] = await db
    .delete(mcpServer)
    .where(and(eq(mcpServer.id, c.req.param("id")), eq(mcpServer.userId, userId(c))))
    .returning({ id: mcpServer.id })
  if (!row) return c.json(errorResponse(c, 404, "MCP server not found"), 404)
  return c.json({ success: true, data: { deleted: true }, meta: meta(c) }, 200)
})

mcpRouter.post("/:id/oauth/start", async (c) => {
  const row = await getOwnedMcpServer(userId(c), c.req.param("id"))
  if (!row) return c.json(errorResponse(c, 404, "MCP server not found"), 404)
  if (row.connectionType !== "remote_oauth") {
    return c.json(errorResponse(c, 400, "This MCP server does not use OAuth"), 400)
  }
  const connection = serializeMcpConnection(row)
  if (connection.type !== "remote_oauth" || connection.grantType !== "authorization_code") {
    return c.json(errorResponse(c, 400, "Interactive OAuth is not configured"), 400)
  }
  try {
    if (!row.url) throw new Error("MCP URL is missing")
    await assertSafeRemoteUrl(new URL(row.url))
    await db.delete(mcpOauthAttempt).where(eq(mcpOauthAttempt.serverId, row.id))
    await db
      .update(mcpServer)
      .set({ encryptedOauthTokens: null, updatedAt: new Date() })
      .where(eq(mcpServer.id, row.id))
    row.encryptedOauthTokens = null
    const attempt = await createOAuthAttempt(row, userId(c))
    let authorizationUrl: URL | undefined
    const provider = new PersistentOAuthProvider({
      row,
      attempt,
      onRedirect: (url) => {
        authorizationUrl = url
      },
    })
    const requestedScope = connection.scopes.join(" ")
    const result = await auth(provider, {
      serverUrl: row.url,
      ...(requestedScope ? { scope: requestedScope } : {}),
      fetchFn: validatedMcpFetch(),
    })
    if (result !== "REDIRECT" || !authorizationUrl) {
      throw new Error("OAuth server did not provide an authorization URL")
    }
    return c.json(
      { success: true, data: { authorizationUrl: authorizationUrl.toString() }, meta: meta(c) },
      200,
    )
  } catch (error) {
    console.warn(`[mcp] OAuth start failed: ${redactString(String(error))}`)
    await db.delete(mcpOauthAttempt).where(eq(mcpOauthAttempt.serverId, row.id))
    return c.json(errorResponse(c, 502, "Could not start MCP OAuth authorization"), 502)
  }
})

mcpRouter.get("/oauth/callback", async (c) => {
  const state = c.req.query("state")
  if (!state) return c.redirect(settingsRedirect("error", "missing_state"))
  const attempt = await consumeOAuthAttempt(state, userId(c))
  if (!attempt) return c.redirect(settingsRedirect("error", "invalid_or_expired_state"))
  if (c.req.query("error")) return c.redirect(settingsRedirect("error", "authorization_denied"))
  const code = c.req.query("code")
  if (!code) return c.redirect(settingsRedirect("error", "missing_code"))
  const row = await getOwnedMcpServer(userId(c), attempt.serverId)
  if (!row || row.connectionType !== "remote_oauth" || !row.url) {
    return c.redirect(settingsRedirect("error", "server_not_found"))
  }
  try {
    const provider = new PersistentOAuthProvider({
      row,
      codeVerifier: decryptAttemptCodeVerifier(attempt.encryptedCodeVerifier),
    })
    const transport = new StreamableHTTPClientTransport(new URL(row.url), {
      authProvider: provider,
      fetch: validatedMcpFetch(),
    })
    await transport.finishAuth(code)
    await transport.close().catch(() => undefined)
    return c.redirect(settingsRedirect("success"))
  } catch (error) {
    console.warn(`[mcp] OAuth callback failed: ${redactString(String(error))}`)
    return c.redirect(settingsRedirect("error", "token_exchange_failed"))
  }
})

mcpRouter.post("/:id/oauth/disconnect", async (c) => {
  const row = await getOwnedMcpServer(userId(c), c.req.param("id"))
  if (!row) return c.json(errorResponse(c, 404, "MCP server not found"), 404)
  if (row.connectionType !== "remote_oauth") {
    return c.json(errorResponse(c, 400, "This MCP server does not use OAuth"), 400)
  }
  await db.delete(mcpOauthAttempt).where(eq(mcpOauthAttempt.serverId, row.id))
  const [updated] = await db
    .update(mcpServer)
    .set({ encryptedOauthTokens: null, updatedAt: new Date() })
    .where(and(eq(mcpServer.id, row.id), eq(mcpServer.userId, userId(c))))
    .returning()
  if (!updated) return c.json(errorResponse(c, 404, "MCP server not found"), 404)
  return c.json({ success: true, data: serialize(updated), meta: meta(c) }, 200)
})

mcpRouter.get("/:id/tools", async (c) => {
  const row = await getOwnedMcpServer(userId(c), c.req.param("id"))
  if (!row) return c.json(errorResponse(c, 404, "MCP server not found"), 404)
  try {
    const { client, tools } = await connectAndListTools(row)
    await client.close().catch(() => undefined)
    const data: McpToolListResponse = {
      server: serialize(row),
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      })),
    }
    return c.json({ success: true, data, meta: meta(c) }, 200)
  } catch (error) {
    console.warn(`[mcp] Discovery failed: ${redactString(String(error))}`)
    return c.json(errorResponse(c, 502, "Could not connect to the MCP server"), 502)
  }
})
