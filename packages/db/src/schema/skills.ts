import { relations, sql } from "drizzle-orm"
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { conversation } from "./chat"

export const skill = pgTable(
  "skill",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().default(""),
    description: text("description").notNull().default(""),
    prompt: text("prompt").notNull().default(""),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    model: text("model").notNull().default(""),
    temperature: real("temperature"),
    maxTokens: integer("max_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("skill_owner_slug_unique").on(table.ownerId, table.slug)],
)

export const conversationSkillSnapshot = pgTable(
  "conversation_skill_snapshot",
  {
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
  },
  (table) => [
    uniqueIndex("conversation_skill_snapshot_conversation_unique").on(table.conversationId),
  ],
)

export const skillResource = pgTable(
  "skill_resource",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    encoding: text("encoding").notNull().default("utf8"),
    mimeType: text("mime_type").notNull().default("text/plain"),
    byteSize: integer("byte_size").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("skill_resource_skill_path_unique").on(table.skillId, table.path)],
)

export const skillRelations = relations(skill, ({ many }) => ({
  snapshots: many(conversationSkillSnapshot),
  resources: many(skillResource),
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

export const skillResourceRelations = relations(skillResource, ({ one }) => ({
  skill: one(skill, {
    fields: [skillResource.skillId],
    references: [skill.id],
  }),
}))
