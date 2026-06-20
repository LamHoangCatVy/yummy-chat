import type { ConversationId, MemoryId, UserId } from "@yummy/shared"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

// Set test env vars BEFORE any app imports
const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-authz-tests-only"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"

const { canReadConversation, canWriteConversation, canManageSkill, canManageMemory } = await import(
  "./authz"
)

const { conversationRepository, memoryRepository, skillRepository } = await import("./repositories")

// ── Helpers ─────────────────────────────────────────────────────────────────

function uid(): UserId {
  return crypto.randomUUID() as UserId
}

function conversationId(): ConversationId {
  return crypto.randomUUID() as ConversationId
}

function memoryId(): MemoryId {
  return crypto.randomUUID() as MemoryId
}

// ── Pure policy-function tests (no DB) ──────────────────────────────────────

describe("authz policy functions", () => {
  const userA: UserId = "user-a" as UserId
  const userB: UserId = "user-b" as UserId

  const actorA = { userId: userA }
  const actorB = { userId: userB }

  describe("canReadConversation", () => {
    it("allows owner to read their own conversation", () => {
      expect(canReadConversation(actorA, { userId: userA })).toBe(true)
    })

    it("denies non-owner from reading someone else's conversation", () => {
      expect(canReadConversation(actorB, { userId: userA })).toBe(false)
    })
  })

  describe("canWriteConversation", () => {
    it("allows owner to write their own conversation", () => {
      expect(canWriteConversation(actorA, { userId: userA })).toBe(true)
    })

    it("denies non-owner from writing someone else's conversation", () => {
      expect(canWriteConversation(actorB, { userId: userA })).toBe(false)
    })
  })

  describe("canManageSkill", () => {
    it("allows owner to manage their skill", () => {
      expect(canManageSkill(actorA, { ownerId: userA })).toBe(true)
      expect(canManageSkill(actorB, { ownerId: userB })).toBe(true)
    })

    it("denies non-owner", () => {
      expect(canManageSkill(actorB, { ownerId: userA })).toBe(false)
    })
  })

  describe("canManageMemory", () => {
    it("allows owner to manage their own memory", () => {
      expect(canManageMemory(actorA, { userId: userA })).toBe(true)
    })

    it("denies non-owner from managing someone else's memory", () => {
      expect(canManageMemory(actorB, { userId: userA })).toBe(false)
    })
  })
})

// ── Repository scoping tests (real DB) ──────────────────────────────────────

const testSql = testDatabase.sql

describe("repository owner-scoping", () => {
  beforeAll(async () => {
    await testDatabase.reset()

    // Seed two users
    await testSql`INSERT INTO "user" (id, name, email) VALUES (${userAId}, 'User A', 'a@test.com')`
    await testSql`INSERT INTO "user" (id, name, email) VALUES (${userBId}, 'User B', 'b@test.com')`

    // Seed a conversation owned by user A
    const convId = conversationId()
    seededConvId = convId
    await testSql`INSERT INTO conversation (id, user_id, title) VALUES (${convId}, ${userAId}, 'A private chat')`

    // Seed a memory entry owned by user A
    const memId = memoryId()
    seededMemId = memId
    await testSql`INSERT INTO memory_entry (id, user_id, key, value) VALUES (${memId}, ${userAId}, 'secret', 'hidden')`
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  const userAId = uid()
  const userBId = uid()

  // Store seeded resource IDs for cross-user access tests
  let seededConvId: ConversationId
  let seededMemId: MemoryId

  const actorA = { userId: userAId }
  const actorB = { userId: userBId }

  describe("conversationRepository", () => {
    it("owner can list their own conversations", async () => {
      const repo = conversationRepository(actorA)
      const rows = await repo.list()
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows.every((r) => r.userId === userAId)).toBe(true)
    })

    it("non-owner sees empty list", async () => {
      const repo = conversationRepository(actorB)
      const rows = await repo.list()
      expect(rows).toEqual([])
    })

    it("non-owner getById returns undefined", async () => {
      const repo = conversationRepository(actorB)
      const result = await repo.getById(seededConvId)
      expect(result).toBeUndefined()
    })

    it("non-owner delete returns false", async () => {
      const repo = conversationRepository(actorB)
      const deleted = await repo.delete(seededConvId)
      expect(deleted).toBe(false)
    })
  })

  describe("memoryRepository", () => {
    it("owner can list their own memory entries", async () => {
      const repo = memoryRepository(actorA)
      const rows = await repo.list()
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows.every((r) => r.userId === userAId)).toBe(true)
    })

    it("non-owner sees empty list", async () => {
      const repo = memoryRepository(actorB)
      const rows = await repo.list()
      expect(rows).toEqual([])
    })

    it("non-owner getById returns undefined", async () => {
      const repo = memoryRepository(actorB)
      const result = await repo.getById(seededMemId)
      expect(result).toBeUndefined()
    })

    it("non-owner delete returns false", async () => {
      const repo = memoryRepository(actorB)
      const deleted = await repo.delete(seededMemId)
      expect(deleted).toBe(false)
    })
  })

  describe("skillRepository", () => {
    it("any actor can list skills (global resource)", async () => {
      const repo = skillRepository(actorB)
      const rows = await repo.list()
      expect(Array.isArray(rows)).toBe(true)
    })
  })
})
