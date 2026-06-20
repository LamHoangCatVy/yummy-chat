import { eq } from "@yummy/db"
import { db } from "@yummy/db"
import { userApiSettings } from "@yummy/db/schema"
import type { ApiErrorResponse, ApiResponse, ModelListResponse, UserId } from "@yummy/shared"
import { Hono } from "hono"
import type { Actor } from "../lib/authz.js"
import { decrypt } from "../lib/encryption.js"
import { env } from "../lib/env.js"
import { redact } from "../lib/redact.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

type RouteVariables = RequestIdVariables & SessionVariables

export const modelsRouter = new Hono<{ Variables: RouteVariables }>()

modelsRouter.use("*", requireAuth)

// ── Helpers ─────────────────────────────────────────────────────────────────

function actorFrom(c: { get: (key: "user") => SessionVariables["user"] }): Actor {
  const user = c.get("user")
  if (user == null) throw new Error("User not authenticated")
  return { userId: user.id as UserId }
}

function meta(c: { get: (key: "requestId") => string }) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

// ── Models cache (per-user, 60s TTL) ────────────────────────────────────────

interface CacheEntry {
  timestamp: number
  data: ModelListResponse
  endpoint: string
}

const modelsCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

/** Remove a user's cached model list (e.g. after settings change). */
export function invalidateModelsCache(userId: string): void {
  modelsCache.delete(userId)
}

// ── GET / ────────────────────────────────────────────────────────────────────

modelsRouter.get("/", async (c) => {
  const actor = actorFrom(c)
  const userId = actor.userId

  // 1. Query user's BYOK settings
  const rows = await db.select().from(userApiSettings).where(eq(userApiSettings.userId, userId))
  const row = rows[0]

  if (!row?.encryptedApiKey) {
    const res: ApiResponse<ModelListResponse> = {
      success: true,
      data: { models: [] },
      meta: meta(c),
    }
    return c.json(res, 200)
  }

  // 2. Decrypt key and build endpoint base
  let decryptedKey: string
  try {
    decryptedKey = decrypt(row.encryptedApiKey, env.userApiKeyEncryptionSecret)
  } catch {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "INTERNAL_ERROR",
        message: "Failed to decrypt API key",
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }

  const endpoint = (row.endpoint || "https://api.openai.com/v1").trim().replace(/\/$/, "")
  const modelsUrl = `${endpoint}/models`

  // 3. Cache check
  const cached = modelsCache.get(userId)
  if (cached && cached.endpoint === endpoint && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    const res: ApiResponse<ModelListResponse> = { success: true, data: cached.data, meta: meta(c) }
    return c.json(res, 200)
  }

  // 4. Fetch models from provider
  let response: Response
  try {
    response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${decryptedKey}` },
      signal: c.req.raw.signal,
    })
  } catch {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "INTERNAL_ERROR",
        message: redact("Could not reach endpoint"),
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }

  // 5. Handle non-200 responses
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const res: ApiErrorResponse = {
        success: false,
        error: {
          type: "AUTH_ERROR",
          message: "Invalid API key or endpoint",
          statusCode: 401,
        },
        meta: meta(c),
      }
      return c.json(res, 401)
    }

    let bodyText = "Unknown error"
    try {
      bodyText = await response.text()
    } catch {
      // ignore
    }

    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "INTERNAL_ERROR",
        message: redact(bodyText),
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }

  // 6. Parse response body
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "INTERNAL_ERROR",
        message: "Invalid response from model provider",
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }

  // Expect { data: [{ id: string }] } shape from OpenAI-compatible endpoints
  const data = (payload as Record<string, unknown>)?.data
  if (!Array.isArray(data)) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "INTERNAL_ERROR",
        message: "Unexpected response format from model provider",
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }

  const models = data
    .filter(
      (m): m is { id: string } =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as Record<string, unknown>).id === "string",
    )
    .map((m) => {
      const label =
        typeof (m as Record<string, unknown>).label === "string"
          ? ((m as Record<string, unknown>).label as string)
          : m.id
      return { id: m.id, label }
    })

  const result: ModelListResponse = { models }

  // 7. Cache result
  modelsCache.set(userId, { timestamp: Date.now(), data: result, endpoint })

  const res: ApiResponse<ModelListResponse> = { success: true, data: result, meta: meta(c) }
  return c.json(res, 200)
})
