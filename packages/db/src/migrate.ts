import { migrate } from "drizzle-orm/postgres-js/migrator"
import { db, sql } from "./client.js"

async function main(): Promise<void> {
  console.log("Running migrations...")
  await migrate(db, { migrationsFolder: "./drizzle" })
  console.log("Migrations complete.")
  await sql.end()
}

main().catch(async (error: unknown) => {
  console.error("Migration failed:", error)
  await sql.end()
  process.exit(1)
})
