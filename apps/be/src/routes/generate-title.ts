import { eq } from "@yummy/db"
import { db } from "@yummy/db"
import { userApiSettings } from "@yummy/db/schema"
import type { ApiErrorResponse, ApiResponse, ConversationId, UserId } from "@yummy/shared"
import { Hono } from "hono"
import { z } from "zod"
import type { Actor } from "../lib/authz.js"
import { conversationRepository, messageRepository } from "../lib/repositories.js"
import { decrypt } from "../lib/encryption.js"
import { env } from "../lib/env.js"
import { FakeLLMProvider } from "../lib/llm/fake-provider.js"
import { OpenAIProvider } from "../lib/llm/openai-provider.js"
import type { CompleteRequest, LLMProvider, ProviderMessage } from "../lib/llm/provider.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

type RouteVariables = RequestIdVariables & SessionVariables

export const generateTitleRouter = new Hono<{ Variables: RouteVariables }>()

generateTitleRouter.use("*", requireAuth)

function actorFrom(c: {
  get: (key: "user") => SessionVariables["user"]
}): Actor {
  const user = c.get("user")
  return { userId: (user?.id ?? "") as UserId }
}

function meta(c: { get: (key: "requestId") => string }) {
  return { timestamp: new Date().toISOString(), requestId: c.get("requestId") } as const
}

const generateTitleInputSchema = z.object({
  model: z.string().min(1).max(100),
})

const TITLE_SYSTEM_PROMPT =
  "Generate a short, concise title (max 60 characters) for this conversation. Use the user's question and the assistant's response as context. Respond with ONLY the title — no quotes, no prefixes, no explanation. Use sentence case."

function getProvider(): LLMProvider {
  if (env.openaiApiKey) {
    return new OpenAIProvider(env.openaiApiKey, env.openaiModel)
  }
  return new FakeLLMProvider()
}

async function resolveProviderForUser(userId: string): Promise<LLMProvider> {
  const rows = await db.select().from(userApiSettings).where(eq(userApiSettings.userId, userId))
  const row = rows[0]

  if (row?.encryptedApiKey && row?.endpoint) {
    const decryptedKey = decrypt(row.encryptedApiKey, env.userApiKeyEncryptionSecret)
    return new OpenAIProvider(
      decryptedKey,
      row.selectedModel || env.openaiModel,
      row.endpoint || undefined,
    )
  }

  return getProvider()
}

generateTitleRouter.post("/", async (c) => {
  const idParam = c.req.param("id")
  if (!z.string().uuid().safeParse(idParam).success) {
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
  const conversationId = idParam as ConversationId

  const convRepo = conversationRepository(actor)
  const conv = await convRepo.getById(conversationId)
  if (!conv) {
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

  const parsed = generateTitleInputSchema.safeParse(body)
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

  const { model } = parsed.data

  const msgRepo = messageRepository(conversationId)
  const historyResult = await msgRepo.listPaginated(10)
  const messages = [...historyResult.data].reverse()

  const userMessages = messages.filter((m) => m.role === "user")
  const firstUserMessage = userMessages[0]
  if (!firstUserMessage) {
    const res: ApiResponse<{ title: string }> = {
      success: true,
      data: { title: conv.title },
      meta: meta(c),
    }
    return c.json(res, 200)
  }

  const firstUserContent = firstUserMessage.content.slice(0, 500)

  const firstAssistantMessage = messages.find(
    (m) => m.role === "assistant" && m.id > firstUserMessage.id,
  )
  const firstAssistantContent = firstAssistantMessage?.content.slice(0, 1000)

  const user = c.get("user")
  if (!user) {
    return c.json(
      {
        success: false,
        error: { type: "UNAUTHORIZED", message: "Not authenticated", statusCode: 401 },
      },
      401,
    )
  }

  const provider = await resolveProviderForUser(user.id)

  const contextMessages: ProviderMessage[] = [
    { role: "user", content: firstUserContent },
  ]
  if (firstAssistantContent) {
    contextMessages.push({ role: "assistant", content: firstAssistantContent })
  }

  const completeRequest: CompleteRequest = {
    messages: contextMessages,
    model,
    systemPrompt: TITLE_SYSTEM_PROMPT,
    maxTokens: 30,
  }

  try {
    const completion = await provider.complete(completeRequest)
    const rawTitle = completion.content.trim()
    const cleanTitle = rawTitle.replace(/^["']|["']$/g, "").slice(0, 60)
    const fallback = firstUserContent.slice(0, 50).replace(/\n/g, " ").trim() || "New chat"
    const title = cleanTitle || fallback

    const updated = await convRepo.update(conversationId, { title })

    const res: ApiResponse<{ title: string }> = {
      success: true,
      data: { title: updated?.title ?? title },
      meta: meta(c),
    }
    return c.json(res, 200)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Title generation failed"
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "INTERNAL_ERROR",
        message: errorMsg,
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }
})
