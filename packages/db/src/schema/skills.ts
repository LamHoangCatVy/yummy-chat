import { relations, sql } from "drizzle-orm"
import { integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { conversation } from "./chat"

export const skill = pgTable("skill", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull().default(""),
  model: text("model").notNull().default(""),
  temperature: real("temperature"),
  maxTokens: integer("max_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const conversationSkillSnapshot = pgTable("conversation_skill_snapshot", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  skillId: text("skill_id")
    .notNull()
    .references(() => skill.id, { onDelete: "cascade" }),
  skillName: text("skill_name").notNull(),
  skillConfig: text("skill_config"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const skillRelations = relations(skill, ({ many }) => ({
  snapshots: many(conversationSkillSnapshot),
}))

export const conversationSkillSnapshotRelations = relations(
  conversationSkillSnapshot,
  ({ one }) => ({
    conversation: one(conversation, {
      fields: [conversationSkillSnapshot.conversationId],
      references: [conversation.id],
    }),
    skill: one(skill, {
      fields: [conversationSkillSnapshot.skillId],
      references: [skill.id],
    }),
  }),
)
