import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm"
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const userApiSettings = pgTable("user_api_settings", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  encryptedApiKey: text("encrypted_api_key"),
  endpoint: text("endpoint"),
  selectedModel: text("selected_model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const userApiSettingsRelations = relations(userApiSettings, ({ one }) => ({
  user: one(user, {
    fields: [userApiSettings.userId],
    references: [user.id],
  }),
}))
