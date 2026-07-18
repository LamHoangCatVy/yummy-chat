import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm"
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { user } from "./auth"

export type McpConnectionType = "remote_oauth" | "remote_custom" | "local_stdio"

export interface McpStoredConfig {
  readonly [key: string]: unknown
}

export const mcpServer = pgTable(
  "mcp_server",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    connectionType: text("connection_type")
      .$type<McpConnectionType>()
      .notNull()
      .default("remote_custom"),
    url: text("url"),
    config: jsonb("config").$type<McpStoredConfig>().notNull().default(sql`'{}'::jsonb`),
    encryptedSecrets: text("encrypted_secrets"),
    encryptedOauthTokens: text("encrypted_oauth_tokens"),
    encryptedOauthClientInformation: text("encrypted_oauth_client_information"),
    encryptedBearerToken: text("encrypted_bearer_token"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("mcp_server_user_id_idx").on(table.userId)],
)

export const mcpServerRelations = relations(mcpServer, ({ one }) => ({
  user: one(user, {
    fields: [mcpServer.userId],
    references: [user.id],
  }),
}))

export const mcpOauthAttempt = pgTable(
  "mcp_oauth_attempt",
  {
    id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
    serverId: text("server_id")
      .notNull()
      .references(() => mcpServer.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stateHash: text("state_hash").notNull(),
    encryptedCodeVerifier: text("encrypted_code_verifier"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mcp_oauth_attempt_state_hash_uidx").on(table.stateHash),
    index("mcp_oauth_attempt_server_id_idx").on(table.serverId),
    index("mcp_oauth_attempt_user_id_idx").on(table.userId),
  ],
)

export const mcpOauthAttemptRelations = relations(mcpOauthAttempt, ({ one }) => ({
  server: one(mcpServer, {
    fields: [mcpOauthAttempt.serverId],
    references: [mcpServer.id],
  }),
  user: one(user, {
    fields: [mcpOauthAttempt.userId],
    references: [user.id],
  }),
}))
