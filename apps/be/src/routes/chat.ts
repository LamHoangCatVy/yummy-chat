import { eq } from "@yummy/db"
import { db } from "@yummy/db"
import { userApiSettings } from "@yummy/db/schema"
import type { ApiErrorResponse, ConversationId, MessageId, SkillId, UserId } from "@yummy/shared"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { auditFromContext, emitAuditEvent } from "../lib/audit.js"
import type { Actor } from "../lib/authz.js"
import { createOrchestrator } from "../lib/chat/orchestrator.js"
import { decrypt } from "../lib/encryption.js"
import { env } from "../lib/env.js"
import { FakeLLMProvider } from "../lib/llm/fake-provider.js"
import { OpenAIProvider } from "../lib/llm/openai-provider.js"
import { extractPptxJson, generatePptxBuffer } from "../lib/llm/pptx-generator.js"
import type { LLMProvider } from "../lib/llm/provider.js"
import type { UsageMetadata } from "../lib/llm/provider.js"
import { extractXlsxJson, generateXlsxBuffer } from "../lib/llm/xlsx-generator.js"
import { redactString } from "../lib/redact.js"
import {
  conversationRepository,
  generatedFileRepository,
  messageRepository,
  skillRepository,
} from "../lib/repositories.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

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
  model: z.string().min(1).max(100).default("gpt-5-nano"),
  skillId: z.string().uuid().optional(),
  memoryEnabled: z.boolean().optional().default(false),
})

// ── Provider resolution (per-request, request-scoped) ──────────────────────

function getProvider(): LLMProvider {
  if (process.env.FAKE_PROVIDER_CHUNKS_JSON) {
    return new FakeLLMProvider({
      chunksJson: process.env.FAKE_PROVIDER_CHUNKS_JSON,
      ...(process.env.FAKE_PROVIDER_REASONING_CHUNKS_JSON
        ? { reasoningChunksJson: process.env.FAKE_PROVIDER_REASONING_CHUNKS_JSON }
        : {}),
      chunkDelayMs: 1,
    })
  }
  if (env.openaiApiKey) {
    return new OpenAIProvider(env.openaiApiKey, env.openaiModel)
  }
  if (process.env.FAKE_PROVIDER_ERROR) {
    return new FakeLLMProvider({
      errorAfterChunks: 0,
      errorMessage: process.env.FAKE_PROVIDER_ERROR,
    })
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
  const { conversationId, content, model, memoryEnabled } = parsed.data
  let { skillId } = parsed.data

  // Auto-load the conversation's stored skill if none was sent in the request
  if (!skillId) {
    const skillRepo = skillRepository(actor)
    const stored = await skillRepo.getConversationSkill(conversationId)
    if (stored) {
      skillId = stored.skillId as SkillId
    }
  }

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

  // Create orchestrator and run
  const provider = await resolveProviderForUser(user.id)
  const orchestrator = createOrchestrator({ provider })

  let assistantMsgId: MessageId | null = null
  let accumulatedText = ""
  let accumulatedReasoning = ""
  let finalUsage: UsageMetadata | null = null

  const ctx = auditFromContext(c)

  try {
    const result = await orchestrator.orchestrate(
      {
        conversationId: conversationId as ConversationId,
        userMessage: content,
        userMessageId: userMsgId,
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
            case "reasoning-delta": {
              accumulatedReasoning += chunk.reasoningDelta
              await stream.writeSSE({
                event: "reasoning",
                data: JSON.stringify({ reasoning: chunk.reasoningDelta }),
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
                  error: redactString(chunk.error),
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
          data: JSON.stringify({ error: redactString(errorMsg), code: "STREAM_ERROR" }),
        })
      } finally {
        // Persist generated files and update the placeholder message
        if (assistantMsgId) {
          const fileRepo = generatedFileRepository(actor)
          const files: Array<{
            id: string
            filename: string
            mimeType: string
            byteSize: number
            downloadUrl: string
          }> = []

          // ── PPTX file generation ──
          const pptxData = extractPptxJson(accumulatedText)
          if (pptxData) {
            try {
              const result = await generatePptxBuffer(pptxData)
              const fileRow = await fileRepo.create({
                id: crypto.randomUUID(),
                userId: actor.userId,
                conversationId,
                messageId: assistantMsgId,
                filename: result.filename,
                mimeType: result.mimeType,
                byteSize: result.byteSize,
                content: result.buffer,
              })
              if (fileRow) {
                files.push({
                  id: fileRow.id,
                  filename: result.filename,
                  mimeType: result.mimeType,
                  byteSize: result.byteSize,
                  downloadUrl: `/api/v1/files/${fileRow.id}`,
                })
                await stream.writeSSE({
                  event: "file",
                  data: JSON.stringify({
                    id: fileRow.id,
                    filename: result.filename,
                    mimeType: result.mimeType,
                    byteSize: result.byteSize,
                    downloadUrl: `/api/v1/files/${fileRow.id}`,
                  }),
                })
              }
            } catch (fileErr) {
              const fileErrorMsg =
                fileErr instanceof Error ? fileErr.message : "PPTX generation failed"
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({ error: redactString(fileErrorMsg), code: "FILE_GEN_ERROR" }),
              })
            }
          }

          // ── XLSX file generation ──
          const xlsxData = extractXlsxJson(accumulatedText)
          if (xlsxData) {
            try {
              const result = await generateXlsxBuffer(xlsxData)
              const fileRow = await fileRepo.create({
                id: crypto.randomUUID(),
                userId: actor.userId,
                conversationId,
                messageId: assistantMsgId,
                filename: result.filename,
                mimeType: result.mimeType,
                byteSize: result.byteSize,
                content: result.buffer,
              })
              if (fileRow) {
                files.push({
                  id: fileRow.id,
                  filename: result.filename,
                  mimeType: result.mimeType,
                  byteSize: result.byteSize,
                  downloadUrl: `/api/v1/files/${fileRow.id}`,
                })
                await stream.writeSSE({
                  event: "file",
                  data: JSON.stringify({
                    id: fileRow.id,
                    filename: result.filename,
                    mimeType: result.mimeType,
                    byteSize: result.byteSize,
                    downloadUrl: `/api/v1/files/${fileRow.id}`,
                  }),
                })
              }
            } catch (fileErr) {
              const fileErrorMsg =
                fileErr instanceof Error ? fileErr.message : "XLSX generation failed"
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({ error: redactString(fileErrorMsg), code: "FILE_GEN_ERROR" }),
              })
            }
          }

          // ── Update the placeholder message ──
          const isFailed = !finalUsage && !accumulatedText
          await msgRepo.update(assistantMsgId, {
            content: accumulatedText || "[No response generated]",
            metadata: {
              ...(files.length > 0 ? { files } : {}),
              ...(accumulatedReasoning ? { reasoningContent: accumulatedReasoning } : {}),
              model,
              usage: finalUsage,
              failed: isFailed,
              completedAt: new Date().toISOString(),
              skillUsed: result.metadata.skillUsed,
              memoryEntriesUsed: result.metadata.memoryEntriesUsed,
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
        message: redactString(errorMsg),
        statusCode: 500,
      },
      meta: meta(c),
    }
    return c.json(res, 500)
  }
})
