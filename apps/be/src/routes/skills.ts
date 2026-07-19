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
import {
  type AgentSkillManifest,
  exportAgentSkillBundle,
  normalizeAgentSkillName,
  parseAgentSkillBundle,
} from "../lib/agent-skills/parser.js"
import { auditFromContext, emitAuditEvent } from "../lib/audit.js"
import type { Actor } from "../lib/authz.js"
import { skillRepository } from "../lib/repositories.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

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

function manifestRecord(manifest: AgentSkillManifest): Record<string, unknown> {
  return {
    ...(manifest.license ? { license: manifest.license } : {}),
    ...(manifest.compatibility ? { compatibility: manifest.compatibility } : {}),
    ...(manifest.metadata ? { metadata: manifest.metadata } : {}),
    ...(manifest.allowedTools ? { allowedTools: manifest.allowedTools } : {}),
  }
}

function manifestFromRow(row: {
  slug: string
  description: string
  manifest: Record<string, unknown>
}): AgentSkillManifest {
  return {
    name: row.slug,
    description: row.description,
    ...(typeof row.manifest.license === "string" ? { license: row.manifest.license } : {}),
    ...(typeof row.manifest.compatibility === "string"
      ? { compatibility: row.manifest.compatibility }
      : {}),
    ...(row.manifest.metadata &&
    typeof row.manifest.metadata === "object" &&
    !Array.isArray(row.manifest.metadata)
      ? { metadata: row.manifest.metadata as Record<string, unknown> }
      : {}),
    ...(typeof row.manifest.allowedTools === "string"
      ? { allowedTools: row.manifest.allowedTools }
      : {}),
  }
}

function validationError(c: Parameters<typeof meta>[0], message: string) {
  const res: ApiErrorResponse = {
    success: false,
    error: {
      type: "VALIDATION_ERROR",
      message,
      statusCode: 400,
      fields: [],
    },
    meta: meta(c),
  }
  return res
}

function notFoundError(c: Parameters<typeof meta>[0], resource: string, message: string) {
  const res: ApiErrorResponse = {
    success: false,
    error: {
      type: "NOT_FOUND_ERROR",
      message,
      statusCode: 404,
      resource,
    },
    meta: meta(c),
  }
  return res
}

// ── POST /import ────────────────────────────────────────────────────────────

skillsRouter.post("/import", async (c) => {
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json(validationError(c, "Expected a multipart skill upload"), 400)
  }
  const file = formData.get("file")
  if (!file || typeof file === "string") {
    return c.json(validationError(c, "Upload a SKILL.md file or .zip bundle"), 400)
  }

  let bundle: Awaited<ReturnType<typeof parseAgentSkillBundle>>
  try {
    bundle = await parseAgentSkillBundle(file.name, new Uint8Array(await file.arrayBuffer()))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Agent Skill bundle"
    return c.json(validationError(c, message), 400)
  }

  const actor = actorFrom(c)
  const repo = skillRepository(actor)
  const existing = await repo.getBySlug(bundle.manifest.name)
  const row = existing
    ? await repo.update(existing.id as SkillId, {
        name: bundle.manifest.name,
        description: bundle.manifest.description,
        prompt: bundle.instructions,
        manifest: manifestRecord(bundle.manifest),
        enabled: true,
      })
    : await repo.create({
        id: crypto.randomUUID() as SkillId,
        name: bundle.manifest.name,
        slug: bundle.manifest.name,
        description: bundle.manifest.description,
        prompt: bundle.instructions,
        manifest: manifestRecord(bundle.manifest),
        enabled: true,
        model: "default",
      })

  if (!row) {
    return c.json(validationError(c, "Unable to persist the Agent Skill"), 400)
  }
  await repo.replaceResources(row.id as SkillId, bundle.resources)

  const ctx = auditFromContext(c)
  emitAuditEvent({
    event_type: existing ? "skill.update" : "skill.create",
    user_id: actor.userId,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    request_id: ctx.request_id,
    resource: { type: "skill", id: row.id },
    outcome: "success",
    details: {
      name: row.slug,
      source: "agent-skill-upload",
      resources: bundle.resources.length,
    },
  })

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, existing ? 200 : 201)
})

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
  const baseSlug = parsed.data.slug ?? normalizeAgentSkillName(parsed.data.name)
  const slug = (await repo.getBySlug(baseSlug))
    ? `${baseSlug.slice(0, 55).replace(/-+$/g, "")}-${id.slice(0, 8)}`
    : baseSlug
  const row = await repo.create({
    id,
    name: parsed.data.name,
    slug,
    description: parsed.data.description,
    prompt: parsed.data.prompt,
    enabled: parsed.data.enabled,
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

  const res: ApiResponse<{ skills: typeof rows }> = {
    success: true,
    data: { skills: rows },
    meta: meta(c),
  }
  return c.json(res, 200)
})

// ── GET /:id/export ──────────────────────────────────────────────────────────

skillsRouter.get("/:id/export", async (c) => {
  const idParam = c.req.param("id")
  if (!z.string().uuid().safeParse(idParam).success) {
    return c.json(notFoundError(c, "skill", "Skill not found"), 404)
  }
  const actor = actorFrom(c)
  const repo = skillRepository(actor)
  const row = await repo.getById(idParam as SkillId)
  if (!row) return c.json(notFoundError(c, "skill", "Skill not found"), 404)

  const resources = await repo.listResources(idParam as SkillId)
  const bundle = await exportAgentSkillBundle(
    {
      manifest: manifestFromRow(row),
      instructions: row.prompt,
    },
    resources,
  )
  return c.body(new Uint8Array(bundle), 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${row.slug}.zip"`,
    "Cache-Control": "no-store",
  })
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
  if (parsed.data.slug !== undefined) {
    const existing = await repo.getBySlug(parsed.data.slug)
    if (existing && existing.id !== idParam) {
      return c.json(validationError(c, "Another skill already uses that Agent Skill name"), 400)
    }
    updateData.slug = parsed.data.slug
  }
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description
  if (parsed.data.prompt !== undefined) updateData.prompt = parsed.data.prompt
  if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled
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
