import {
  type ApiErrorResponse,
  type ApiResponse,
  type ConversationId,
  type SkillId,
  type UserId,
  skillIdSchema,
} from "@yummy/shared"
import { Hono } from "hono"
import type { Context } from "hono"
import { z } from "zod"
import type { Actor } from "../lib/authz.js"
import { conversationRepository, skillRepository } from "../lib/repositories.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

type RouteVariables = RequestIdVariables & SessionVariables

export const conversationSkillRouter = new Hono<{ Variables: RouteVariables }>()

conversationSkillRouter.use("*", requireAuth)

function actorFrom(c: Context): Actor {
  const user = c.get("user")
  return { userId: user?.id as UserId }
}

function meta(c: Context) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

// ── Input schema ─────────────────────────────────────────────────────────────

const setConversationSkillInputSchema = z.object({
  skillId: skillIdSchema.optional().nullable(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveConversationId(c: Context, actor: Actor): Promise<ConversationId | null> {
  const idParam = c.req.param("id")
  if (!z.string().uuid().safeParse(idParam).success) {
    return null
  }
  const convRepo = conversationRepository(actor)
  const conv = await convRepo.getById(idParam as ConversationId)
  if (!conv) {
    return null
  }
  return idParam as ConversationId
}

// ── PATCH / ──────────────────────────────────────────────────────────────────

conversationSkillRouter.patch("/", async (c) => {
  const actor = actorFrom(c)
  const conversationId = await resolveConversationId(c, actor)
  if (!conversationId) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "Conversation not found",
        statusCode: 404,
        resource: "conversation",
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

  const parsed = setConversationSkillInputSchema.safeParse(body)
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

  const skillRepo = skillRepository(actor)

  if (parsed.data.skillId === null || parsed.data.skillId === undefined) {
    await skillRepo.deleteConversationSkill(conversationId)
    const res: ApiResponse<{ skillId: null }> = {
      success: true,
      data: { skillId: null },
      meta: meta(c),
    }
    return c.json(res, 200)
  }

  // Verify skill exists and is owned by the actor
  const skillRow = await skillRepo.getById(parsed.data.skillId as SkillId)
  if (!skillRow) {
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

  // Upsert snapshot
  const snapshot = await skillRepo.setConversationSkill(
    conversationId,
    skillRow.id,
    skillRow.name,
    JSON.stringify({
      prompt: skillRow.prompt,
      model: skillRow.model,
      temperature: skillRow.temperature,
      maxTokens: skillRow.maxTokens,
    }),
  )

  const res: ApiResponse<typeof snapshot> = {
    success: true,
    data: snapshot,
    meta: meta(c),
  }
  return c.json(res, 200)
})
