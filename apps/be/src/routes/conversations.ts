import {
  type ApiErrorResponse,
  type ApiResponse,
  type ConversationId,
  type UserId,
  createConversationInputSchema,
  paginationInputSchema,
  updateConversationInputSchema,
} from "@yummy/shared"
import { Hono } from "hono"
import { z } from "zod"
import type { Actor } from "../lib/authz"
import { conversationRepository } from "../lib/repositories"
import { requireAuth } from "../middleware/auth-guard"
import type { RequestIdVariables } from "../middleware/request-id"
import type { SessionVariables } from "../middleware/session"

type RouteVariables = RequestIdVariables & SessionVariables

export const conversationsRouter = new Hono<{ Variables: RouteVariables }>()

conversationsRouter.use("*", requireAuth)

function actorFrom(c: { get: (key: "user") => SessionVariables["user"] }): Actor {
  const user = c.get("user")
  if (user == null) throw new Error("User not authenticated")
  return { userId: user.id as UserId }
}

function meta(c: { get: (key: "requestId") => string }) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

conversationsRouter.post("/", async (c) => {
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

  const parsed = createConversationInputSchema.safeParse(body)
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
  const repo = conversationRepository(actor)
  const id = crypto.randomUUID() as ConversationId
  const row = await repo.create({ id, title: parsed.data.title })

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 201)
})

conversationsRouter.get("/", async (c) => {
  const query = c.req.query()
  const parsed = paginationInputSchema.safeParse(query)
  if (!parsed.success) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "VALIDATION_ERROR",
        message: "Invalid query parameters",
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
  const repo = conversationRepository(actor)
  const result = await repo.listPaginated(parsed.data.limit, parsed.data.cursor)

  const res: ApiResponse<typeof result> = {
    success: true,
    data: result,
    meta: meta(c),
  }
  return c.json(res, 200)
})

conversationsRouter.get("/:id", async (c) => {
  const idParam = c.req.param("id")
  const idSchema = z.string().uuid()
  if (!idSchema.safeParse(idParam).success) {
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

  const actor = actorFrom(c)
  const repo = conversationRepository(actor)
  const row = await repo.getById(idParam as ConversationId)

  if (!row) {
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

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 200)
})

conversationsRouter.patch("/:id", async (c) => {
  const idParam = c.req.param("id")
  const idSchema = z.string().uuid()
  if (!idSchema.safeParse(idParam).success) {
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

  const parsed = updateConversationInputSchema.safeParse(body)
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
  const repo = conversationRepository(actor)
  const row = await repo.update(idParam as ConversationId, { title: parsed.data.title })

  if (!row) {
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

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 200)
})

conversationsRouter.delete("/:id", async (c) => {
  const idParam = c.req.param("id")
  const idSchema = z.string().uuid()
  if (!idSchema.safeParse(idParam).success) {
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

  const actor = actorFrom(c)
  const repo = conversationRepository(actor)
  const deleted = await repo.delete(idParam as ConversationId)

  if (!deleted) {
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

  const res: ApiResponse<{ deleted: true }> = {
    success: true,
    data: { deleted: true },
    meta: meta(c),
  }
  return c.json(res, 200)
})
