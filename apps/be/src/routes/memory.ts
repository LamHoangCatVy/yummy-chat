import {
  type ApiErrorResponse,
  type ApiResponse,
  type MemoryId,
  type UserId,
  createMemoryInputSchema,
  memoryIdSchema,
  memorySettingsSchema,
  updateMemoryInputSchema,
} from "@yummy/shared"
import { Hono } from "hono"
import { auditFromContext, emitAuditEvent } from "../lib/audit"
import type { Actor } from "../lib/authz"
import { memoryRepository } from "../lib/repositories"
import { requireAuth } from "../middleware/auth-guard"
import type { RequestIdVariables } from "../middleware/request-id"
import type { SessionVariables } from "../middleware/session"

type RouteVariables = RequestIdVariables & SessionVariables

export const memoryRouter = new Hono<{ Variables: RouteVariables }>()

memoryRouter.use("*", requireAuth)

// Categories that are never auto-savable.
const SENSITIVE_CATEGORIES = new Set(["password", "credential", "secret", "token", "key", "auth"])

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

// ── Settings (MUST be registered before /:id) ──────────────────────────────

memoryRouter.get("/settings", async (c) => {
  const actor = actorFrom(c)
  const repo = memoryRepository(actor)
  const settings = await repo.getSettings()

  const res: ApiResponse<{ enabled: boolean }> = {
    success: true,
    data: { enabled: settings?.enabled ?? false },
    meta: meta(c),
  }
  return c.json(res, 200)
})

memoryRouter.put("/settings", async (c) => {
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

  const parsed = memorySettingsSchema.safeParse(body)
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

  const actor = actorFrom(c)
  const repo = memoryRepository(actor)
  const row = await repo.upsertSettings({ enabled: parsed.data.enabled })

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "memory.settings_change",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    outcome: "success",
    details: { enabled: parsed.data.enabled },
  })

  const res: ApiResponse<{ enabled: boolean }> = {
    success: true,
    data: { enabled: row?.enabled ?? parsed.data.enabled },
    meta: meta(c),
  }
  return c.json(res, 200)
})

// ── CRUD ──────────────────────────────────────────────────────────────────

memoryRouter.get("/", async (c) => {
  const actor = actorFrom(c)
  const repo = memoryRepository(actor)
  const entries = await repo.list()

  const res: ApiResponse<{ entries: typeof entries }> = {
    success: true,
    data: { entries },
    meta: meta(c),
  }
  return c.json(res, 200)
})

memoryRouter.post("/", async (c) => {
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

  const parsed = createMemoryInputSchema.safeParse(body)
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

  const { key, value, category, source, confidence } = parsed.data

  // Privacy guard: reject sensitive categories
  if (category && SENSITIVE_CATEGORIES.has(category.toLowerCase())) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "VALIDATION_ERROR",
        message: `Cannot store memory in sensitive category: ${category}`,
        statusCode: 400,
        fields: [{ field: "category", message: "Sensitive category rejected" }],
      },
      meta: meta(c),
    }
    return c.json(res, 400)
  }

  const actor = actorFrom(c)
  const repo = memoryRepository(actor)
  const id = crypto.randomUUID() as MemoryId
  const row = await repo.upsert({
    id,
    key,
    value,
    category: category ?? null,
    source: source ?? null,
    confidence: confidence ?? null,
  })

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "memory.create",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    resource: { type: "memory", id },
    outcome: "success",
    details: { key, category: category ?? null },
  })

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 201)
})

memoryRouter.get("/:id", async (c) => {
  const idParam = c.req.param("id")
  if (!memoryIdSchema.safeParse(idParam).success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Memory not found",
        statusCode: 404,
        resource: "memory",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const actor = actorFrom(c)
  const repo = memoryRepository(actor)
  const row = await repo.getById(idParam as MemoryId)

  if (!row) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Memory not found",
        statusCode: 404,
        resource: "memory",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 200)
})

memoryRouter.patch("/:id", async (c) => {
  const idParam = c.req.param("id")
  if (!memoryIdSchema.safeParse(idParam).success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Memory not found",
        statusCode: 404,
        resource: "memory",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

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

  const parsed = updateMemoryInputSchema.safeParse(body)
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

  const actor = actorFrom(c)
  const repo = memoryRepository(actor)

  // Verify ownership before update
  const existing = await repo.getById(idParam as MemoryId)
  if (!existing) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Memory not found",
        statusCode: 404,
        resource: "memory",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const { key, value, category, source, confidence } = parsed.data

  // Privacy guard on update too
  if (category && SENSITIVE_CATEGORIES.has(category.toLowerCase())) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "VALIDATION_ERROR",
        message: `Cannot store memory in sensitive category: ${category}`,
        statusCode: 400,
        fields: [{ field: "category", message: "Sensitive category rejected" }],
      },
      meta: meta(c),
    }
    return c.json(res, 400)
  }

  const row = await repo.upsert({
    id: idParam as MemoryId,
    key: key ?? existing.key,
    value: value ?? existing.value,
    category: category !== undefined ? (category ?? null) : existing.category,
    source: source !== undefined ? (source ?? null) : existing.source,
    confidence: confidence !== undefined ? (confidence ?? null) : existing.confidence,
  })

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "memory.update",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    resource: { type: "memory", id: idParam },
    outcome: "success",
    details: { key: key ?? existing.key },
  })

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 200)
})

memoryRouter.delete("/:id", async (c) => {
  const idParam = c.req.param("id")
  if (!memoryIdSchema.safeParse(idParam).success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Memory not found",
        statusCode: 404,
        resource: "memory",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const actor = actorFrom(c)
  const repo = memoryRepository(actor)
  const deleted = await repo.delete(idParam as MemoryId)

  if (!deleted) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Memory not found",
        statusCode: 404,
        resource: "memory",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "memory.delete",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    resource: { type: "memory", id: idParam },
    outcome: "success",
  })

  const res: ApiResponse<{ deleted: true }> = {
    success: true,
    data: { deleted: true },
    meta: meta(c),
  }
  return c.json(res, 200)
})
