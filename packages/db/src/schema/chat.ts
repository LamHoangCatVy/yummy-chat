import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm"
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export type ConversationMode = "standard" | "temporary"

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    mode: text("mode").$type<ConversationMode>().notNull().default("standard"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversation_user_mode_idx").on(table.userId, table.mode),
    index("conversation_expires_at_idx").on(table.expiresAt),
  ],
)

export const message = pgTable("message", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: ["system", "user", "assistant"],
  }).notNull(),
  content: text("content").notNull(),
  parentId: text("parent_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  user: one(user, {
    fields: [conversation.userId],
    references: [user.id],
  }),
  messages: many(message),
}))

export const messageRelations = relations(message, ({ one }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id],
  }),
  parent: one(message, {
    fields: [message.parentId],
    references: [message.id],
    relationName: "parent_child",
  }),
}))
