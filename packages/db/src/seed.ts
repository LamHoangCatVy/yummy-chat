import { randomBytes, scrypt } from "node:crypto"
import { db, sql } from "./client.js"
import {
  account,
  conversation,
  conversationSkillSnapshot,
  memoryEntry,
  message,
  skill,
  usageRecord,
  user,
  userMemorySettings,
} from "./schema/index.js"

const ALLOWED_ENVS = new Set(["test", "development"])

// ── Deterministic IDs ────────────────────────────────────────────────────────
const USER_1_ID = "00000000-0000-4000-8000-000000000001"
const USER_2_ID = "00000000-0000-4000-8000-000000000002"

const SKILL_1_ID = "00000000-0000-4000-8000-000000000010"
const SKILL_2_ID = "00000000-0000-4000-8000-000000000011"

const CONV_1_ID = "00000000-0000-4000-8000-000000000020"
const CONV_2_ID = "00000000-0000-4000-8000-000000000021"

// ── Deterministic credentials (test-only, never use in production) ───────────
const USER_1_EMAIL = "testuser1@yummy.chat"
const USER_1_PASSWORD = "test-password-1"
const USER_2_EMAIL = "testuser2@yummy.chat"
const USER_2_PASSWORD = "test-password-2"

/**
 * Hash a password using the same scrypt parameters as Better Auth
 * (`@better-auth/utils` password module).  Format: `<salt>:<derived-key>`
 * both hex-encoded.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const key = (await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, derived) => {
        if (err) reject(err)
        else resolve(derived)
      },
    )
  })) as Buffer
  return `${salt}:${key.toString("hex")}`
}

async function seed(): Promise<void> {
  const appEnv = process.env.APP_ENV ?? ""
  if (!ALLOWED_ENVS.has(appEnv)) {
    console.error(`Seed aborted: APP_ENV="${appEnv}" is not in [${[...ALLOWED_ENVS].join(", ")}]`)
    process.exit(1)
  }

  // ── Idempotent: delete existing seed data (order respects FK cascades) ──
  console.log("Cleaning existing seed data…")
  await sql`DELETE FROM "usage_record" WHERE user_id IN (${USER_1_ID}, ${USER_2_ID})`
  await sql`DELETE FROM "memory_entry" WHERE user_id IN (${USER_1_ID}, ${USER_2_ID})`
  await sql`DELETE FROM "user_memory_settings" WHERE user_id IN (${USER_1_ID}, ${USER_2_ID})`
  await sql`DELETE FROM "conversation_skill_snapshot" WHERE conversation_id IN (${CONV_1_ID}, ${CONV_2_ID})`
  await sql`DELETE FROM "message" WHERE conversation_id IN (${CONV_1_ID}, ${CONV_2_ID})`
  await sql`DELETE FROM "conversation" WHERE id IN (${CONV_1_ID}, ${CONV_2_ID})`
  await sql`DELETE FROM "conversation_skill_snapshot" WHERE skill_id IN (${SKILL_1_ID}, ${SKILL_2_ID})`
  await sql`DELETE FROM "skill" WHERE id IN (${SKILL_1_ID}, ${SKILL_2_ID})`
  await sql`DELETE FROM "account" WHERE user_id IN (${USER_1_ID}, ${USER_2_ID})`
  await sql`DELETE FROM "session" WHERE user_id IN (${USER_1_ID}, ${USER_2_ID})`
  await sql`DELETE FROM "user" WHERE id IN (${USER_1_ID}, ${USER_2_ID})`

  // ── Hash passwords ─────────────────────────────────────────────────────
  const [hash1, hash2] = await Promise.all([
    hashPassword(USER_1_PASSWORD),
    hashPassword(USER_2_PASSWORD),
  ])

  // ── Users ──────────────────────────────────────────────────────────────
  await db.insert(user).values([
    {
      id: USER_1_ID,
      name: "Test User One",
      email: USER_1_EMAIL,
      emailVerified: true,
    },
    {
      id: USER_2_ID,
      name: "Test User Two",
      email: USER_2_EMAIL,
      emailVerified: true,
    },
  ])

  // ── Accounts (credential provider – compatible with Better Auth) ───────
  await db.insert(account).values([
    {
      id: `${USER_1_ID}-account`,
      userId: USER_1_ID,
      accountId: USER_1_EMAIL,
      providerId: "credential",
      password: hash1,
    },
    {
      id: `${USER_2_ID}-account`,
      userId: USER_2_ID,
      accountId: USER_2_EMAIL,
      providerId: "credential",
      password: hash2,
    },
  ])

  // ── Skills (user 1 owns skill 1, user 2 owns skill 2) ─────────────────
  await db.insert(skill).values([
    {
      id: SKILL_1_ID,
      ownerId: USER_1_ID,
      name: "General Assistant",
      prompt: "You are a helpful general assistant.",
      model: "gpt-4o-mini",
    },
    {
      id: SKILL_2_ID,
      ownerId: USER_2_ID,
      name: "Code Helper",
      prompt: "You are a coding expert. Provide concise, correct code examples.",
      model: "gpt-4o-mini",
    },
  ])

  // ── Conversations ──────────────────────────────────────────────────────
  await db.insert(conversation).values([
    {
      id: CONV_1_ID,
      userId: USER_1_ID,
      title: "Welcome conversation",
    },
    {
      id: CONV_2_ID,
      userId: USER_2_ID,
      title: "Code help session",
    },
  ])

  // ── Messages ───────────────────────────────────────────────────────────
  await db.insert(message).values([
    {
      conversationId: CONV_1_ID,
      role: "assistant",
      content: "Welcome to yummy-chat! How can I help you today?",
    },
    {
      conversationId: CONV_1_ID,
      role: "user",
      content: "Tell me about yourself.",
    },
    {
      conversationId: CONV_2_ID,
      role: "user",
      content: "How do I sort an array in TypeScript?",
    },
    {
      conversationId: CONV_2_ID,
      role: "assistant",
      content: "You can use Array.prototype.sort(). For example: [3,1,2].sort((a,b) => a-b)",
    },
  ])

  // ── Skill snapshots ────────────────────────────────────────────────────
  await db.insert(conversationSkillSnapshot).values([
    {
      conversationId: CONV_1_ID,
      skillId: SKILL_1_ID,
      skillName: "General Assistant",
    },
    {
      conversationId: CONV_2_ID,
      skillId: SKILL_2_ID,
      skillName: "Code Helper",
    },
  ])

  // ── Memory settings + entries ──────────────────────────────────────────
  await db.insert(userMemorySettings).values([
    { userId: USER_1_ID, enabled: false },
    { userId: USER_2_ID, enabled: true },
  ])

  await db.insert(memoryEntry).values([
    { userId: USER_1_ID, key: "preferred_language", value: "en" },
    { userId: USER_2_ID, key: "preferred_language", value: "vi" },
  ])

  // ── Usage records ──────────────────────────────────────────────────────
  await db.insert(usageRecord).values([
    { userId: USER_1_ID, model: "gpt-4o-mini", inputTokens: 42, outputTokens: 12 },
    { userId: USER_2_ID, model: "gpt-4o-mini", inputTokens: 100, outputTokens: 55 },
  ])

  console.log("Seed complete.")
}

seed()
  .catch(async (error: unknown) => {
    console.error("Seed failed:", error)
    await sql.end()
    process.exit(1)
  })
  .finally(async () => {
    await sql.end()
  })
