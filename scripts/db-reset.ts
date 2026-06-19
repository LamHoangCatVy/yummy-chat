/**
 * DB reset script — drops all schemas, recreates public, runs migrations,
 * then seeds development data.
 *
 * Usage:  bun run scripts/db-reset.ts
 * Requires: .env with DATABASE_URL pointing to a local Postgres
 * Safety:  guarded by APP_ENV check (only runs in development / test)
 */

import postgres from "postgres"

const ALLOWED_ENVS = new Set(["test", "development"])

async function main(): Promise<void> {
  const appEnv = process.env.APP_ENV ?? ""
  if (!ALLOWED_ENVS.has(appEnv)) {
    console.error(
      `DB reset aborted: APP_ENV="${appEnv}" is not in [${[...ALLOWED_ENVS].join(", ")}]`,
    )
    process.exit(1)
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  console.log("🔧 Resetting database…")
  const sql = postgres(connectionString)

  try {
    // Drop everything (CASCADE handles all tables, types, etc.)
    await sql`DROP SCHEMA IF EXISTS public CASCADE`
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`
    await sql`CREATE SCHEMA public`
    // Grant default perms so subsequent operations work
    await sql`GRANT ALL ON SCHEMA public TO public`
    console.log("  ✅ Schemas dropped and recreated")
  } catch (err) {
    console.error("  ❌ Failed to reset schemas:", err)
    await sql.end()
    process.exit(1)
  }

  await sql.end()

  // Run migrations via the @yummy/db package script
  console.log("  ▶️  Running migrations…")
  const migrateProc = Bun.spawnSync(["bun", "--filter", "@yummy/db", "db:migrate:test"], {
    stdio: ["inherit", "inherit", "inherit"],
  })
  if (migrateProc.exitCode !== 0) {
    console.error("  ❌ Migration failed")
    process.exit(migrateProc.exitCode)
  }
  console.log("  ✅ Migrations applied")

  // Seed data
  console.log("  ▶️  Seeding data…")
  const seedProc = Bun.spawnSync(["bun", "--filter", "@yummy/db", "db:seed"], {
    stdio: ["inherit", "inherit", "inherit"],
  })
  if (seedProc.exitCode !== 0) {
    console.error("  ❌ Seed failed")
    process.exit(seedProc.exitCode)
  }
  console.log("  ✅ Seed data inserted")

  console.log("✅ Database reset complete")
}

main()
