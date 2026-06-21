import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm"
import { customType, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { conversation, message } from "./chat"

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea"
  },
})

export const generatedChatFile = pgTable("generated_chat_file", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  messageId: text("message_id").references(() => message.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  content: bytea("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const generatedChatFileRelations = relations(generatedChatFile, ({ one }) => ({
  user: one(user, {
    fields: [generatedChatFile.userId],
    references: [user.id],
  }),
  conversation: one(conversation, {
    fields: [generatedChatFile.conversationId],
    references: [conversation.id],
  }),
  message: one(message, {
    fields: [generatedChatFile.messageId],
    references: [message.id],
  }),
}))
