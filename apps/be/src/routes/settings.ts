import { eq } from "@yummy/db"
import { db } from "@yummy/db"
import { userApiSettings } from "@yummy/db/schema"
import {
  type AdvancedSettingsGetResponse,
  type ApiErrorResponse,
  type ApiResponse,
  type UserId,
  advancedSettingsPutInputSchema,
} from "@yummy/shared"
import { Hono } from "hono"
import { auditFromContext, emitAuditEvent } from "../lib/audit.js"
import type { Actor } from "../lib/authz.js"
import { decrypt, encrypt } from "../lib/encryption.js"
import { env } from "../lib/env.js"
import { redactString } from "../lib/redact.js"
import { apiSettingsRepository } from "../lib/repositories.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"
import { invalidateModelsCache } from "./models.js"

type RouteVariables = RequestIdVariables & SessionVariables

export const settingsRouter = new Hono<{ Variables: RouteVariables }>()

settingsRouter.use("*", requireAuth)

function actorFrom(c: { get: (key: "user") => SessionVariables["user"] }): Actor {
  const user = c.get("user")
  if (user == null) throw new Error("User not authenticated")
  return { userId: user.id as UserId }
}

function meta(c: { get: (key: "requestId") => string }) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

function parseJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  return c.req.json()
}

function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/\/$/, "")
}

async function validateEndpointKey(
  endpoint: string,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${endpoint}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Invalid API key or unauthorized access" }
    }
    return { ok: false, error: `Endpoint returned ${res.status}` }
  } catch {
    return { ok: false, error: "Could not connect to the endpoint" }
  }
}

// ── GET /advanced ───────────────────────────────────────────────────────────

settingsRouter.get("/advanced", async (c) => {
  const actor = actorFrom(c)
  const repo = apiSettingsRepository(actor)
  const row = await repo.get()

  const res: ApiResponse<AdvancedSettingsGetResponse> = {
    success: true,
    data: {
      hasApiKey: !!row?.encryptedApiKey,
      endpoint: row?.endpoint ?? null,
      selectedModel: row?.selectedModel ?? null,
    },
    meta: meta(c),
  }
  return c.json(res, 200)
})

// ── PUT /advanced ───────────────────────────────────────────────────────────

settingsRouter.put("/advanced", async (c) => {
  let body: unknown
  try {
    body = await parseJson(c)
  } catch {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "VALIDATION_ERROR",
        message: "Invalid JSON body",
        statusCode: 400,
        fields: [],
      },
      meta: meta(c),
    }
    return c.json(res, 400)
  }

  // Normalize endpoint before validation
  if (
    body != null &&
    typeof body === "object" &&
    "endpoint" in body &&
    typeof (body as Record<string, unknown>).endpoint === "string"
  ) {
    const b = body as Record<string, unknown>
    b.endpoint = normalizeEndpoint(b.endpoint as string)
  }

  const parsed = advancedSettingsPutInputSchema.safeParse(body)
  if (!parsed.success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        fields: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      meta: meta(c),
    }
    return c.json(res, 400)
  }

  try {
    const actor = actorFrom(c)
    const repo = apiSettingsRepository(actor)

    let encryptedApiKey: string | null = null

    if (parsed.data.apiKey) {
      encryptedApiKey = encrypt(parsed.data.apiKey, env.userApiKeyEncryptionSecret)
    }

    const upsertData: {
      encryptedApiKey?: string | null
      endpoint?: string | null
    } = {}
    if (parsed.data.apiKey !== undefined) {
      upsertData.encryptedApiKey = encryptedApiKey
    }
    if (parsed.data.endpoint !== undefined) {
      upsertData.endpoint = parsed.data.endpoint
    }

    const endpoint = parsed.data.endpoint ?? null
    const plainKey: string | null = parsed.data.apiKey ?? null

    const existingRow = await db
      .select()
      .from(userApiSettings)
      .where(eq(userApiSettings.userId, actor.userId))
      .then((rows) => rows[0])

    if (endpoint && plainKey) {
      const validation = await validateEndpointKey(endpoint, plainKey)
      if (!validation.ok) {
        const res: ApiErrorResponse = {
          success: false,
          error: {
            type: "VALIDATION_ERROR",
            message: `API endpoint validation failed: ${validation.error}`,
            statusCode: 400,
            fields: [],
          },
          meta: meta(c),
        }
        return c.json(res, 400)
      }
    } else if (endpoint && !plainKey && existingRow?.encryptedApiKey) {
      const existingKey = decrypt(existingRow.encryptedApiKey, env.userApiKeyEncryptionSecret)
      const validation = await validateEndpointKey(endpoint, existingKey)
      if (!validation.ok) {
        const res: ApiErrorResponse = {
          success: false,
          error: {
            type: "VALIDATION_ERROR",
            message: `API endpoint validation failed: ${validation.error}`,
            statusCode: 400,
            fields: [],
          },
          meta: meta(c),
        }
        return c.json(res, 400)
      }
    } else if (!endpoint && plainKey && existingRow?.endpoint) {
      const validation = await validateEndpointKey(existingRow.endpoint, plainKey)
      if (!validation.ok) {
        const res: ApiErrorResponse = {
          success: false,
          error: {
            type: "VALIDATION_ERROR",
            message: `API endpoint validation failed: ${validation.error}`,
            statusCode: 400,
            fields: [],
          },
          meta: meta(c),
        }
        return c.json(res, 400)
      }
    }

    const row = await repo.upsert(upsertData)

    // Invalidate cached model list so next GET /models fetches fresh data
    invalidateModelsCache(actor.userId)

    const ctx = auditFromContext(c)
    emitAuditEvent({
      event_type: "chat.run",
      user_id: actor.userId,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
      outcome: "success",
      details: {
        action: "settings.advanced_update",
        hasApiKey: !!encryptedApiKey,
        endpoint: parsed.data.endpoint ?? null,
      },
    })

    const res: ApiResponse<AdvancedSettingsGetResponse> = {
      success: true,
      data: {
        hasApiKey: !!row?.encryptedApiKey,
        endpoint: row?.endpoint ?? null,
        selectedModel: row?.selectedModel ?? null,
      },
      meta: meta(c),
    }
    return c.json(res, 200)
  } catch (err) {
    // Log the real error for debugging (redacted to prevent secret leaks)
    console.error("[settings:PUT /advanced]", redactString(String(err)))

    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "INTERNAL_ERROR",
        message: "Failed to save advanced settings",
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }
})
