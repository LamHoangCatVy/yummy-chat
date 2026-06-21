import type { ConversationId, MemoryId, MessageId, SkillId, UserId } from "@yummy/shared"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-orchestrator-tests"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"

// Dynamic imports AFTER env vars are set so @yummy/db picks up test DB
const { db } = await import("@yummy/db")
const { conversation, memoryEntry, message, skill, userMemorySettings } = await import(
  "@yummy/db/schema"
)
const { FakeLLMProvider } = await import("../llm/fake-provider")
const { createOrchestrator } = await import("./orchestrator")
type StreamChunk = import("../llm/provider").StreamChunk

const testSql = testDatabase.sql

async function collectChunks(iterable: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}

describe("chat orchestrator", () => {
  const testUserId = "00000000-0000-0000-0000-000000000099" as UserId
  const actor = { userId: testUserId }

  beforeAll(async () => {
    await testDatabase.reset()

    await testSql`
      INSERT INTO "user" (id, name, email, created_at, updated_at)
      VALUES (${testUserId}, 'Orchestrator Test', 'orch-test@test.com', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `
  })

  afterAll(async () => {
    await testDatabase.close()
  })
  describe("prompt assembly — no skill", () => {
    it("assembles basic system prompt without skill or memory", async () => {
      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "No Skill Test",
      })

      const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
      const orchestrator = createOrchestrator({ provider })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "Hello",
          model: "fake",
        },
        actor,
      )

      expect(result.systemPrompt).toContain("You are a helpful assistant.")
      expect(result.systemPrompt).toContain("## Generated Files")
      expect(result.metadata.skillUsed).toBeNull()
      expect(result.metadata.memoryEntriesUsed).toBe(0)

      const userMsgs = result.assembledMessages.filter((m) => m.role === "user")
      expect(userMsgs.length).toBe(1)
      expect(userMsgs[0]?.content).toBe("Hello")
    })
  })

  describe("prompt assembly — with skill", () => {
    it("includes skill description in system prompt", async () => {
      const skillId = crypto.randomUUID() as SkillId
      await db.insert(skill).values({
        id: skillId,
        ownerId: testUserId,
        name: "Test Skill",
        prompt: "You are a pirate. Always speak like a pirate.",
        model: "gpt-4",
      })

      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Skill Test",
      })

      const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
      const orchestrator = createOrchestrator({ provider })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "Hello",
          model: "fake",
          skillId,
        },
        actor,
      )

      expect(result.systemPrompt).toContain("Skill Instructions")
      expect(result.systemPrompt).toContain("pirate")
      expect(result.metadata.skillUsed).toBe("Test Skill")
    })
  })

  describe("prompt assembly — memory disabled", () => {
    it("does not include memory when memoryEnabled is false", async () => {
      await db.insert(memoryEntry).values({
        id: crypto.randomUUID() as MemoryId,
        userId: testUserId,
        key: "favorite_color",
        value: "blue",
      })

      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Memory Disabled Test",
      })

      const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
      const orchestrator = createOrchestrator({ provider })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "What is my favorite color?",
          model: "fake",
          memoryEnabled: false,
        },
        actor,
      )

      expect(result.systemPrompt).not.toContain("User Memory")
      expect(result.systemPrompt).not.toContain("blue")
      expect(result.metadata.memoryEntriesUsed).toBe(0)
    })

    it("does not include memory when user setting is disabled", async () => {
      await db
        .insert(userMemorySettings)
        .values({
          id: crypto.randomUUID() as MemoryId,
          userId: testUserId,
          enabled: false,
        })
        .onConflictDoNothing()

      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Memory Setting Disabled Test",
      })

      const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
      const orchestrator = createOrchestrator({ provider })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "test",
          model: "fake",
          memoryEnabled: true,
        },
        actor,
      )

      expect(result.metadata.memoryEntriesUsed).toBe(0)
      expect(result.systemPrompt).not.toContain("User Memory")
    })
  })

  describe("prompt assembly — memory enabled", () => {
    it("includes memory entries when enabled and user setting is on", async () => {
      await db
        .insert(userMemorySettings)
        .values({
          id: crypto.randomUUID() as MemoryId,
          userId: testUserId,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: userMemorySettings.userId,
          set: { enabled: true },
        })

      await testSql`DELETE FROM memory_entry WHERE user_id = ${testUserId}`
      await db.insert(memoryEntry).values({
        id: crypto.randomUUID() as MemoryId,
        userId: testUserId,
        key: "name",
        value: "Test User",
      })

      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Memory Enabled Test",
      })

      const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
      const orchestrator = createOrchestrator({ provider })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "Do you know me?",
          model: "fake",
          memoryEnabled: true,
        },
        actor,
      )

      expect(result.systemPrompt).toContain("User Memory")
      expect(result.systemPrompt).toContain("name: Test User")
      expect(result.metadata.memoryEntriesUsed).toBeGreaterThan(0)
    })
  })

  describe("token budget truncation", () => {
    it("truncates old history when exceeding budget", async () => {
      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Budget Test",
      })

      for (let i = 0; i < 20; i++) {
        await db.insert(message).values({
          id: crypto.randomUUID() as MessageId,
          conversationId: convId,
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i}: ${"x".repeat(200)}`,
        })
      }

      const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
      const orchestrator = createOrchestrator({
        provider,
        tokenBudget: 500,
      })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "Latest message",
          model: "fake",
        },
        actor,
      )

      expect(result.metadata.historyMessagesTruncated).toBeGreaterThan(0)
      expect(result.metadata.historyMessagesIncluded).toBeGreaterThan(0)
      expect(result.assembledMessages.length).toBeLessThan(21)
    })

    it("always includes the new user message", async () => {
      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Budget Always Includes New",
      })

      const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
      const orchestrator = createOrchestrator({
        provider,
        tokenBudget: 50,
      })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "This must be included",
          model: "fake",
        },
        actor,
      )

      const userMsgs = result.assembledMessages.filter((m) => m.role === "user")
      expect(userMsgs.length).toBeGreaterThanOrEqual(1)
      expect(userMsgs.some((m) => m.content === "This must be included")).toBe(true)
    })
  })

  describe("streaming through orchestrator", () => {
    it("produces stream chunks from provider", async () => {
      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Stream Test",
      })

      const provider = new FakeLLMProvider({
        chunks: ["A", "B", "C"],
        chunkDelayMs: 1,
      })
      const orchestrator = createOrchestrator({ provider })

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "test",
          model: "fake",
        },
        actor,
      )

      const chunks = await collectChunks(result.stream)
      const textChunks = chunks.filter((c) => c.type === "text-delta")
      const finishChunks = chunks.filter((c) => c.type === "finish")

      expect(textChunks.length).toBe(3)
      expect(finishChunks.length).toBe(1)
    })

    it("propagates abort to provider", async () => {
      const convId = crypto.randomUUID() as ConversationId
      await db.insert(conversation).values({
        id: convId,
        userId: testUserId,
        title: "Abort Test",
      })

      const provider = new FakeLLMProvider({
        chunks: ["a", "b", "c", "d", "e", "f"],
        chunkDelayMs: 50,
      })
      const orchestrator = createOrchestrator({ provider })

      const controller = new AbortController()
      setTimeout(() => controller.abort(), 80)

      const result = await orchestrator.orchestrate(
        {
          conversationId: convId,
          userMessage: "test",
          model: "fake",
        },
        actor,
        controller.signal,
      )

      const chunks = await collectChunks(result.stream)
      const textChunks = chunks.filter((c) => c.type === "text-delta")

      expect(textChunks.length).toBeGreaterThan(0)
      expect(textChunks.length).toBeLessThan(6)
    })
  })
})
