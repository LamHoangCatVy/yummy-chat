import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm"
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const usageRecord = pgTable("usage_record", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const usageRecordRelations = relations(usageRecord, ({ one }) => ({
  user: one(user, {
    fields: [usageRecord.userId],
    references: [user.id],
  }),
}))
