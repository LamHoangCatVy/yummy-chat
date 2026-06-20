import * as schema from "@yummy/db/schema"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const adminDatabaseUrl = "postgres://postgres:postgres@localhost:5432/postgres"

type TestDatabase = {
  readonly databaseUrl: string
  readonly sql: ReturnType<typeof postgres>
  readonly reset: () => Promise<void>
  readonly close: () => Promise<void>
}

function databaseNameFromModule(moduleUrl: string): string {
  const pathname = new URL(moduleUrl).pathname
  const filename = pathname.split("/").at(-1) ?? "test"
  const normalized = filename.replace(/\.test\.ts$/, "").replace(/[^a-zA-Z0-9]+/g, "_")
  return `yummy_chat_test_${normalized}`.toLowerCase()
}

async function ensureDatabase(databaseName: string): Promise<void> {
  const adminSql = postgres(adminDatabaseUrl)
  const existingDatabases = await adminSql`
    SELECT 1 FROM pg_database WHERE datname = ${databaseName}
  `
  if (existingDatabases.length === 0) {
    await adminSql`CREATE DATABASE ${adminSql(databaseName)}`
  }
  await adminSql.end()
}

export async function createTestDatabase(moduleUrl: string): Promise<TestDatabase> {
  const databaseName = databaseNameFromModule(moduleUrl)
  const databaseUrl = `postgres://postgres:postgres@localhost:5432/${databaseName}`
  await ensureDatabase(databaseName)
  process.env.DATABASE_URL = databaseUrl

  const sql = postgres(databaseUrl)

  return {
    databaseUrl,
    sql,
    reset: async () => {
      await sql`DROP SCHEMA IF EXISTS public CASCADE`
      await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`
      await sql`CREATE SCHEMA public`

      const testDb = drizzle(sql, { schema })
      await migrate(testDb, { migrationsFolder: "../../packages/db/drizzle" })
    },
    close: async () => {
      await sql.end()
    },
  }
}
