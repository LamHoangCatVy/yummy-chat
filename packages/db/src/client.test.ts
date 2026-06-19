import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { sql } from "./client.js"
import * as schema from "./schema/index.js"

describe("@yummy/db", () => {
  beforeAll(async () => {
    await sql`DROP SCHEMA IF EXISTS public CASCADE`
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`
    await sql`CREATE SCHEMA public`
  })

  afterAll(async () => {
    await sql.end()
  })

  it("runs migrations idempotently", async () => {
    const testDb = drizzle(sql, { schema })
    await migrate(testDb, { migrationsFolder: "./drizzle" })
    await migrate(testDb, { migrationsFolder: "./drizzle" })

    const tables = await sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `
    const names = tables.map((row: Record<string, string>) => row.tablename)
    expect(names.includes("user")).toBe(true)
    expect(names.includes("session")).toBe(true)
    expect(names.includes("account")).toBe(true)
    expect(names.includes("verification")).toBe(true)
    expect(names.includes("conversation")).toBe(true)
    expect(names.includes("message")).toBe(true)
    expect(names.includes("skill")).toBe(true)
    expect(names.includes("conversation_skill_snapshot")).toBe(true)
    expect(names.includes("memory_entry")).toBe(true)
    expect(names.includes("user_memory_settings")).toBe(true)
    expect(names.includes("audit_event")).toBe(true)
    expect(names.includes("usage_record")).toBe(true)
  })

  it("rejects duplicate user email", async () => {
    await sql`INSERT INTO "user" (id, name, email) VALUES ('a1', 'A', 'dup@x.com')`

    let threw = false
    try {
      await sql`INSERT INTO "user" (id, name, email) VALUES ('a2', 'B', 'dup@x.com')`
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it("rejects orphan message (FK constraint)", async () => {
    let threw = false
    try {
      await sql`
        INSERT INTO message (id, conversation_id, role, content)
        VALUES ('m1', 'nonexistent', 'user', 'hello')
      `
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
