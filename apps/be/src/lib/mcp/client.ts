import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import { and, eq } from "@yummy/db"
import { db } from "@yummy/db"
import { mcpServer } from "@yummy/db/schema"
import type { UserId } from "@yummy/shared"
import { decrypt } from "../encryption.js"
import { env } from "../env.js"
import type { ProviderTool, ProviderToolResult } from "../llm/provider.js"
import { redactString } from "../redact.js"
import {
  LEGACY_BEARER_ID,
  getLocalStdioConfig,
  getRemoteCustomConfig,
  materializeArguments,
  materializeNamedValues,
  readMcpSecrets,
} from "./config.js"
import { PersistentOAuthProvider } from "./oauth.js"

type McpServerRow = typeof mcpServer.$inferSelect

const CONNECT_TIMEOUT_MS = 10_000
const TOOL_TIMEOUT_MS = 60_000

interface ConnectedServer {
  readonly row: McpServerRow
  readonly client: Client
  readonly tools: readonly Tool[]
}

export interface McpToolSet {
  readonly tools: readonly ProviderTool[]
  execute(name: string, arguments_: Record<string, unknown>): Promise<ProviderToolResult>
  close(): Promise<void>
}

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true
  const normalized = address.toLowerCase()
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8")) {
    return true
  }
  if (isIP(address) !== 4) return false
  const parts = address.split(".").map(Number)
  const [a = 0, b = 0] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

export async function assertSafeRemoteUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP URL must use HTTP or HTTPS")
  }
  if (url.username || url.password) throw new Error("Credentials are not allowed in MCP URLs")
  if (process.env.MCP_ALLOW_PRIVATE_NETWORKS === "true") return
  if (url.hostname.toLowerCase() === "localhost") {
    throw new Error("Private-network MCP servers are disabled")
  }
  const addresses = await lookup(url.hostname, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private-network MCP servers are disabled")
  }
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof Request) return new URL(input.url)
  return new URL(input.toString())
}

export function validatedMcpFetch(extraHeaders?: HeadersInit): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input)
    await assertSafeRemoteUrl(url)
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    for (const [name, value] of new Headers(init?.headers)) headers.set(name, value)
    for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value)
    const response = await fetch(input, { ...init, headers, redirect: "manual" })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (location) await assertSafeRemoteUrl(new URL(location, url))
      throw new Error("MCP HTTP redirects are not followed")
    }
    return response
  }
}

function remoteCustomDetails(row: McpServerRow): { url: URL; fetch: typeof fetch } {
  if (!row.url) throw new Error("Remote MCP URL is missing")
  const config = getRemoteCustomConfig(row)
  const secrets = readMcpSecrets(row)
  const url = new URL(row.url)
  for (const { name, value } of materializeNamedValues(config.query, secrets)) {
    url.searchParams.set(name, value)
  }
  const headers = new Headers()
  for (const entry of config.headers) {
    if (entry.id === LEGACY_BEARER_ID && row.encryptedBearerToken) {
      const token = decrypt(row.encryptedBearerToken, env.userApiKeyEncryptionSecret)
      headers.set(entry.name, `Bearer ${token}`)
      continue
    }
    const [materialized] = materializeNamedValues([entry], secrets)
    if (materialized) headers.set(materialized.name, materialized.value)
  }
  if (row.encryptedBearerToken && !config.headers.some((entry) => entry.id === LEGACY_BEARER_ID)) {
    const token = decrypt(row.encryptedBearerToken, env.userApiKeyEncryptionSecret)
    headers.set("Authorization", `Bearer ${token}`)
  }
  return { url, fetch: validatedMcpFetch(headers) }
}

function createRemoteTransport(row: McpServerRow, transport: "streamable-http" | "sse"): Transport {
  if (!row.url) throw new Error("Remote MCP URL is missing")
  const oauthProvider =
    row.connectionType === "remote_oauth" ? new PersistentOAuthProvider({ row }) : undefined
  const details =
    row.connectionType === "remote_custom"
      ? remoteCustomDetails(row)
      : { url: new URL(row.url), fetch: validatedMcpFetch() }
  if (transport === "streamable-http") {
    return new StreamableHTTPClientTransport(details.url, {
      fetch: details.fetch,
      ...(oauthProvider ? { authProvider: oauthProvider } : {}),
    }) as Transport
  }
  return new SSEClientTransport(details.url, {
    fetch: details.fetch,
    eventSourceInit: { fetch: details.fetch },
    ...(oauthProvider ? { authProvider: oauthProvider } : {}),
  }) as Transport
}

function createLocalTransport(row: McpServerRow): Transport {
  if (!env.mcpLocalCommandsEnabled) throw new Error("Local MCP commands are disabled")
  const config = getLocalStdioConfig(row)
  const secrets = readMcpSecrets(row)
  const localEnv = Object.fromEntries(
    materializeNamedValues(config.env, secrets).map(({ name, value }) => [name, value]),
  )
  const transport = new StdioClientTransport({
    command: config.command,
    args: materializeArguments(config.args, secrets),
    env: localEnv,
    ...(config.cwd ? { cwd: config.cwd } : {}),
    stderr: "pipe",
  })
  transport.stderr?.on("data", () => undefined)
  return transport as Transport
}

async function connectWithTransport(
  row: McpServerRow,
  transport: "streamable-http" | "sse" | "stdio",
): Promise<Client> {
  const client = new Client({ name: "yummy-chat", version: "0.1.0" })
  const connection =
    transport === "stdio" ? createLocalTransport(row) : createRemoteTransport(row, transport)
  try {
    await client.connect(connection, { timeout: CONNECT_TIMEOUT_MS })
    return client
  } catch (error) {
    await client.close().catch(() => undefined)
    throw error
  }
}

async function connect(row: McpServerRow): Promise<Client> {
  if (row.connectionType === "local_stdio") return connectWithTransport(row, "stdio")
  try {
    return await connectWithTransport(row, "streamable-http")
  } catch (streamableError) {
    const isLegacyCandidate =
      streamableError instanceof StreamableHTTPError &&
      streamableError.code !== undefined &&
      streamableError.code >= 400 &&
      streamableError.code < 500 &&
      streamableError.code !== 401 &&
      streamableError.code !== 403
    if (!isLegacyCandidate) throw streamableError
    try {
      return await connectWithTransport(row, "sse")
    } catch (sseError) {
      const first = streamableError instanceof Error ? streamableError.message : "unknown error"
      const second = sseError instanceof Error ? sseError.message : "unknown error"
      throw new Error(`Streamable HTTP failed (${first}); legacy SSE failed (${second})`)
    }
  }
}

async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = []
  let cursor: string | undefined
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, {
      timeout: CONNECT_TIMEOUT_MS,
    })
    tools.push(...page.tools)
    cursor = page.nextCursor
  } while (cursor)
  return tools
}

function providerToolName(serverId: string, toolName: string): string {
  const safeName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `mcp_${serverId.slice(0, 8)}_${safeName}`.slice(0, 64)
}

interface McpCallToolResult {
  readonly content: readonly { readonly type: string; readonly [key: string]: unknown }[]
  readonly isError?: boolean
  readonly structuredContent?: Record<string, unknown>
}

function resultToText(result: McpCallToolResult): string {
  const text = result.content
    .map((item) => {
      if (item.type === "text" && typeof item.text === "string") return item.text
      if (item.type === "resource_link") return JSON.stringify(item)
      if (item.type === "resource" && "resource" in item) return JSON.stringify(item.resource)
      return `[${item.type} content omitted]`
    })
    .join("\n")
  const structured = result.structuredContent ? JSON.stringify(result.structuredContent) : ""
  return (
    (text || structured).slice(0, 100_000) ||
    (result.isError ? "MCP tool returned an error" : "MCP tool completed")
  )
}

export async function connectAndListTools(row: McpServerRow): Promise<{
  client: Client
  tools: Tool[]
}> {
  const client = await connect(row)
  try {
    return { client, tools: await listAllTools(client) }
  } catch (error) {
    await client.close().catch(() => undefined)
    throw error
  }
}

export async function createMcpToolSet(userId: UserId): Promise<McpToolSet> {
  const rows = await db
    .select()
    .from(mcpServer)
    .where(and(eq(mcpServer.userId, userId), eq(mcpServer.enabled, true)))

  const settled = await Promise.allSettled(rows.map((row) => connectAndListTools(row)))
  const connected: ConnectedServer[] = []
  for (const [index, result] of settled.entries()) {
    const row = rows[index]
    if (!row) continue
    if (result.status === "fulfilled") {
      connected.push({ row, client: result.value.client, tools: result.value.tools })
    } else {
      console.warn(`[mcp] Could not connect to ${row.name}: ${redactString(String(result.reason))}`)
    }
  }

  const mapping = new Map<string, { server: ConnectedServer; tool: Tool }>()
  const tools: ProviderTool[] = []
  for (const server of connected) {
    for (const [toolIndex, tool] of server.tools.entries()) {
      const name = `${providerToolName(server.row.id, tool.name).slice(0, 60)}_${toolIndex}`.slice(
        0,
        64,
      )
      mapping.set(name, { server, tool })
      tools.push({
        name,
        description: tool.description ?? `${tool.name} from ${server.row.name}`,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      })
    }
  }

  return {
    tools,
    async execute(name, arguments_) {
      const target = mapping.get(name)
      if (!target) return { content: `Unknown MCP tool: ${name}`, isError: true }
      try {
        const result = await target.server.client.callTool(
          { name: target.tool.name, arguments: arguments_ },
          undefined,
          { timeout: TOOL_TIMEOUT_MS, maxTotalTimeout: TOOL_TIMEOUT_MS },
        )
        return {
          content: resultToText(result as McpCallToolResult),
          isError: result.isError === true,
        }
      } catch (error) {
        return {
          content: redactString(error instanceof Error ? error.message : "MCP tool call failed"),
          isError: true,
        }
      }
    },
    async close() {
      await Promise.allSettled(connected.map(({ client }) => client.close()))
    },
  }
}

export async function getOwnedMcpServer(userId: UserId, id: string) {
  return db
    .select()
    .from(mcpServer)
    .where(and(eq(mcpServer.id, id), eq(mcpServer.userId, userId)))
    .then((rows) => rows[0])
}
