import { sql } from "drizzle-orm"
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const auditEvent = pgTable("audit_event", {
  id: text("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  resource: text("resource"),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
