/**
 * Chat orchestration service.
 *
 * Assembles the prompt context from conversation history, optional skill
 * prompt, and optional memory entries, then delegates to the LLM provider.
 * Manages token budget by truncating older history when necessary.
 */

import { eq } from "@yummy/db"
import { db } from "@yummy/db"
import { memoryEntry, usageRecord, userMemorySettings } from "@yummy/db/schema"
import type { ConversationId, MessageId, SkillId, UserId } from "@yummy/shared"
import type { Actor } from "../authz.js"
import type {
  LLMProvider,
  ProviderMessage,
  StreamChunk,
  StreamRequest,
  UsageMetadata,
} from "../llm/provider.js"
import { type MessageRow, messageRepository, skillRepository } from "../repositories.js"

// ── Constants ───────────────────────────────────────────────────────────────

/** Rough token estimation: 1 token ≈ 4 characters. */
const CHARS_PER_TOKEN = 4

/** Default maximum token budget for the prompt context. */
const DEFAULT_TOKEN_BUDGET = 4000

/** Reserved tokens for system prompt + skill + memory overhead. */
const SYSTEM_OVERHEAD_TOKENS = 200

// ── Types ───────────────────────────────────────────────────────────────────

export interface OrchestrateRequest {
  readonly conversationId: ConversationId
  readonly userMessage: string
  readonly model: string
  readonly skillId?: SkillId
  readonly memoryEnabled?: boolean
}

export interface OrchestrateResult {
  readonly stream: AsyncIterable<StreamChunk>
  readonly assembledMessages: readonly ProviderMessage[]
  readonly systemPrompt: string
  readonly metadata: OrchestrateMetadata
}

export interface OrchestrateMetadata {
  readonly skillUsed: string | null
  readonly memoryEntriesUsed: number
  readonly historyMessagesIncluded: number
  readonly historyMessagesTruncated: number
  readonly estimatedInputTokens: number
}

export interface OrchestratorDeps {
  readonly provider: LLMProvider
  readonly tokenBudget?: number
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export function createOrchestrator(deps: OrchestratorDeps) {
  const { provider, tokenBudget = DEFAULT_TOKEN_BUDGET } = deps

  return {
    async orchestrate(
      request: OrchestrateRequest,
      actor: Actor,
      signal?: AbortSignal,
    ): Promise<OrchestrateResult> {
      // 1. Load conversation history
      const msgRepo = messageRepository(request.conversationId)
      const historyResult = await msgRepo.listPaginated(100)
      const allHistory = [...historyResult.data].reverse() // oldest first

      // 2. Load skill if specified
      let skillPrompt: string | null = null
      let skillName: string | null = null
      if (request.skillId) {
        const skRepo = skillRepository(actor)
        const skillRow = await skRepo.getById(request.skillId)
        if (skillRow) {
          skillPrompt = skillRow.prompt
          skillName = skillRow.name
        }
      }

      // 3. Load memory if enabled
      let memoryEntries: readonly string[] = []
      if (request.memoryEnabled) {
        const memEnabled = await isMemoryEnabled(actor.userId)
        if (memEnabled) {
          const memRows = await loadMemoryEntries(actor.userId)
          memoryEntries = memRows.map((m) => `${m.key}: ${m.value}`)
        }
      }

      // 4. Assemble system prompt
      const systemPrompt = buildSystemPrompt(skillPrompt, memoryEntries)

      // 5. Build messages with budget truncation
      const { messages, included, truncated } = buildMessagesWithBudget(
        allHistory,
        request.userMessage,
        systemPrompt,
        tokenBudget,
      )

      // 6. Create provider request
      const providerRequest: StreamRequest = {
        messages,
        model: request.model,
        systemPrompt,
      }

      // 7. Estimate input tokens
      const estimatedInputTokens = estimateTokens(
        systemPrompt + messages.map((m) => m.content).join(" "),
      )

      const metadata: OrchestrateMetadata = {
        skillUsed: skillName,
        memoryEntriesUsed: memoryEntries.length,
        historyMessagesIncluded: included,
        historyMessagesTruncated: truncated,
        estimatedInputTokens,
      }

      // 8. Return stream + metadata
      return {
        stream: provider.stream(providerRequest, signal),
        assembledMessages: messages,
        systemPrompt,
        metadata,
      }
    },

    /**
     * Record usage after a chat run completes.
     */
    async recordUsage(params: {
      userId: UserId
      model: string
      usage: UsageMetadata
    }): Promise<void> {
      await db.insert(usageRecord).values({
        userId: params.userId,
        model: params.model,
        inputTokens: params.usage.inputTokens,
        outputTokens: params.usage.outputTokens,
      })
    },

    /**
     * Mark a message as failed in metadata.
     */
    async markMessageFailed(messageId: MessageId): Promise<void> {
      await db
        .update(
          // Use raw table reference via messageRepository's conversation scope
          // We need a generic update here
          (await import("@yummy/db/schema")).message,
        )
        .set({
          metadata: { failed: true, failedAt: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq((await import("@yummy/db/schema")).message.id, messageId))
    },
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function isMemoryEnabled(userId: UserId): Promise<boolean> {
  const row = await db
    .select()
    .from(userMemorySettings)
    .where(eq(userMemorySettings.userId, userId))
    .then((rows) => rows[0])
  return row?.enabled ?? false
}

async function loadMemoryEntries(userId: UserId) {
  return db.select().from(memoryEntry).where(eq(memoryEntry.userId, userId)).limit(20)
}

function buildSystemPrompt(skillPrompt: string | null, memoryEntries: readonly string[]): string {
  const parts: string[] = ["You are a helpful assistant."]

  if (skillPrompt) {
    parts.push(`\n## Skill Instructions\n${skillPrompt}`)
  }

  if (memoryEntries.length > 0) {
    const memBlock = memoryEntries.map((m) => `- ${m}`).join("\n")
    parts.push(`\n## User Memory\n${memBlock}`)
  }

  return parts.join("\n")
}

function buildMessagesWithBudget(
  history: readonly MessageRow[],
  newUserMessage: string,
  systemPrompt: string,
  budget: number,
): {
  messages: ProviderMessage[]
  included: number
  truncated: number
} {
  const availableBudget = budget - estimateTokens(systemPrompt) - SYSTEM_OVERHEAD_TOKENS

  // Start from the most recent history and work backwards
  const messages: ProviderMessage[] = []
  let usedTokens = 0
  let included = 0

  // Add user message first (always included)
  const userMsgTokens = estimateTokens(newUserMessage)
  messages.push({ role: "user", content: newUserMessage })
  usedTokens += userMsgTokens
  included = 0 // history messages included

  // Add history from most recent to oldest, within budget
  const reversedHistory = [...history].reverse()
  for (const msg of reversedHistory) {
    const msgTokens = estimateTokens(msg.content)
    if (usedTokens + msgTokens > availableBudget) {
      break
    }
    messages.splice(1, 0, { role: msg.role, content: msg.content })
    usedTokens += msgTokens
    included++
  }

  const truncated = history.length - included

  return { messages, included, truncated }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
