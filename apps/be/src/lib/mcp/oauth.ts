import { createHash, randomBytes } from "node:crypto"
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import { and, eq, gt } from "@yummy/db"
import { db } from "@yummy/db"
import { mcpOauthAttempt, mcpServer } from "@yummy/db/schema"
import type { UserId } from "@yummy/shared"
import { decrypt, encrypt } from "../encryption.js"
import { env } from "../env.js"
import { OAUTH_CLIENT_SECRET_ID, getRemoteOauthConfig, readMcpSecrets } from "./config.js"

type McpServerRow = typeof mcpServer.$inferSelect

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1_000

function encryptedJson(value: unknown): string {
  return encrypt(JSON.stringify(value), env.userApiKeyEncryptionSecret)
}

function decryptedJson<T>(value: string | null): T | undefined {
  if (!value) return undefined
  return JSON.parse(decrypt(value, env.userApiKeyEncryptionSecret)) as T
}

function oauthCallbackUrl(): string {
  return `${env.betterAuthUrl.replace(/\/$/, "")}/api/v1/mcp/oauth/callback`
}

export function hashOauthState(state: string): string {
  return createHash("sha256").update(state).digest("hex")
}

export interface OAuthAttemptContext {
  readonly id: string
  readonly state: string
}

export async function createOAuthAttempt(
  row: McpServerRow,
  userId: UserId,
): Promise<OAuthAttemptContext> {
  const state = randomBytes(32).toString("base64url")
  const [attempt] = await db
    .insert(mcpOauthAttempt)
    .values({
      serverId: row.id,
      userId,
      stateHash: hashOauthState(state),
      expiresAt: new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS),
    })
    .returning({ id: mcpOauthAttempt.id })
  if (!attempt) throw new Error("Could not create OAuth attempt")
  return { id: attempt.id, state }
}

export async function consumeOAuthAttempt(state: string, userId: UserId) {
  const [attempt] = await db
    .delete(mcpOauthAttempt)
    .where(
      and(
        eq(mcpOauthAttempt.stateHash, hashOauthState(state)),
        eq(mcpOauthAttempt.userId, userId),
        gt(mcpOauthAttempt.expiresAt, new Date()),
      ),
    )
    .returning()
  return attempt
}

interface PersistentOAuthProviderOptions {
  readonly row: McpServerRow
  readonly attempt?: OAuthAttemptContext
  readonly codeVerifier?: string
  readonly onRedirect?: (url: URL) => void
}

export class PersistentOAuthProvider implements OAuthClientProvider {
  private readonly row: McpServerRow
  private readonly attempt: OAuthAttemptContext | undefined
  private readonly suppliedCodeVerifier: string | undefined
  private readonly onRedirect: ((url: URL) => void) | undefined

  constructor(options: PersistentOAuthProviderOptions) {
    this.row = options.row
    this.attempt = options.attempt
    this.suppliedCodeVerifier = options.codeVerifier
    this.onRedirect = options.onRedirect
  }

  get redirectUrl(): string | undefined {
    return getRemoteOauthConfig(this.row).grantType === "authorization_code"
      ? oauthCallbackUrl()
      : undefined
  }

  get clientMetadata(): OAuthClientMetadata {
    const config = getRemoteOauthConfig(this.row)
    if (config.grantType === "client_credentials") {
      return {
        redirect_uris: [],
        grant_types: ["client_credentials"],
        client_name: "yummy-chat",
        scope: config.scopes.join(" ") || undefined,
      }
    }
    return {
      redirect_uris: [oauthCallbackUrl()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "yummy-chat",
      scope: config.scopes.join(" ") || undefined,
    }
  }

  state(): string {
    if (!this.attempt) throw new Error("OAuth state is unavailable")
    return this.attempt.state
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const config = getRemoteOauthConfig(this.row)
    if (config.registrationMode === "manual" || config.grantType === "client_credentials") {
      if (!config.clientId) return undefined
      const secret = readMcpSecrets(this.row)[OAUTH_CLIENT_SECRET_ID]
      return { client_id: config.clientId, ...(secret ? { client_secret: secret } : {}) }
    }
    return decryptedJson<OAuthClientInformationMixed>(this.row.encryptedOauthClientInformation)
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    const encryptedClientInformation = encryptedJson(clientInformation)
    await db
      .update(mcpServer)
      .set({
        encryptedOauthClientInformation: encryptedClientInformation,
        updatedAt: new Date(),
      })
      .where(eq(mcpServer.id, this.row.id))
    this.row.encryptedOauthClientInformation = encryptedClientInformation
  }

  tokens(): OAuthTokens | undefined {
    return decryptedJson<OAuthTokens>(this.row.encryptedOauthTokens)
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const encryptedTokens = encryptedJson(tokens)
    await db
      .update(mcpServer)
      .set({ encryptedOauthTokens: encryptedTokens, updatedAt: new Date() })
      .where(eq(mcpServer.id, this.row.id))
    this.row.encryptedOauthTokens = encryptedTokens
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    if (!this.onRedirect) throw new Error("Interactive OAuth authorization is required")
    this.onRedirect(authorizationUrl)
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    if (!this.attempt) throw new Error("OAuth attempt is unavailable")
    await db
      .update(mcpOauthAttempt)
      .set({ encryptedCodeVerifier: encrypt(codeVerifier, env.userApiKeyEncryptionSecret) })
      .where(eq(mcpOauthAttempt.id, this.attempt.id))
  }

  codeVerifier(): string {
    if (!this.suppliedCodeVerifier) throw new Error("OAuth code verifier is unavailable")
    return this.suppliedCodeVerifier
  }

  prepareTokenRequest(scope?: string): URLSearchParams | undefined {
    const config = getRemoteOauthConfig(this.row)
    if (config.grantType !== "client_credentials") return undefined
    const params = new URLSearchParams({ grant_type: "client_credentials" })
    const requestedScope = scope || config.scopes.join(" ")
    if (requestedScope) params.set("scope", requestedScope)
    return params
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope !== "all" && scope !== "tokens") return
    await db
      .update(mcpServer)
      .set({ encryptedOauthTokens: null, updatedAt: new Date() })
      .where(eq(mcpServer.id, this.row.id))
    this.row.encryptedOauthTokens = null
  }
}

export function decryptAttemptCodeVerifier(encryptedCodeVerifier: string | null): string {
  if (!encryptedCodeVerifier) throw new Error("OAuth code verifier is missing")
  return decrypt(encryptedCodeVerifier, env.userApiKeyEncryptionSecret)
}
