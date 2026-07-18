import type { mcpServer } from "@yummy/db/schema"
import type {
  McpArgument,
  McpArgumentInput,
  McpConnection,
  McpConnectionInput,
  McpNamedValue,
  McpNamedValueInput,
} from "@yummy/shared"
import { decrypt, encrypt } from "../encryption.js"
import { env } from "../env.js"

type McpServerRow = typeof mcpServer.$inferSelect
type SecretMap = Record<string, string>

interface StoredNamedValue {
  readonly id: string
  readonly name: string
  readonly secret: boolean
  readonly value?: string
}

interface StoredArgument {
  readonly id: string
  readonly secret: boolean
  readonly value?: string
}

export interface RemoteOauthConfig {
  readonly grantType: "authorization_code" | "client_credentials"
  readonly scopes: readonly string[]
  readonly registrationMode: "dynamic" | "manual"
  readonly clientId?: string
}

export interface RemoteCustomConfig {
  readonly headers: readonly StoredNamedValue[]
  readonly query: readonly StoredNamedValue[]
}

export interface LocalStdioConfig {
  readonly command: string
  readonly args: readonly StoredArgument[]
  readonly env: readonly StoredNamedValue[]
  readonly cwd?: string
}

export const LEGACY_BEARER_ID = "00000000-0000-4000-8000-000000000001"
export const OAUTH_CLIENT_SECRET_ID = "oauth_client_secret"

export class McpConfigError extends Error {}

function parseConfig<T>(row: McpServerRow): T {
  return (row.config ?? {}) as T
}

export function readMcpSecrets(row: McpServerRow): SecretMap {
  if (!row.encryptedSecrets) return {}
  const plaintext = decrypt(row.encryptedSecrets, env.userApiKeyEncryptionSecret)
  const parsed: unknown = JSON.parse(plaintext)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new McpConfigError("Stored MCP secrets are invalid")
  }
  return parsed as SecretMap
}

function encryptSecrets(secrets: SecretMap): string | null {
  if (Object.keys(secrets).length === 0) return null
  return encrypt(JSON.stringify(secrets), env.userApiKeyEncryptionSecret)
}

function assertUniqueNames(entries: readonly { readonly name: string }[], label: string): void {
  const names = new Set<string>()
  for (const entry of entries) {
    const normalized = entry.name.toLowerCase()
    if (names.has(normalized)) throw new McpConfigError(`${label} names must be unique`)
    names.add(normalized)
  }
}

function valueForInput(
  input: { readonly id: string | undefined; readonly value: string | null | undefined },
  existing: { readonly value?: string } | undefined,
  existingSecrets: SecretMap,
): string | undefined {
  if (typeof input.value === "string") return input.value
  if (input.id && existingSecrets[input.id] !== undefined) return existingSecrets[input.id]
  return existing?.value
}

function storeNamedValues(
  inputs: readonly McpNamedValueInput[],
  existing: readonly StoredNamedValue[],
  existingSecrets: SecretMap,
  nextSecrets: SecretMap,
  label: string,
): StoredNamedValue[] {
  assertUniqueNames(inputs, label)
  const existingById = new Map(existing.map((entry) => [entry.id, entry]))
  return inputs.map((input) => {
    const id = input.id ?? crypto.randomUUID()
    const old = input.id ? existingById.get(input.id) : undefined
    if (old?.secret && !input.secret && input.value === undefined) {
      throw new McpConfigError(`${label} value must be re-entered before making it public`)
    }
    const value = valueForInput({ id: input.id, value: input.value }, old, existingSecrets)
    if (value === undefined) throw new McpConfigError(`${label} value is required`)
    if (input.secret) {
      nextSecrets[id] = value
      return { id, name: input.name, secret: true }
    }
    return { id, name: input.name, secret: false, value }
  })
}

function storeArguments(
  inputs: readonly McpArgumentInput[],
  existing: readonly StoredArgument[],
  existingSecrets: SecretMap,
  nextSecrets: SecretMap,
): StoredArgument[] {
  const existingById = new Map(existing.map((entry) => [entry.id, entry]))
  return inputs.map((input) => {
    const id = input.id ?? crypto.randomUUID()
    const value = valueForInput(
      { id: input.id, value: input.value },
      input.id ? existingById.get(input.id) : undefined,
      existingSecrets,
    )
    if (value === undefined) throw new McpConfigError("Argument value is required")
    if (input.secret) {
      nextSecrets[id] = value
      return { id, secret: true }
    }
    return { id, secret: false, value }
  })
}

function publicNamedValues(
  entries: readonly StoredNamedValue[],
  secrets: SecretMap,
): McpNamedValue[] {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    secret: entry.secret,
    ...(entry.secret ? {} : { value: entry.value ?? "" }),
    hasValue: entry.secret ? secrets[entry.id] !== undefined : entry.value !== undefined,
  }))
}

function publicArguments(entries: readonly StoredArgument[], secrets: SecretMap): McpArgument[] {
  return entries.map((entry) => ({
    id: entry.id,
    secret: entry.secret,
    ...(entry.secret ? {} : { value: entry.value ?? "" }),
    hasValue: entry.secret ? secrets[entry.id] !== undefined : entry.value !== undefined,
  }))
}

export function materializeNamedValues(
  entries: readonly StoredNamedValue[],
  secrets: SecretMap,
): Array<{ name: string; value: string }> {
  return entries.map((entry) => {
    const value = entry.secret ? secrets[entry.id] : entry.value
    if (value === undefined) throw new McpConfigError(`Missing value for ${entry.name}`)
    return { name: entry.name, value }
  })
}

export function materializeArguments(
  entries: readonly StoredArgument[],
  secrets: SecretMap,
): string[] {
  return entries.map((entry) => {
    const value = entry.secret ? secrets[entry.id] : entry.value
    if (value === undefined) throw new McpConfigError("Missing MCP argument value")
    return value
  })
}

export function getRemoteOauthConfig(row: McpServerRow): RemoteOauthConfig {
  return parseConfig<RemoteOauthConfig>(row)
}

export function getRemoteCustomConfig(row: McpServerRow): RemoteCustomConfig {
  const config = parseConfig<Partial<RemoteCustomConfig>>(row)
  return { headers: config.headers ?? [], query: config.query ?? [] }
}

export function getLocalStdioConfig(row: McpServerRow): LocalStdioConfig {
  const config = parseConfig<Partial<LocalStdioConfig>>(row)
  if (!config.command) throw new McpConfigError("Local MCP command is missing")
  return {
    command: config.command,
    args: config.args ?? [],
    env: config.env ?? [],
    ...(config.cwd ? { cwd: config.cwd } : {}),
  }
}

export interface McpConnectionWrite {
  readonly connectionType: McpServerRow["connectionType"]
  readonly url: string | null
  readonly config: Record<string, unknown>
  readonly encryptedSecrets: string | null
  readonly encryptedBearerToken: string | null
  readonly encryptedOauthTokens: string | null
  readonly encryptedOauthClientInformation: string | null
}

export function prepareMcpConnection(
  connection: McpConnectionInput,
  existing?: McpServerRow,
): McpConnectionWrite {
  const sameType = existing?.connectionType === connection.type
  const oldSecrets = sameType && existing ? readMcpSecrets(existing) : {}
  const nextSecrets: SecretMap = {}

  if (connection.type === "remote_oauth") {
    const oldOauthConfig = sameType && existing ? getRemoteOauthConfig(existing) : undefined
    if (connection.grantType === "client_credentials") {
      if (!connection.clientId) throw new McpConfigError("Client ID is required")
      const secret = connection.clientSecret ?? oldSecrets[OAUTH_CLIENT_SECRET_ID]
      if (!secret) throw new McpConfigError("Client secret is required")
      nextSecrets[OAUTH_CLIENT_SECRET_ID] = secret
    } else if (connection.registrationMode === "manual") {
      if (!connection.clientId)
        throw new McpConfigError("Client ID is required for manual registration")
      const secret = connection.clientSecret ?? oldSecrets[OAUTH_CLIENT_SECRET_ID]
      if (secret) nextSecrets[OAUTH_CLIENT_SECRET_ID] = secret
    }
    const scopes = [...new Set(connection.scopes)]
    const registrationMode =
      connection.grantType === "client_credentials" ? "manual" : connection.registrationMode
    const canRetainAuthorization =
      sameType &&
      existing?.url === connection.url &&
      oldOauthConfig?.grantType === connection.grantType &&
      oldOauthConfig.registrationMode === registrationMode &&
      oldOauthConfig.clientId === connection.clientId &&
      JSON.stringify(oldOauthConfig.scopes) === JSON.stringify(scopes)
    return {
      connectionType: connection.type,
      url: connection.url,
      config: {
        grantType: connection.grantType,
        scopes,
        registrationMode,
        ...(connection.clientId ? { clientId: connection.clientId } : {}),
      },
      encryptedSecrets: encryptSecrets(nextSecrets),
      encryptedBearerToken: null,
      encryptedOauthTokens: canRetainAuthorization
        ? (existing?.encryptedOauthTokens ?? null)
        : null,
      encryptedOauthClientInformation:
        canRetainAuthorization && registrationMode === "dynamic"
          ? (existing?.encryptedOauthClientInformation ?? null)
          : null,
    }
  }

  if (connection.type === "remote_custom") {
    const oldConfig =
      sameType && existing ? getRemoteCustomConfig(existing) : { headers: [], query: [] }
    if (sameType && existing?.encryptedBearerToken) {
      oldSecrets[LEGACY_BEARER_ID] = `Bearer ${decrypt(
        existing.encryptedBearerToken,
        env.userApiKeyEncryptionSecret,
      )}`
    }
    const headers = storeNamedValues(
      connection.headers,
      oldConfig.headers,
      oldSecrets,
      nextSecrets,
      "Header",
    )
    const query = storeNamedValues(
      connection.query,
      oldConfig.query,
      oldSecrets,
      nextSecrets,
      "Query parameter",
    )
    return {
      connectionType: connection.type,
      url: connection.url,
      config: { headers, query },
      encryptedSecrets: encryptSecrets(nextSecrets),
      encryptedBearerToken: null,
      encryptedOauthTokens: null,
      encryptedOauthClientInformation: null,
    }
  }

  const oldConfig =
    sameType && existing ? getLocalStdioConfig(existing) : { command: "", args: [], env: [] }
  const args = storeArguments(connection.args, oldConfig.args, oldSecrets, nextSecrets)
  const localEnv = storeNamedValues(
    connection.env,
    oldConfig.env,
    oldSecrets,
    nextSecrets,
    "Environment variable",
  )
  return {
    connectionType: connection.type,
    url: null,
    config: {
      command: connection.command,
      args,
      env: localEnv,
      ...(connection.cwd ? { cwd: connection.cwd } : {}),
    },
    encryptedSecrets: encryptSecrets(nextSecrets),
    encryptedBearerToken: null,
    encryptedOauthTokens: null,
    encryptedOauthClientInformation: null,
  }
}

export function serializeMcpConnection(row: McpServerRow): McpConnection {
  const secrets = readMcpSecrets(row)
  if (row.connectionType === "remote_oauth") {
    const config = getRemoteOauthConfig(row)
    return {
      type: "remote_oauth",
      url: row.url ?? "",
      grantType: config.grantType,
      scopes: [...config.scopes],
      registrationMode: config.registrationMode,
      clientId: config.clientId ?? null,
      hasClientSecret: secrets[OAUTH_CLIENT_SECRET_ID] !== undefined,
      authorizationStatus:
        config.grantType === "client_credentials" || row.encryptedOauthTokens
          ? "ready"
          : "required",
    }
  }
  if (row.connectionType === "local_stdio") {
    const config = getLocalStdioConfig(row)
    return {
      type: "local_stdio",
      command: config.command,
      args: publicArguments(config.args, secrets),
      env: publicNamedValues(config.env, secrets),
      cwd: config.cwd ?? null,
    }
  }
  const config = getRemoteCustomConfig(row)
  const headers = [...config.headers]
  if (row.encryptedBearerToken && !headers.some((entry) => entry.id === LEGACY_BEARER_ID)) {
    headers.unshift({ id: LEGACY_BEARER_ID, name: "Authorization", secret: true })
  }
  const publicHeaders = publicNamedValues(headers, secrets).map((entry) =>
    entry.id === LEGACY_BEARER_ID ? { ...entry, hasValue: true } : entry,
  )
  return {
    type: "remote_custom",
    url: row.url ?? "",
    headers: publicHeaders,
    query: publicNamedValues(config.query, secrets),
  }
}
