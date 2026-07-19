import { and, asc, desc, eq, gt, lt } from "@yummy/db"
import { db } from "@yummy/db"
import {
  conversation,
  conversationSkillSnapshot,
  generatedChatFile,
  memoryEntry,
  message,
  skill,
  skillResource,
  userApiSettings,
  userMemorySettings,
} from "@yummy/db/schema"
import type { ConversationId, MemoryId, MessageId, SkillId } from "@yummy/shared"
import type { Actor } from "./authz.js"

// ── Inferred row types ──────────────────────────────────────────────────────

export type ConversationRow = typeof conversation.$inferSelect
export type MessageRow = typeof message.$inferSelect
export type MemoryEntryRow = typeof memoryEntry.$inferSelect
export type SkillRow = typeof skill.$inferSelect
export type SkillResourceRow = typeof skillResource.$inferSelect
export type UserApiSettingsRow = typeof userApiSettings.$inferSelect

// ── Paginated result shape ──────────────────────────────────────────────────

export interface PaginatedResult<T> {
  readonly data: readonly T[]
  readonly nextCursor: string | null
}

// ── Conversation repository (owner-scoped) ──────────────────────────────────

export function conversationRepository(actor: Actor) {
  return {
    list(): Promise<ConversationRow[]> {
      return db.select().from(conversation).where(eq(conversation.userId, actor.userId))
    },

    listPaginated(limit: number, cursor?: string): Promise<PaginatedResult<ConversationRow>> {
      const conditions = [eq(conversation.userId, actor.userId)]
      if (cursor) {
        conditions.push(lt(conversation.id, cursor))
      }
      return db
        .select()
        .from(conversation)
        .where(and(...conditions))
        .orderBy(desc(conversation.id))
        .limit(limit + 1)
        .then((rows) => {
          const hasMore = rows.length > limit
          const data = hasMore ? rows.slice(0, limit) : rows
          const lastItem = data[data.length - 1]
          return {
            data,
            nextCursor: hasMore && lastItem ? lastItem.id : null,
          }
        })
    },

    getById(id: ConversationId): Promise<ConversationRow | undefined> {
      return db
        .select()
        .from(conversation)
        .where(and(eq(conversation.id, id), eq(conversation.userId, actor.userId)))
        .then((rows) => rows[0])
    },

    create(data: {
      id: ConversationId
      title: string
    }): Promise<ConversationRow | undefined> {
      return db
        .insert(conversation)
        .values({
          id: data.id,
          userId: actor.userId,
          title: data.title,
        })
        .returning()
        .then((rows) => rows[0])
    },

    update(id: ConversationId, data: { title: string }): Promise<ConversationRow | undefined> {
      return db
        .update(conversation)
        .set({ title: data.title, updatedAt: new Date() })
        .where(and(eq(conversation.id, id), eq(conversation.userId, actor.userId)))
        .returning()
        .then((rows) => rows[0])
    },

    delete(id: ConversationId): Promise<boolean> {
      return db
        .delete(conversation)
        .where(and(eq(conversation.id, id), eq(conversation.userId, actor.userId)))
        .returning()
        .then((rows) => rows.length > 0)
    },
  }
}

// ── Message repository (conversation-scoped) ────────────────────────────────

export function messageRepository(conversationId: ConversationId) {
  return {
    listPaginated(limit: number, cursor?: string): Promise<PaginatedResult<MessageRow>> {
      const conditions = [eq(message.conversationId, conversationId)]
      if (cursor) {
        conditions.push(gt(message.createdAt, new Date(cursor)))
      }
      return db
        .select()
        .from(message)
        .where(and(...conditions))
        .orderBy(asc(message.createdAt))
        .limit(limit + 1)
        .then((rows) => {
          const hasMore = rows.length > limit
          const data = hasMore ? rows.slice(0, limit) : rows
          const lastItem = data[data.length - 1]
          return {
            data,
            nextCursor: hasMore && lastItem ? lastItem.createdAt.toISOString() : null,
          }
        })
    },

    create(data: {
      id: MessageId
      role: "system" | "user" | "assistant"
      content: string
      parentId?: string
      metadata?: Record<string, unknown>
    }): Promise<MessageRow | undefined> {
      return db
        .insert(message)
        .values({
          id: data.id,
          conversationId,
          role: data.role,
          content: data.content,
          parentId: data.parentId ?? null,
          metadata: data.metadata ?? null,
        })
        .returning()
        .then((rows) => rows[0])
    },

    update(
      id: string,
      data: { content?: string; metadata?: Record<string, unknown> },
    ): Promise<MessageRow | undefined> {
      const setData: Record<string, unknown> = { updatedAt: new Date() }
      if (data.content !== undefined) setData.content = data.content
      if (data.metadata !== undefined) setData.metadata = data.metadata
      return db
        .update(message)
        .set(setData)
        .where(and(eq(message.id, id), eq(message.conversationId, conversationId)))
        .returning()
        .then((rows) => rows[0])
    },
  }
}

// ── Memory repository (owner-scoped) ────────────────────────────────────────

export function memoryRepository(actor: Actor) {
  return {
    list(): Promise<MemoryEntryRow[]> {
      return db.select().from(memoryEntry).where(eq(memoryEntry.userId, actor.userId))
    },

    getById(id: MemoryId): Promise<MemoryEntryRow | undefined> {
      return db
        .select()
        .from(memoryEntry)
        .where(and(eq(memoryEntry.id, id), eq(memoryEntry.userId, actor.userId)))
        .then((rows) => rows[0])
    },

    upsert(data: {
      id: MemoryId
      key: string
      value: string
      category?: string | null
      source?: string | null
      confidence?: number | null
    }): Promise<MemoryEntryRow | undefined> {
      const setData: Record<string, unknown> = { value: data.value, updatedAt: new Date() }
      if (data.category !== undefined) setData.category = data.category
      if (data.source !== undefined) setData.source = data.source
      if (data.confidence !== undefined) setData.confidence = data.confidence
      if (data.key !== undefined) setData.key = data.key
      return db
        .insert(memoryEntry)
        .values({
          id: data.id,
          userId: actor.userId,
          key: data.key,
          value: data.value,
          category: data.category ?? null,
          source: data.source ?? null,
          confidence: data.confidence ?? null,
        })
        .onConflictDoUpdate({
          target: memoryEntry.id,
          set: setData,
        })
        .returning()
        .then((rows) => rows[0])
    },

    delete(id: MemoryId): Promise<boolean> {
      return db
        .delete(memoryEntry)
        .where(and(eq(memoryEntry.id, id), eq(memoryEntry.userId, actor.userId)))
        .returning()
        .then((rows) => rows.length > 0)
    },

    // ── Settings ─────────────────────────────────────────────────────────

    getSettings(): Promise<
      { id: string; userId: string; enabled: boolean; createdAt: Date; updatedAt: Date } | undefined
    > {
      return db
        .select()
        .from(userMemorySettings)
        .where(eq(userMemorySettings.userId, actor.userId))
        .then((rows) => rows[0])
    },

    upsertSettings(data: {
      enabled: boolean
    }): Promise<
      { id: string; userId: string; enabled: boolean; createdAt: Date; updatedAt: Date } | undefined
    > {
      return db
        .insert(userMemorySettings)
        .values({
          userId: actor.userId,
          enabled: data.enabled,
        })
        .onConflictDoUpdate({
          target: userMemorySettings.userId,
          set: { enabled: data.enabled, updatedAt: new Date() },
        })
        .returning()
        .then((rows) => rows[0])
    },
  }
}

// ── Skill repository (owner-scoped) ─────────────────────────────────────────

export function skillRepository(actor: Actor) {
  const getOwnedSkill = (id: SkillId): Promise<SkillRow | undefined> =>
    db
      .select()
      .from(skill)
      .where(and(eq(skill.id, id), eq(skill.ownerId, actor.userId)))
      .then((rows) => rows[0])

  return {
    list(): Promise<SkillRow[]> {
      return db.select().from(skill).where(eq(skill.ownerId, actor.userId))
    },

    listEnabled(): Promise<SkillRow[]> {
      return db
        .select()
        .from(skill)
        .where(and(eq(skill.ownerId, actor.userId), eq(skill.enabled, true)))
    },

    getById(id: SkillId): Promise<SkillRow | undefined> {
      return getOwnedSkill(id)
    },

    getBySlug(slug: string): Promise<SkillRow | undefined> {
      return db
        .select()
        .from(skill)
        .where(and(eq(skill.slug, slug), eq(skill.ownerId, actor.userId)))
        .then((rows) => rows[0])
    },

    create(data: {
      id: SkillId
      name: string
      slug: string
      description: string
      prompt: string
      manifest?: Record<string, unknown>
      enabled?: boolean
      model: string
      temperature?: number | null
      maxTokens?: number | null
    }): Promise<SkillRow | undefined> {
      return db
        .insert(skill)
        .values({
          id: data.id,
          ownerId: actor.userId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          prompt: data.prompt,
          manifest: data.manifest ?? {},
          enabled: data.enabled ?? true,
          model: data.model,
          temperature: data.temperature ?? null,
          maxTokens: data.maxTokens ?? null,
        })
        .returning()
        .then((rows) => rows[0])
    },

    update(
      id: SkillId,
      data: {
        name?: string
        slug?: string
        description?: string
        prompt?: string
        manifest?: Record<string, unknown>
        enabled?: boolean
        model?: string
        temperature?: number | null
        maxTokens?: number | null
      },
    ): Promise<SkillRow | undefined> {
      const setData: Record<string, unknown> = { updatedAt: new Date() }
      if (data.name !== undefined) setData.name = data.name
      if (data.slug !== undefined) setData.slug = data.slug
      if (data.description !== undefined) setData.description = data.description
      if (data.prompt !== undefined) setData.prompt = data.prompt
      if (data.manifest !== undefined) setData.manifest = data.manifest
      if (data.enabled !== undefined) setData.enabled = data.enabled
      if (data.model !== undefined) setData.model = data.model
      if (data.temperature !== undefined) setData.temperature = data.temperature
      if (data.maxTokens !== undefined) setData.maxTokens = data.maxTokens
      return db
        .update(skill)
        .set(setData)
        .where(and(eq(skill.id, id), eq(skill.ownerId, actor.userId)))
        .returning()
        .then((rows) => rows[0])
    },

    delete(id: SkillId): Promise<boolean> {
      return db
        .delete(skill)
        .where(and(eq(skill.id, id), eq(skill.ownerId, actor.userId)))
        .returning()
        .then((rows) => rows.length > 0)
    },

    async listResources(id: SkillId): Promise<SkillResourceRow[]> {
      if (!(await getOwnedSkill(id))) return []
      return db
        .select()
        .from(skillResource)
        .where(eq(skillResource.skillId, id))
        .orderBy(asc(skillResource.path))
    },

    async getResource(id: SkillId, resourcePath: string): Promise<SkillResourceRow | undefined> {
      if (!(await getOwnedSkill(id))) return undefined
      return db
        .select()
        .from(skillResource)
        .where(and(eq(skillResource.skillId, id), eq(skillResource.path, resourcePath)))
        .then((rows) => rows[0])
    },

    async replaceResources(
      id: SkillId,
      resources: readonly {
        path: string
        content: string
        encoding: string
        mimeType: string
        byteSize: number
      }[],
    ): Promise<boolean> {
      if (!(await getOwnedSkill(id))) return false
      await db.transaction(async (tx) => {
        await tx.delete(skillResource).where(eq(skillResource.skillId, id))
        if (resources.length > 0) {
          await tx.insert(skillResource).values(
            resources.map((resource) => ({
              skillId: id,
              path: resource.path,
              content: resource.content,
              encoding: resource.encoding,
              mimeType: resource.mimeType,
              byteSize: resource.byteSize,
            })),
          )
        }
      })
      return true
    },

    // ── Conversation skill snapshot ──────────────────────────────────────

    getConversationSkill(
      conversationId: string,
    ): Promise<{ skillId: string; skillName: string; skillConfig: string | null } | undefined> {
      return db
        .select({
          skillId: conversationSkillSnapshot.skillId,
          skillName: conversationSkillSnapshot.skillName,
          skillConfig: conversationSkillSnapshot.skillConfig,
        })
        .from(conversationSkillSnapshot)
        .innerJoin(skill, eq(conversationSkillSnapshot.skillId, skill.id))
        .where(
          and(
            eq(conversationSkillSnapshot.conversationId, conversationId),
            eq(skill.ownerId, actor.userId),
            eq(skill.enabled, true),
          ),
        )
        .then((rows) => rows[0])
    },

    setConversationSkill(
      conversationId: string,
      skillId: string,
      skillName: string,
      skillConfig?: string | null,
    ): Promise<{ skillId: string; skillName: string; skillConfig: string | null } | undefined> {
      return db
        .insert(conversationSkillSnapshot)
        .values({
          conversationId,
          skillId,
          skillName,
          skillConfig: skillConfig ?? null,
        })
        .onConflictDoUpdate({
          target: conversationSkillSnapshot.conversationId,
          set: {
            skillId,
            skillName,
            skillConfig: skillConfig ?? null,
          },
        })
        .returning()
        .then((rows) => rows[0])
    },

    deleteConversationSkill(conversationId: string): Promise<boolean> {
      return db
        .delete(conversationSkillSnapshot)
        .where(eq(conversationSkillSnapshot.conversationId, conversationId))
        .returning()
        .then((rows) => rows.length > 0)
    },
  }
}

// ── API settings repository (owner-scoped) ──────────────────────────────────

export function apiSettingsRepository(actor: Actor) {
  return {
    get(): Promise<UserApiSettingsRow | undefined> {
      return db
        .select()
        .from(userApiSettings)
        .where(eq(userApiSettings.userId, actor.userId))
        .then((rows) => rows[0])
    },

    upsert(data: {
      encryptedApiKey?: string | null
      endpoint?: string | null
      selectedModel?: string | null
    }): Promise<UserApiSettingsRow | undefined> {
      const setData: Record<string, unknown> = { updatedAt: new Date() }
      if (data.encryptedApiKey !== undefined) setData.encryptedApiKey = data.encryptedApiKey
      if (data.endpoint !== undefined) setData.endpoint = data.endpoint
      if (data.selectedModel !== undefined) setData.selectedModel = data.selectedModel
      return db
        .insert(userApiSettings)
        .values({
          userId: actor.userId,
          encryptedApiKey: data.encryptedApiKey ?? null,
          endpoint: data.endpoint ?? null,
          selectedModel: data.selectedModel ?? null,
        })
        .onConflictDoUpdate({
          target: userApiSettings.userId,
          set: setData,
        })
        .returning()
        .then((rows) => rows[0])
    },

    delete(): Promise<boolean> {
      return db
        .delete(userApiSettings)
        .where(eq(userApiSettings.userId, actor.userId))
        .returning()
        .then((rows) => rows.length > 0)
    },
  }
}

export type GeneratedChatFileRow = typeof generatedChatFile.$inferSelect

export function generatedFileRepository(actor: Actor) {
  return {
    create(data: {
      id: string
      userId: string
      conversationId: string
      messageId?: string
      filename: string
      mimeType: string
      byteSize: number
      content: Buffer
      metadata?: Record<string, unknown>
    }): Promise<GeneratedChatFileRow | undefined> {
      return db
        .insert(generatedChatFile)
        .values({
          id: data.id,
          userId: data.userId,
          conversationId: data.conversationId,
          messageId: data.messageId ?? null,
          filename: data.filename,
          mimeType: data.mimeType,
          byteSize: data.byteSize,
          content: data.content,
          metadata: data.metadata ?? null,
        })
        .returning()
        .then((rows) => rows[0])
    },

    getById(id: string): Promise<GeneratedChatFileRow | undefined> {
      return db
        .select()
        .from(generatedChatFile)
        .where(and(eq(generatedChatFile.id, id), eq(generatedChatFile.userId, actor.userId)))
        .then((rows) => rows[0])
    },
  }
}
