import {
  type ApiErrorResponse,
  type ApiResponse,
  type ConversationId,
  type MessageId,
  type UserId,
  appendMessageInputSchema,
  paginationInputSchema,
} from "@yummy/shared"
import { Hono } from "hono"
import type { Context } from "hono"
import { z } from "zod"
import type { Actor } from "../lib/authz"
import { conversationRepository, messageRepository } from "../lib/repositories"
import { requireAuth } from "../middleware/auth-guard"
import type { RequestIdVariables } from "../middleware/request-id"
import type { SessionVariables } from "../middleware/session"

type RouteVariables = RequestIdVariables & SessionVariables

export const messagesRouter = new Hono<{ Variables: RouteVariables }>()

messagesRouter.use("*", requireAuth)

function actorFrom(c: Context): Actor {
  const user = c.get("user")
  return { userId: user?.id as UserId }
}

function meta(c: Context) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

function notFoundResponse(c: Context): ApiErrorResponse {
  return {
    success: false,
    error: {
      type: "NOT_FOUND_ERROR",
      message: "Conversation not found",
      statusCode: 404,
      resource: "conversation",
    },
    meta: meta(c),
  }
}

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

messagesRouter.get("/", async (c) => {
  const actor = actorFrom(c)
  const conversationId = await resolveConversationId(c, actor)
  if (!conversationId) {
    return c.json(notFoundResponse(c), 404)
  }

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

  const msgRepo = messageRepository(conversationId)
  const result = await msgRepo.listPaginated(parsed.data.limit, parsed.data.cursor)

  const res: ApiResponse<typeof result> = {
    success: true,
    data: result,
    meta: meta(c),
  }
  return c.json(res, 200)
})

messagesRouter.post("/", async (c) => {
  const actor = actorFrom(c)
  const conversationId = await resolveConversationId(c, actor)
  if (!conversationId) {
    return c.json(notFoundResponse(c), 404)
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

  const parsed = appendMessageInputSchema.safeParse(body)
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

  const msgRepo = messageRepository(conversationId)
  const id = crypto.randomUUID() as MessageId
  const createData: {
    id: MessageId
    role: "system" | "user" | "assistant"
    content: string
    parentId?: string
    metadata?: Record<string, unknown>
  } = {
    id,
    role: parsed.data.role,
    content: parsed.data.content,
  }
  if (parsed.data.parentId !== undefined) {
    createData.parentId = parsed.data.parentId
  }
  if (parsed.data.metadata !== undefined) {
    createData.metadata = parsed.data.metadata
  }
  const row = await msgRepo.create(createData)

  const res: ApiResponse<typeof row> = {
    success: true,
    data: row,
    meta: meta(c),
  }
  return c.json(res, 201)
})
