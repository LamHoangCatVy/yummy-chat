import {
  type ApiErrorResponse,
  type ApiResponse,
  type SkillId,
  type UserId,
  createSkillInputSchema,
  updateSkillInputSchema,
} from "@yummy/shared"
import { Hono } from "hono"
import { z } from "zod"
import { auditFromContext, emitAuditEvent } from "../lib/audit"
import type { Actor } from "../lib/authz"
import { skillRepository } from "../lib/repositories"
import { requireAuth } from "../middleware/auth-guard"
import type { RequestIdVariables } from "../middleware/request-id"
import type { SessionVariables } from "../middleware/session"

type RouteVariables = RequestIdVariables & SessionVariables

export const skillsRouter = new Hono<{ Variables: RouteVariables }>()

skillsRouter.use("*", requireAuth)

function actorFrom(c: { get: (key: "user") => SessionVariables["user"] }): Actor {
  const user = c.get("user")
  if (user == null) throw new Error("User not authenticated")
  return { userId: user.id as UserId }
}

function meta(c: { get: (key: "requestId") => string }) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

// ── POST / ───────────────────────────────────────────────────────────────────

skillsRouter.post("/", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
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

  const parsed = createSkillInputSchema.safeParse(body)
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
  const repo = skillRepository(actor)
  const id = crypto.randomUUID() as SkillId
  const row = await repo.create({
    id,
    name: parsed.data.name,
    prompt: parsed.data.prompt,
    model: parsed.data.model,
    temperature: parsed.data.temperature ?? null,
    maxTokens: parsed.data.maxTokens ?? null,
  })

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "skill.create",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    resource: { type: "skill", id },
    outcome: "success",
    details: { name: parsed.data.name, model: parsed.data.model },
  })

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 201)
})

// ── GET / ────────────────────────────────────────────────────────────────────

skillsRouter.get("/", async (c) => {
  const actor = actorFrom(c)
  const repo = skillRepository(actor)
  const rows = await repo.list()

  const res: ApiResponse<typeof rows> = {
    success: true,
    data: rows,
    meta: meta(c),
  }
  return c.json(res, 200)
})

// ── GET /:id ─────────────────────────────────────────────────────────────────

skillsRouter.get("/:id", async (c) => {
  const idParam = c.req.param("id")
  const idSchema = z.string().uuid()
  if (!idSchema.safeParse(idParam).success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Skill not found",
        statusCode: 404,
        resource: "skill",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const actor = actorFrom(c)
  const repo = skillRepository(actor)
  const row = await repo.getById(idParam as SkillId)

  if (!row) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Skill not found",
        statusCode: 404,
        resource: "skill",
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

// ── PATCH /:id ───────────────────────────────────────────────────────────────

skillsRouter.patch("/:id", async (c) => {
  const idParam = c.req.param("id")
  const idSchema = z.string().uuid()
  if (!idSchema.safeParse(idParam).success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Skill not found",
        statusCode: 404,
        resource: "skill",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  let body: unknown
  try {
    body = await c.req.json()
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

  const parsed = updateSkillInputSchema.safeParse(body)
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
  const repo = skillRepository(actor)
  const updateData: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name
  if (parsed.data.prompt !== undefined) updateData.prompt = parsed.data.prompt
  if (parsed.data.model !== undefined) updateData.model = parsed.data.model
  if (parsed.data.temperature !== undefined) updateData.temperature = parsed.data.temperature
  if (parsed.data.maxTokens !== undefined) updateData.maxTokens = parsed.data.maxTokens
  const row = await repo.update(idParam as SkillId, updateData as Parameters<typeof repo.update>[1])

  if (!row) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Skill not found",
        statusCode: 404,
        resource: "skill",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "skill.update",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    resource: { type: "skill", id: idParam },
    outcome: "success",
    details: { fields: Object.keys(updateData) },
  })

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 200)
})

// ── DELETE /:id ──────────────────────────────────────────────────────────────

skillsRouter.delete("/:id", async (c) => {
  const idParam = c.req.param("id")
  const idSchema = z.string().uuid()
  if (!idSchema.safeParse(idParam).success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Skill not found",
        statusCode: 404,
        resource: "skill",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const actor = actorFrom(c)
  const repo = skillRepository(actor)
  const deleted = await repo.delete(idParam as SkillId)

  if (!deleted) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Skill not found",
        statusCode: 404,
        resource: "skill",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: "skill.delete",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    resource: { type: "skill", id: idParam },
    outcome: "success",
  })

  const res: ApiResponse<{ deleted: true }> = {
    success: true,
    data: { deleted: true },
    meta: meta(c),
  }
  return c.json(res, 200)
})
