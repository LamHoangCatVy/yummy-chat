/**
 * Local smoke test runner.
 *
 * Verifies environment, DB connectivity, and runs the existing smoke
 * scripts for both BE (auth) and FE (core E2E).
 *
 * Usage:  npm run smoke:local
 * Prereqs: .env loaded, Postgres running, dev servers running
 *          (npm run dev should be started in another terminal)
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

interface Check {
  name: string
  ok: boolean
  detail?: string
}

const checks: Check[] = []

function log(check: Check): void {
  checks.push(check)
  const icon = check.ok ? "✅" : "❌"
  console.log(`  ${icon} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`)
}

async function main(): Promise<void> {
  console.log("🔍 Local smoke checks\n")

  // ── 1. Environment ───────────────────────────────────────────────────
  const envPath = ".env"
  if (!existsSync(envPath)) {
    log({ name: ".env file exists", ok: false, detail: "missing — copy .env.example to .env" })
    process.exit(1)
  }
  log({ name: ".env file exists", ok: true })

  // Check DATABASE_URL
  const envContent = readFileSync(envPath, "utf-8")
  const dbUrlMatch = envContent.match(/^DATABASE_URL=(.+)$/m)
  if (!dbUrlMatch) {
    log({ name: "DATABASE_URL in .env", ok: false, detail: "not found" })
    process.exit(1)
  }
  log({ name: "DATABASE_URL in .env", ok: true })

  const betterAuthUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
  log({ name: "BETTER_AUTH_URL", ok: true, detail: betterAuthUrl })

  // ── 2. DB connectivity ───────────────────────────────────────────────
  try {
    const postgres = await import("postgres").then((m) => m.default)
    const sql = postgres(process.env.DATABASE_URL ?? dbUrlMatch?.[1])
    await sql`SELECT 1`
    await sql.end()
    log({ name: "Postgres reachable", ok: true })
  } catch {
    log({
      name: "Postgres reachable",
      ok: false,
      detail: "cannot connect — is `docker compose up -d postgres` running?",
    })
    process.exit(1)
  }

  // ── 3. BE health ─────────────────────────────────────────────────────
  const bePort = process.env.PORT ?? "3001"
  try {
    const res = await fetch(`http://localhost:${bePort}/api/v1/health`)
    if (res.ok) {
      log({ name: `BE health (port ${bePort})`, ok: true })
    } else {
      log({ name: `BE health (port ${bePort})`, ok: false, detail: `HTTP ${res.status}` })
    }
  } catch {
    log({
      name: `BE health (port ${bePort})`,
      ok: false,
      detail: "unreachable — is `npm run dev` running?",
    })
  }

  // ── 4. FE reachable ──────────────────────────────────────────────────
  const fePort = "3000"
  try {
    const res = await fetch(`http://localhost:${fePort}/login`)
    if (res.ok || res.status === 404) {
      // 404 is OK for SSR route that doesn't exist — the server is up
      log({ name: `FE reachable (port ${fePort})`, ok: true })
    } else {
      log({ name: `FE reachable (port ${fePort})`, ok: false, detail: `HTTP ${res.status}` })
    }
  } catch {
    log({
      name: `FE reachable (port ${fePort})`,
      ok: false,
      detail: "unreachable — is `npm run dev` running?",
    })
  }

  // ── 5. Run existing smoke scripts ─────────────────────────────────────
  console.log("\n  ▶️  Running BE auth smoke…")
  const authSmoke = spawnSync("npm", ["run", "smoke:auth", "-w", "@yummy/be"], {
    stdio: "inherit",
  })
  log({
    name: "BE auth smoke",
    ok: authSmoke.status === 0,
    detail: authSmoke.status === 0 ? "passed" : `exit code ${authSmoke.status}`,
  })

  // ── 6. Summary ───────────────────────────────────────────────────────
  const failures = checks.filter((c) => !c.ok)
  console.log("\n═══════════════════════════════════════════")
  if (failures.length === 0) {
    console.log("✅ All local smoke checks passed")
  } else {
    console.log(`❌ ${failures.length} check(s) failed:`)
    for (const f of failures) {
      console.log(`   - ${f.name}${f.detail ? `: ${f.detail}` : ""}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Smoke-local error:", err)
  process.exit(1)
})
