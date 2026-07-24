import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { conversation, message } from "./chat"

export type MemoryOrigin = "manual" | "explicit" | "automatic"
export type MemoryStatus = "active" | "archived"
export type MemoryJobType = "extract" | "index_history" | "backfill" | "purge_history" | "cleanup"
export type MemoryJobStatus = "pending" | "processing" | "completed" | "failed"
export type MemoryEventType = "created" | "updated" | "deleted"
export type MemoryProposalStatus = "pending" | "confirmed" | "cancelled" | "expired"

export const memoryEntry = pgTable(
  "memory_entry",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    normalizedKey: text("normalized_key").notNull().default(""),
    value: text("value").notNull(),
    category: text("category"),
    source: text("source"),
    origin: text("origin").$type<MemoryOrigin>().notNull().default("manual"),
    status: text("status").$type<MemoryStatus>().notNull().default("active"),
    confidence: real("confidence"),
    importance: real("importance").notNull().default(0.5),
    embedding: vector("embedding", { dimensions: 1536 }),
    sourceConversationId: text("source_conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    sourceMessageId: text("source_message_id").references(() => message.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_entry_user_normalized_key_uidx").on(table.userId, table.normalizedKey),
    index("memory_entry_user_status_idx").on(table.userId, table.status),
  ],
)

export const userMemorySettings = pgTable("user_memory_settings", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  savedMemoryEnabled: boolean("saved_memory_enabled").notNull().default(false),
  chatHistoryEnabled: boolean("chat_history_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const memoryHistoryChunk = pgTable(
  "memory_history_chunk",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userMessageId: text("user_message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    assistantMessageId: text("assistant_message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    tokenCount: integer("token_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_history_chunk_exchange_uidx").on(
      table.userId,
      table.userMessageId,
      table.assistantMessageId,
    ),
    index("memory_history_chunk_user_idx").on(table.userId),
    index("memory_history_chunk_conversation_idx").on(table.conversationId),
  ],
)

export const memoryJob = pgTable(
  "memory_job",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<MemoryJobType>().notNull(),
    status: text("status").$type<MemoryJobStatus>().notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memory_job_claim_idx").on(table.status, table.runAfter)],
)

export const memoryEvent = pgTable(
  "memory_event",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    memoryId: text("memory_id"),
    type: text("type").$type<MemoryEventType>().notNull(),
    key: text("key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memory_event_user_created_idx").on(table.userId, table.createdAt)],
)

export const memoryPendingAction = pgTable(
  "memory_pending_action",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<MemoryProposalStatus>().notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memory_pending_action_user_idx").on(table.userId, table.status)],
)

export const memoryEntryRelations = relations(memoryEntry, ({ one }) => ({
  user: one(user, {
    fields: [memoryEntry.userId],
    references: [user.id],
  }),
  sourceConversation: one(conversation, {
    fields: [memoryEntry.sourceConversationId],
    references: [conversation.id],
  }),
  sourceMessage: one(message, {
    fields: [memoryEntry.sourceMessageId],
    references: [message.id],
  }),
}))

export const userMemorySettingsRelations = relations(userMemorySettings, ({ one }) => ({
  user: one(user, {
    fields: [userMemorySettings.userId],
    references: [user.id],
  }),
}))

export const memoryHistoryChunkRelations = relations(memoryHistoryChunk, ({ one }) => ({
  user: one(user, {
    fields: [memoryHistoryChunk.userId],
    references: [user.id],
  }),
  conversation: one(conversation, {
    fields: [memoryHistoryChunk.conversationId],
    references: [conversation.id],
  }),
}))
