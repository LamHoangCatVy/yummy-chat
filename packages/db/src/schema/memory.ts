import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm"
import { boolean, pgTable, real, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const memoryEntry = pgTable("memory_entry", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  category: text("category"),
  source: text("source"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const userMemorySettings = pgTable("user_memory_settings", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const memoryEntryRelations = relations(memoryEntry, ({ one }) => ({
  user: one(user, {
    fields: [memoryEntry.userId],
    references: [user.id],
  }),
}))

export const userMemorySettingsRelations = relations(userMemorySettings, ({ one }) => ({
  user: one(user, {
    fields: [userMemorySettings.userId],
    references: [user.id],
  }),
}))
