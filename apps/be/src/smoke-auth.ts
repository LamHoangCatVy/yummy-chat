/**
 * Auth smoke gate – verifies the full authentication lifecycle against a
 * real (test) database using the Hono test-client pattern (`app.request`).
 *
 * Flow:
 *   1. Create test DB (if missing) & run migrations
 *   2. Sign-up a fresh user
 *   3. Sign-in with correct credentials → extract session cookie
 *   4. GET /api/v1/auth/get-session with cookie → expect valid session
 *   5. POST /api/v1/auth/sign-out → expect 200
 *   6. GET /api/v1/auth/get-session again → expect null (revoked)
 *
 * Exit 0 on success, 1 on any failure.
 *
 * Usage:
 *   bun run smoke:auth            (from repo root)
 *   bun run src/smoke-auth.ts     (from apps/be)
 */

import * as schema from "@yummy/db/schema"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// ── Test environment (must be set BEFORE any app imports) ────────────────────
const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/yummy_chat_smoke"
const TEST_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "smoke-test-secret-do-not-use-in-prod"
const TEST_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001"

process.env.DATABASE_URL = TEST_DB_URL
process.env.BETTER_AUTH_SECRET = TEST_AUTH_SECRET
process.env.BETTER_AUTH_URL = TEST_AUTH_URL
process.env.APP_ENV = "test"

// Dynamic import – ensures @yummy/db singleton picks up the test DATABASE_URL
const { createApp } = await import("./app")

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCookies(res: Response): string {
  const setCookies = res.headers.getSetCookie()
  return setCookies.map((c) => c.split(";")[0]).join("; ")
}

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${label}`)
  }
}

// ── Database bootstrap ───────────────────────────────────────────────────────

async function bootstrapDb(): Promise<void> {
  const adminSql = postgres("postgres://postgres:postgres@localhost:5432/postgres")
  const dbName = new URL(TEST_DB_URL).pathname.slice(1) // strip leading /

  try {
    await adminSql`CREATE DATABASE ${adminSql(dbName)}`
    console.log(`  ✅ Created database "${dbName}"`)
  } catch {
    console.log(`  ℹ️  Database "${dbName}" already exists`)
  }
  await adminSql.end()

  const smokeSql = postgres(TEST_DB_URL)
  await smokeSql`DROP SCHEMA IF EXISTS public CASCADE`
  await smokeSql`DROP SCHEMA IF EXISTS drizzle CASCADE`
  await smokeSql`CREATE SCHEMA public`

  const smokeDb = drizzle(smokeSql, { schema })
  await migrate(smokeDb, { migrationsFolder: "../../packages/db/drizzle" })
  console.log("  ✅ Migrations applied")
  await smokeSql.end()
}

// ── Smoke test ───────────────────────────────────────────────────────────────

async function smokeTest(): Promise<void> {
  const app = createApp()
  const smokeUser = {
    name: "Smoke Test User",
    email: `smoke-${Date.now()}@yummy.chat`,
    password: "smoke-password-123",
  }

  // 1. Sign-up
  console.log("\n[1/6] Sign-up…")
  const signUpRes = await app.request("/api/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(smokeUser),
  })
  assert(signUpRes.status === 200, `sign-up status = ${signUpRes.status}`)
  const signUpBody = await signUpRes.json()
  assert(signUpBody.user?.email === smokeUser.email, "sign-up response email mismatch")
  console.log("  ✅ Sign-up OK")

  // 2. Sign-in
  console.log("[2/6] Sign-in…")
  const signInRes = await app.request("/api/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: smokeUser.email,
      password: smokeUser.password,
    }),
  })
  assert(signInRes.status === 200, `sign-in status = ${signInRes.status}`)
  const cookies = extractCookies(signInRes)
  assert(cookies.length > 0, "sign-in returned no cookies")
  assert(
    cookies.includes("better-auth.session_token") || cookies.includes("session_token"),
    "session cookie not found in Set-Cookie header",
  )
  console.log("  ✅ Sign-in OK – session cookie present")

  // 3. Verify session
  console.log("[3/6] Verify session…")
  const sessionRes = await app.request("/api/v1/auth/get-session", {
    headers: { Cookie: cookies },
  })
  assert(sessionRes.status === 200, `get-session status = ${sessionRes.status}`)
  const sessionBody = await sessionRes.json()
  assert(sessionBody !== null, "get-session returned null")
  assert(sessionBody.user?.email === smokeUser.email, "session email mismatch")
  console.log("  ✅ Session valid")

  // 4. Verify protected route behaviour (unauthenticated → no user)
  console.log("[4/6] Verify unauthenticated access…")
  const noAuthSessionRes = await app.request("/api/v1/auth/get-session")
  const noAuthBody = await noAuthSessionRes.json()
  assert(
    noAuthBody === null || noAuthBody.user === null,
    "unauthenticated request should return null session",
  )
  console.log("  ✅ Unauthenticated access correctly returns null session")

  // 5. Sign-out (Better Auth requires Origin header for CSRF protection)
  console.log("[5/6] Sign-out…")
  const signOutRes = await app.request("/api/v1/auth/sign-out", {
    method: "POST",
    headers: { Cookie: cookies, Origin: TEST_AUTH_URL },
  })
  assert(signOutRes.status === 200, `sign-out status = ${signOutRes.status}`)
  console.log("  ✅ Sign-out OK")

  // 6. Verify session revoked
  console.log("[6/6] Verify session revoked…")
  const revokedRes = await app.request("/api/v1/auth/get-session", {
    headers: { Cookie: cookies },
  })
  const revokedBody = await revokedRes.json()
  assert(
    revokedBody === null,
    `session should be null after sign-out, got: ${JSON.stringify(revokedBody)}`,
  )
  console.log("  ✅ Session revoked")
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("🔥 Auth smoke gate starting…")
console.log(`  DB: ${TEST_DB_URL.replace(/\/\/.*@/, "//***@")}`)

try {
  console.log("\n📦 Bootstrapping test database…")
  await bootstrapDb()

  console.log("\n🧪 Running smoke tests…")
  await smokeTest()

  console.log("\n✅ Auth smoke gate PASSED")
  process.exit(0)
} catch (error) {
  console.error("\n❌ Auth smoke gate FAILED:", error)
  process.exit(1)
}
