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
import { auditFromContext, emitAuditEvent } from "../lib/audit.js"
import type { Actor } from "../lib/authz.js"
import {
  cancelMemoryProposal,
  confirmMemoryProposal,
  enqueueMemoryJob,
} from "../lib/memory/service.js"
import { memoryRepository } from "../lib/repositories.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

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

  const res: ApiResponse<{ savedMemoryEnabled: boolean; chatHistoryEnabled: boolean }> = {
    success: true,
    data: {
      savedMemoryEnabled: settings?.savedMemoryEnabled ?? false,
      chatHistoryEnabled: settings?.chatHistoryEnabled ?? false,
    },
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
  const previous = await repo.getSettings()
  const row = await repo.upsertSettings(parsed.data)
  const chatHistoryEnabled = row?.chatHistoryEnabled ?? false

  if (!previous?.chatHistoryEnabled && chatHistoryEnabled) {
    await enqueueMemoryJob("backfill", actor.userId, {})
  } else if (previous?.chatHistoryEnabled && !chatHistoryEnabled) {
    await enqueueMemoryJob("purge_history", actor.userId, {})
  }

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "memory.settings_change",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    outcome: "success",
    details: {
      savedMemoryEnabled: row?.savedMemoryEnabled ?? parsed.data.savedMemoryEnabled,
      chatHistoryEnabled,
    },
  })

  const res: ApiResponse<{ savedMemoryEnabled: boolean; chatHistoryEnabled: boolean }> = {
    success: true,
    data: {
      savedMemoryEnabled: row?.savedMemoryEnabled ?? parsed.data.savedMemoryEnabled,
      chatHistoryEnabled,
    },
    meta: meta(c),
  }
  return c.json(res, 200)
})

memoryRouter.get("/events", async (c) => {
  const actor = actorFrom(c)
  const afterParam = c.req.query("after")
  const after = afterParam ? new Date(afterParam) : new Date(0)
  if (Number.isNaN(after.getTime())) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "VALIDATION_ERROR",
        message: "Invalid after timestamp",
        statusCode: 400,
        fields: [{ field: "after", message: "Must be an ISO timestamp" }],
      },
      meta: meta(c),
    }
    return c.json(res, 400)
  }
  const events = await memoryRepository(actor).listEvents(after)
  const res: ApiResponse<{ events: typeof events }> = {
    success: true,
    data: { events },
    meta: meta(c),
  }
  return c.json(res, 200)
})

memoryRouter.post("/proposals/:id/confirm", async (c) => {
  const id = c.req.param("id")
  if (!memoryIdSchema.safeParse(id).success) {
    return c.json(
      {
        success: false,
        error: {
          type: "NOT_FOUND_ERROR",
          message: "Proposal not found",
          statusCode: 404,
          resource: "memory proposal",
        },
        meta: meta(c),
      } satisfies ApiErrorResponse,
      404,
    )
  }
  const row = await confirmMemoryProposal(actorFrom(c).userId, id)
  if (!row) {
    return c.json(
      {
        success: false,
        error: {
          type: "NOT_FOUND_ERROR",
          message: "Proposal not found",
          statusCode: 404,
          resource: "memory proposal",
        },
        meta: meta(c),
      } satisfies ApiErrorResponse,
      404,
    )
  }
  return c.json({ success: true, data: row, meta: meta(c) } satisfies ApiResponse<typeof row>, 200)
})

memoryRouter.delete("/proposals/:id", async (c) => {
  const id = c.req.param("id")
  if (!memoryIdSchema.safeParse(id).success) {
    return c.json(
      {
        success: false,
        error: {
          type: "NOT_FOUND_ERROR",
          message: "Proposal not found",
          statusCode: 404,
          resource: "memory proposal",
        },
        meta: meta(c),
      } satisfies ApiErrorResponse,
      404,
    )
  }
  const cancelled = await cancelMemoryProposal(actorFrom(c).userId, id)
  if (!cancelled) {
    return c.json(
      {
        success: false,
        error: {
          type: "NOT_FOUND_ERROR",
          message: "Proposal not found",
          statusCode: 404,
          resource: "memory proposal",
        },
        meta: meta(c),
      } satisfies ApiErrorResponse,
      404,
    )
  }
  return c.json({ success: true, data: { cancelled: true }, meta: meta(c) }, 200)
})

// ── CRUD ──────────────────────────────────────────────────────────────────

memoryRouter.get("/", async (c) => {
  const actor = actorFrom(c)
  const repo = memoryRepository(actor)
  const entries = await repo.list()

  const res: ApiResponse<{ entries: typeof entries; nextCursor: null }> = {
    success: true,
    data: { entries, nextCursor: null },
    meta: meta(c),
  }
  return c.json(res, 200)
})

memoryRouter.delete("/", async (c) => {
  const actor = actorFrom(c)
  const deleted = await memoryRepository(actor).clear()
  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "memory.delete",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    outcome: "success",
    details: { clearAll: true, deleted },
  })
  return c.json({ success: true, data: { deleted }, meta: meta(c) }, 200)
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
