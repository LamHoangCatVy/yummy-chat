import { and, sql as databaseSql, eq } from "@yummy/db"
import { db } from "@yummy/db"
import {
  conversation,
  memoryEntry,
  memoryEvent,
  memoryHistoryChunk,
  memoryJob,
  memoryPendingAction,
  message,
  userMemorySettings,
} from "@yummy/db/schema"
import type { ConversationId, MemorySource, UserId } from "@yummy/shared"
import { memoryAiClient } from "./client.js"
import type { ExtractedMemory } from "./client.js"
import { evaluateMemorySafety, normalizeMemoryKey } from "./guardrails.js"

const MAX_SAVED_MEMORIES = 500
const MAX_SAVED_CONTEXT = 8
const MAX_HISTORY_CONTEXT = 4
const MAX_CONTEXT_CHARS = 3_200
const SEARCH_STOP_WORDS = new Set([
  "about",
  "and",
  "are",
  "ban",
  "bạn",
  "cho",
  "co",
  "có",
  "cua",
  "của",
  "does",
  "for",
  "from",
  "gi",
  "gì",
  "have",
  "how",
  "khong",
  "không",
  "la",
  "là",
  "my",
  "nao",
  "nào",
  "nhu",
  "như",
  "nhung",
  "những",
  "that",
  "the",
  "this",
  "toi",
  "tôi",
  "what",
  "which",
  "who",
  "with",
  "your",
])

export interface MemoryContext {
  readonly saved: readonly string[]
  readonly history: readonly string[]
  readonly sources: readonly MemorySource[]
}

interface SearchRow {
  readonly id: string
  readonly key: string
  readonly value: string
  readonly conversation_id: string | null
  readonly content: string | null
  readonly score: number
}

interface SaveMemoryInput {
  readonly userId: UserId
  readonly key: string
  readonly value: string
  readonly category: string
  readonly confidence: number
  readonly importance: number
  readonly origin: "manual" | "explicit" | "automatic"
  readonly sourceConversationId?: string | null
  readonly sourceMessageId?: string | null
}

export async function getMemorySettings(userId: UserId) {
  const row = await db
    .select()
    .from(userMemorySettings)
    .where(eq(userMemorySettings.userId, userId))
    .then((rows) => rows[0])
  return {
    savedMemoryEnabled: row?.savedMemoryEnabled ?? false,
    chatHistoryEnabled: row?.chatHistoryEnabled ?? false,
  }
}

export async function retrieveMemoryContext(
  userId: UserId,
  query: string,
  currentConversationId: string,
): Promise<MemoryContext> {
  const settings = await getMemorySettings(userId)
  if (!settings.savedMemoryEnabled || !query.trim()) return { saved: [], history: [], sources: [] }

  let embedding: number[] | null = null
  try {
    embedding = await memoryAiClient.embed(query)
  } catch {
    embedding = null
  }

  const embeddingLiteral = embedding ? `[${embedding.join(",")}]` : null
  const ftsQuery = buildFtsQuery(query)
  const savedRows = embeddingLiteral
    ? await databaseSql<SearchRow[]>`
        SELECT id, key, value, source_conversation_id AS conversation_id, NULL::text AS content,
          (
            COALESCE(1 - (embedding <=> ${embeddingLiteral}::vector), 0) * 0.55 +
            ts_rank_cd(to_tsvector('simple', key || ' ' || value), to_tsquery('simple', ${ftsQuery})) * 0.25 +
            GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - updated_at)) / 31536000) * 0.10 +
            importance * 0.10
          )::float8 AS score
        FROM memory_entry
        WHERE user_id = ${userId} AND status = 'active'
        ORDER BY score DESC, updated_at DESC
        LIMIT ${MAX_SAVED_CONTEXT}
      `
    : await databaseSql<SearchRow[]>`
        SELECT id, key, value, source_conversation_id AS conversation_id, NULL::text AS content,
          (
            ts_rank_cd(to_tsvector('simple', key || ' ' || value), to_tsquery('simple', ${ftsQuery})) * 0.70 +
            GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - updated_at)) / 31536000) * 0.15 +
            importance * 0.15
          )::float8 AS score
        FROM memory_entry
        WHERE user_id = ${userId} AND status = 'active'
        ORDER BY score DESC, updated_at DESC
        LIMIT ${MAX_SAVED_CONTEXT}
      `

  const historyRows = settings.chatHistoryEnabled
    ? embeddingLiteral
      ? await databaseSql<SearchRow[]>`
          SELECT id, ''::text AS key, ''::text AS value, conversation_id,
            content,
            (
              COALESCE(1 - (embedding <=> ${embeddingLiteral}::vector), 0) * 0.65 +
              ts_rank_cd(to_tsvector('simple', content), to_tsquery('simple', ${ftsQuery})) * 0.25 +
              GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - updated_at)) / 15552000) * 0.10
            )::float8 AS score
          FROM memory_history_chunk
          WHERE user_id = ${userId}
            AND conversation_id <> ${currentConversationId}
            AND (
              (embedding IS NOT NULL AND 1 - (embedding <=> ${embeddingLiteral}::vector) >= 0.30)
              OR to_tsvector('simple', content) @@ to_tsquery('simple', ${ftsQuery})
            )
          ORDER BY score DESC, updated_at DESC
          LIMIT ${MAX_HISTORY_CONTEXT}
        `
      : await databaseSql<SearchRow[]>`
          SELECT id, ''::text AS key, ''::text AS value, conversation_id,
            content,
            (
              ts_rank_cd(to_tsvector('simple', content), to_tsquery('simple', ${ftsQuery})) * 0.80 +
              GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - updated_at)) / 15552000) * 0.20
            )::float8 AS score
          FROM memory_history_chunk
          WHERE user_id = ${userId}
            AND conversation_id <> ${currentConversationId}
            AND to_tsvector('simple', content) @@ to_tsquery('simple', ${ftsQuery})
          ORDER BY score DESC, updated_at DESC
          LIMIT ${MAX_HISTORY_CONTEXT}
        `
    : []

  const saved: string[] = []
  const history: string[] = []
  const sources: MemorySource[] = []
  const usedSavedIds: string[] = []
  let usedChars = 0

  for (const row of savedRows) {
    const line = `${row.key}: ${row.value}`
    if (usedChars + line.length > MAX_CONTEXT_CHARS) break
    usedChars += line.length
    saved.push(line)
    usedSavedIds.push(row.id)
    sources.push({
      kind: "saved_memory",
      id: row.id,
      label: row.key,
      ...(row.conversation_id ? { conversationId: row.conversation_id as ConversationId } : {}),
      excerpt: row.value.slice(0, 240),
    })
  }

  for (const row of historyRows) {
    if (!row.content) continue
    const excerpt = row.content.slice(0, 800)
    if (usedChars + excerpt.length > MAX_CONTEXT_CHARS) break
    usedChars += excerpt.length
    history.push(excerpt)
    sources.push({
      kind: "past_chat",
      id: row.id,
      label: "Past conversation",
      ...(row.conversation_id ? { conversationId: row.conversation_id as ConversationId } : {}),
      excerpt: excerpt.slice(0, 240),
    })
  }

  if (usedSavedIds.length > 0) {
    await databaseSql`
      UPDATE memory_entry
      SET use_count = use_count + 1, last_used_at = now()
      WHERE user_id = ${userId} AND id = ANY(${usedSavedIds})
    `
  }

  return { saved, history, sources }
}

export async function saveMemory(input: SaveMemoryInput) {
  const normalizedKey = normalizeMemoryKey(input.key)
  if (!normalizedKey) throw new Error("Memory key is invalid")

  const existing = await db
    .select()
    .from(memoryEntry)
    .where(and(eq(memoryEntry.userId, input.userId), eq(memoryEntry.normalizedKey, normalizedKey)))
    .then((rows) => rows[0])

  if (!existing) {
    const count = await databaseSql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM memory_entry
      WHERE user_id = ${input.userId} AND status = 'active'
    `
    if ((count[0]?.count ?? 0) >= MAX_SAVED_MEMORIES) {
      throw new Error("Saved memory limit reached")
    }
  }

  let embedding: number[] | null = null
  try {
    embedding = await memoryAiClient.embed(`${input.key}: ${input.value}`)
  } catch {
    embedding = null
  }

  const values = {
    userId: input.userId,
    key: input.key,
    normalizedKey,
    value: input.value,
    category: input.category,
    source: input.origin === "automatic" ? "chat" : input.origin,
    origin: input.origin,
    status: "active" as const,
    confidence: input.confidence,
    importance: input.importance,
    embedding,
    sourceConversationId: input.sourceConversationId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    updatedAt: new Date(),
  }

  const row = existing
    ? await db
        .update(memoryEntry)
        .set(values)
        .where(eq(memoryEntry.id, existing.id))
        .returning()
        .then((rows) => rows[0])
    : await db
        .insert(memoryEntry)
        .values(values)
        .returning()
        .then((rows) => rows[0])

  if (row) {
    await db.insert(memoryEvent).values({
      userId: input.userId,
      memoryId: row.id,
      type: existing ? "updated" : "created",
      key: row.key,
    })
  }
  return row
}

export async function forgetMemories(userId: UserId, query: string): Promise<number> {
  const normalized = normalizeMemoryKey(query)
  const rows = await databaseSql<{ id: string; key: string }[]>`
    DELETE FROM memory_entry
    WHERE user_id = ${userId}
      AND (
        normalized_key = ${normalized}
        OR key ILIKE ${`%${query}%`}
        OR value ILIKE ${`%${query}%`}
      )
    RETURNING id, key
  `
  if (rows.length > 0) {
    await db
      .insert(memoryEvent)
      .values(
        rows.map((row) => ({ userId, memoryId: null, type: "deleted" as const, key: row.key })),
      )
  }
  return rows.length
}

export async function createMemoryProposal(input: SaveMemoryInput) {
  return db
    .insert(memoryPendingAction)
    .values({
      userId: input.userId,
      payload: { ...input, userId: undefined },
      expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
    })
    .returning()
    .then((rows) => rows[0])
}

export async function confirmMemoryProposal(userId: UserId, proposalId: string) {
  const proposal = await db
    .select()
    .from(memoryPendingAction)
    .where(
      and(
        eq(memoryPendingAction.id, proposalId),
        eq(memoryPendingAction.userId, userId),
        eq(memoryPendingAction.status, "pending"),
      ),
    )
    .then((rows) => rows[0])
  if (!proposal || proposal.status !== "pending" || proposal.expiresAt <= new Date()) return null

  const payload = proposal.payload
  if (
    typeof payload.key !== "string" ||
    typeof payload.value !== "string" ||
    typeof payload.category !== "string"
  ) {
    return null
  }
  const row = await saveMemory({
    userId,
    key: payload.key,
    value: payload.value,
    category: payload.category,
    confidence: typeof payload.confidence === "number" ? payload.confidence : 1,
    importance: typeof payload.importance === "number" ? payload.importance : 1,
    origin: "explicit",
    sourceConversationId:
      typeof payload.sourceConversationId === "string" ? payload.sourceConversationId : null,
    sourceMessageId: typeof payload.sourceMessageId === "string" ? payload.sourceMessageId : null,
  })
  await db
    .update(memoryPendingAction)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(memoryPendingAction.id, proposal.id))
  return row
}

export async function cancelMemoryProposal(userId: UserId, proposalId: string): Promise<boolean> {
  const rows = await db
    .update(memoryPendingAction)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(memoryPendingAction.id, proposalId), eq(memoryPendingAction.userId, userId)))
    .returning({ id: memoryPendingAction.id })
  return rows.length > 0
}

export async function enqueueMemoryJob(
  type: "extract" | "index_history" | "backfill" | "purge_history" | "cleanup",
  userId: UserId | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(memoryJob).values({ type, userId, payload })
}

export async function processExtractionJob(
  userId: UserId,
  userMessageId: string,
  assistantMessageId: string,
): Promise<void> {
  const settings = await getMemorySettings(userId)
  if (!settings.savedMemoryEnabled) return
  const rows = await db.select().from(message).where(eq(message.id, userMessageId))
  const assistantRows = await db.select().from(message).where(eq(message.id, assistantMessageId))
  const userMessage = rows[0]
  const assistantMessage = assistantRows[0]
  if (
    !userMessage ||
    !assistantMessage ||
    userMessage.role !== "user" ||
    assistantMessage.role !== "assistant" ||
    userMessage.conversationId !== assistantMessage.conversationId
  ) {
    return
  }
  const owner = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(
      and(
        eq(conversation.id, userMessage.conversationId),
        eq(conversation.userId, userId),
        eq(conversation.mode, "standard"),
      ),
    )
    .then((rows) => rows[0])
  if (!owner) return

  const candidates = await memoryAiClient.extract(userMessage.content, assistantMessage.content)
  for (const candidate of candidates) {
    if (candidate.confidence < 0.85 || candidate.importance < 0.6) continue
    if (evaluateMemorySafety(candidate, false) !== "allow") continue
    await saveMemory({
      userId,
      ...candidate,
      origin: "automatic",
      sourceMessageId: userMessage.id,
      sourceConversationId: userMessage.conversationId,
    })
  }
}

export async function processHistoryIndexJob(
  userId: UserId,
  userMessageId: string,
  assistantMessageId: string,
): Promise<void> {
  const settings = await getMemorySettings(userId)
  if (!settings.chatHistoryEnabled) return
  const userMessage = await db
    .select()
    .from(message)
    .where(eq(message.id, userMessageId))
    .then((rows) => rows[0])
  const assistantMessage = await db
    .select()
    .from(message)
    .where(eq(message.id, assistantMessageId))
    .then((rows) => rows[0])
  if (
    !userMessage ||
    !assistantMessage ||
    userMessage.conversationId !== assistantMessage.conversationId
  ) {
    return
  }
  const owner = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.id, userMessage.conversationId),
        eq(conversation.userId, userId),
        eq(conversation.mode, "standard"),
      ),
    )
    .then((rows) => rows[0])
  if (!owner) return

  const content = `User: ${userMessage.content}\nAssistant: ${assistantMessage.content}`.slice(
    0,
    12_000,
  )
  let embedding: number[] | null = null
  try {
    embedding = await memoryAiClient.embed(content)
  } catch {
    embedding = null
  }
  await db
    .insert(memoryHistoryChunk)
    .values({
      userId,
      conversationId: owner.id,
      userMessageId,
      assistantMessageId,
      content,
      embedding,
      tokenCount: Math.ceil(content.length / 4),
    })
    .onConflictDoUpdate({
      target: [
        memoryHistoryChunk.userId,
        memoryHistoryChunk.userMessageId,
        memoryHistoryChunk.assistantMessageId,
      ],
      set: { content, embedding, tokenCount: Math.ceil(content.length / 4), updatedAt: new Date() },
    })
}

export async function enqueueHistoryBackfill(userId: UserId): Promise<void> {
  const exchanges = await databaseSql<{ user_message_id: string; assistant_message_id: string }[]>`
    SELECT user_message.id AS user_message_id, assistant_message.id AS assistant_message_id
    FROM message AS user_message
    JOIN conversation ON conversation.id = user_message.conversation_id
    JOIN LATERAL (
      SELECT id
      FROM message
      WHERE conversation_id = user_message.conversation_id
        AND role = 'assistant'
        AND created_at >= user_message.created_at
      ORDER BY created_at ASC
      LIMIT 1
    ) AS assistant_message ON true
    WHERE conversation.user_id = ${userId}
      AND conversation.mode = 'standard'
      AND user_message.role = 'user'
  `
  for (const exchange of exchanges) {
    await enqueueMemoryJob("index_history", userId, {
      userMessageId: exchange.user_message_id,
      assistantMessageId: exchange.assistant_message_id,
    })
  }
}

export async function purgeHistory(userId: UserId): Promise<void> {
  await db.delete(memoryHistoryChunk).where(eq(memoryHistoryChunk.userId, userId))
}

export async function autoSaveCandidate(userId: UserId, candidate: ExtractedMemory) {
  if (evaluateMemorySafety(candidate, false) !== "allow") return null
  return saveMemory({ userId, ...candidate, origin: "automatic" })
}

function buildFtsQuery(query: string): string {
  const tokens = query
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 2 && !SEARCH_STOP_WORDS.has(token))
    .slice(0, 12)
  return tokens?.length ? tokens.map((token) => `${token}:*`).join(" | ") : ""
}
