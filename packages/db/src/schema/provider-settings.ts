import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm"
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export type AiProviderKind = "openai" | "anthropic" | "google" | "openai-compatible"

export const aiProviders = pgTable("ai_providers", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  providerKind: text("provider_kind").$type<AiProviderKind>().notNull(),
  displayName: text("display_name").notNull(),
  encryptedApiKey: text("encrypted_api_key"),
  endpoint: text("endpoint"),
  selectedModel: text("selected_model"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const aiProvidersRelations = relations(aiProviders, ({ one }) => ({
  user: one(user, {
    fields: [aiProviders.userId],
    references: [user.id],
  }),
}))
