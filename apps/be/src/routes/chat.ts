import type { ApiErrorResponse, ConversationId, MessageId, SkillId, UserId } from "@yummy/shared"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { auditFromContext, emitAuditEvent } from "../lib/audit"
import type { Actor } from "../lib/authz"
import { createOrchestrator } from "../lib/chat/orchestrator"
import { FakeLLMProvider } from "../lib/llm/fake-provider"
import type { UsageMetadata } from "../lib/llm/provider"
import { conversationRepository, messageRepository } from "../lib/repositories"
import { requireAuth } from "../middleware/auth-guard"
import type { RequestIdVariables } from "../middleware/request-id"
import type { SessionVariables } from "../middleware/session"

type RouteVariables = RequestIdVariables & SessionVariables

export const chatRouter = new Hono<{ Variables: RouteVariables }>()

chatRouter.use("*", requireAuth)

// ── Helpers ─────────────────────────────────────────────────────────────────

function actorFrom(c: {
  get: (key: "user") => SessionVariables["user"]
}): Actor {
  const user = c.get("user")
  return { userId: (user?.id ?? "") as UserId }
}

function meta(c: { get: (key: "requestId") => string }) {
  return {
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId"),
  } as const
}

// ── Input schema ────────────────────────────────────────────────────────────

const chatStreamInputSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(100_000),
  model: z.string().min(1).max(100).default("fake-provider"),
  skillId: z.string().uuid().optional(),
  memoryEnabled: z.boolean().optional().default(false),
})

// ── Provider singleton (swap for real provider later) ───────────────────────

function getProvider(): FakeLLMProvider {
  return new FakeLLMProvider()
}

// ── POST /stream ────────────────────────────────────────────────────────────

chatRouter.post("/stream", async (c) => {
  // Parse body
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

  const parsed = chatStreamInputSchema.safeParse(body)
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
  const { conversationId, content, model, skillId, memoryEnabled } = parsed.data

  // Verify conversation ownership
  const convRepo = conversationRepository(actor)
  const conv = await convRepo.getById(conversationId as ConversationId)
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

  // Save user message
  const msgRepo = messageRepository(conversationId as ConversationId)
  const userMsgId = crypto.randomUUID() as MessageId
  await msgRepo.create({
    id: userMsgId,
    role: "user",
    content,
  })

  // Create abort controller for this request
  const abortController = new AbortController()

  // Set up abort on client disconnect
  c.req.raw.signal.addEventListener("abort", () => {
    abortController.abort()
  })

  // Create orchestrator and run
  const provider = getProvider()
  const orchestrator = createOrchestrator({ provider })

  let assistantMsgId: MessageId | null = null
  let accumulatedText = ""
  let finalUsage: UsageMetadata | null = null

  const ctx = auditFromContext(c)

  try {
    const result = await orchestrator.orchestrate(
      {
        conversationId: conversationId as ConversationId,
        userMessage: content,
        model,
        ...(skillId ? { skillId: skillId as SkillId } : {}),
        memoryEnabled,
      },
      actor,
      abortController.signal,
    )

    emitAuditEvent({
      event_type: "chat.run",
      user_id: actor.userId,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
      resource: { type: "conversation", id: conversationId },
      outcome: "success",
      details: { model, skillId: skillId ?? null, memoryEnabled },
    })

    // Create assistant message placeholder
    assistantMsgId = crypto.randomUUID() as MessageId
    await msgRepo.create({
      id: assistantMsgId,
      role: "assistant",
      content: "",
      metadata: {
        skillUsed: result.metadata.skillUsed,
        memoryEntriesUsed: result.metadata.memoryEntriesUsed,
        model,
        streaming: true,
      },
    })

    // Stream SSE response
    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of result.stream) {
          if (abortController.signal.aborted) {
            break
          }

          switch (chunk.type) {
            case "text-delta": {
              accumulatedText += chunk.textDelta
              await stream.writeSSE({
                event: "text",
                data: JSON.stringify({ text: chunk.textDelta }),
              })
              break
            }
            case "finish": {
              finalUsage = chunk.usage
              await stream.writeSSE({
                event: "finish",
                data: JSON.stringify({
                  finishReason: chunk.finishReason,
                  usage: chunk.usage,
                  messageId: assistantMsgId,
                }),
              })
              break
            }
            case "error": {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                  error: chunk.error,
                  code: chunk.code,
                }),
              })
              break
            }
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown streaming error"
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: errorMsg, code: "STREAM_ERROR" }),
        })
      } finally {
        // Persist the completed assistant message
        if (assistantMsgId) {
          const isFailed = !finalUsage && !accumulatedText
          await msgRepo.create({
            id: crypto.randomUUID() as MessageId,
            role: "assistant",
            content: accumulatedText || "[No response generated]",
            metadata: {
              messageId: assistantMsgId,
              model,
              usage: finalUsage,
              failed: isFailed,
              completedAt: new Date().toISOString(),
            },
          })
        }

        // Record usage if we have it
        if (finalUsage) {
          await orchestrator.recordUsage({
            userId: actor.userId,
            model,
            usage: finalUsage,
          })
        }
      }
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Orchestration failed"

    emitAuditEvent({
      event_type: "chat.error",
      user_id: actor.userId,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
      resource: { type: "conversation", id: conversationId },
      outcome: "failure",
      details: { model, error: errorMsg },
    })

    if (assistantMsgId) {
      await orchestrator.markMessageFailed(assistantMsgId)
    }

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
