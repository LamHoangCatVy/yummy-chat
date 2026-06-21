import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../test/db"

// Set test env vars BEFORE any app imports
const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-generated-files-only"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"

const { generatedFileRepository } = await import("./repositories")

const testSql = testDatabase.sql

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID()
}

// ── Test data ────────────────────────────────────────────────────────────────

const userAId = uid()
const userBId = uid()
const convId = uid()
const fileId = uid()
const fileContent = Buffer.from("fake-pptx-binary-data")

const actorA = { userId: userAId }
const actorB = { userId: userBId }

describe("generatedFileRepository", () => {
  beforeAll(async () => {
    await testDatabase.reset()

    // Seed two users
    await testSql`INSERT INTO "user" (id, name, email) VALUES (${userAId}, 'User A', 'a@test.com')`
    await testSql`INSERT INTO "user" (id, name, email) VALUES (${userBId}, 'User B', 'b@test.com')`

    // Seed a conversation owned by user A
    await testSql`INSERT INTO "conversation" (id, user_id, title) VALUES (${convId}, ${userAId}, 'Test conversation')`
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  describe("create() and getById()", () => {
    it("inserts a generated file and retrieves it by id", async () => {
      const repo = generatedFileRepository(actorA)

      const created = await repo.create({
        id: fileId,
        userId: userAId,
        conversationId: convId,
        filename: "report.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        byteSize: fileContent.length,
        content: fileContent,
        metadata: { slides: 5, template: "corporate" },
      })

      expect(created).toBeDefined()
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect().toBeDefined()
      const row = created!
      expect(row.id).toBe(fileId)
      expect(row.userId).toBe(userAId)
      expect(row.conversationId).toBe(convId)
      expect(row.filename).toBe("report.pptx")
      expect(row.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      )
      expect(row.byteSize).toBe(fileContent.length)
      expect(row.content).toEqual(fileContent)
      expect(row.metadata).toEqual({ slides: 5, template: "corporate" })

      // Read it back
      const retrieved = await repo.getById(fileId)
      expect(retrieved).toBeDefined()
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect().toBeDefined()
      const found = retrieved!
      expect(found.id).toBe(fileId)
      expect(found.content).toEqual(fileContent)
    })

    it("returns the created row with correct timestamps", async () => {
      const repo = generatedFileRepository(actorA)
      const newId = uid()

      const created = await repo.create({
        id: newId,
        userId: userAId,
        conversationId: convId,
        filename: "data.csv",
        mimeType: "text/csv",
        byteSize: 10,
        content: Buffer.from("a,b,c\n1,2,3"),
      })

      expect(created).toBeDefined()
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect().toBeDefined()
      const row = created!
      expect(row.createdAt).toBeInstanceOf(Date)
      expect(row.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe("owner scoping", () => {
    it("getById returns undefined for a different actor", async () => {
      const repoB = generatedFileRepository(actorB)

      const result = await repoB.getById(fileId)
      expect(result).toBeUndefined()
    })

    it("files created by actorA are not visible to actorB", async () => {
      const repoB = generatedFileRepository(actorB)

      // Actor B tries to read a file owned by actor A
      const result = await repoB.getById(fileId)
      expect(result).toBeUndefined()
    })

    it("actorB can create their own file and read it back", async () => {
      const repoB = generatedFileRepository(actorB)
      const newId = uid()

      const created = await repoB.create({
        id: newId,
        userId: userBId,
        conversationId: convId,
        filename: "other.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        byteSize: 100,
        content: Buffer.from("actor-b-content"),
      })

      expect(created).toBeDefined()
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect().toBeDefined()
      const row = created!
      expect(row.userId).toBe(userBId)

      const retrieved = await repoB.getById(newId)
      expect(retrieved).toBeDefined()
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect().toBeDefined()
      const found = retrieved!
      expect(found.content).toEqual(Buffer.from("actor-b-content"))
    })
  })

  describe("cascade delete", () => {
    it("files are deleted when their conversation is deleted", async () => {
      const cascadeConvId = uid()
      const cascadeFileId = uid()

      // Create a conversation
      await testSql`INSERT INTO "conversation" (id, user_id, title) VALUES (${cascadeConvId}, ${userAId}, 'Cascade test')`

      // Create a file in that conversation
      const repo = generatedFileRepository(actorA)
      await repo.create({
        id: cascadeFileId,
        userId: userAId,
        conversationId: cascadeConvId,
        filename: "temp.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        byteSize: 50,
        content: Buffer.from("will-be-deleted"),
      })

      // Verify it exists
      let retrieved = await repo.getById(cascadeFileId)
      expect(retrieved).toBeDefined()

      // Delete the conversation
      await testSql`DELETE FROM "conversation" WHERE id = ${cascadeConvId}`

      // File should be cascade-deleted
      retrieved = await repo.getById(cascadeFileId)
      expect(retrieved).toBeUndefined()
    })

    it("files are deleted when their user is deleted", async () => {
      const cascadeUserId = uid()
      const cascadeFileId = uid()

      // Create a user and conversation
      await testSql`INSERT INTO "user" (id, name, email) VALUES (${cascadeUserId}, 'Cascade User', 'cascade@test.com')`
      await testSql`INSERT INTO "conversation" (id, user_id, title) VALUES (${uid()}, ${cascadeUserId}, 'User cascade test')`

      // Create a file
      const cascadeActor = { userId: cascadeUserId }
      const repo = generatedFileRepository(cascadeActor)
      await repo.create({
        id: cascadeFileId,
        userId: cascadeUserId,
        conversationId: convId,
        filename: "user-cascade.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        byteSize: 30,
        content: Buffer.from("user-cascade-content"),
      })

      // Verify it exists
      let retrieved = await repo.getById(cascadeFileId)
      expect(retrieved).toBeDefined()

      // Delete the user
      await testSql`DELETE FROM "user" WHERE id = ${cascadeUserId}`

      // File should be cascade-deleted
      retrieved = await repo.getById(cascadeFileId)
      expect(retrieved).toBeUndefined()
    })
  })

  describe("nullable message_id", () => {
    it("allows creating a file without a message_id", async () => {
      const repo = generatedFileRepository(actorA)
      const newId = uid()

      const created = await repo.create({
        id: newId,
        userId: userAId,
        conversationId: convId,
        filename: "no-message.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        byteSize: 20,
        content: Buffer.from("no-message-ref"),
      })

      expect(created).toBeDefined()
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect().toBeDefined()
      const row = created!
      expect(row.messageId).toBeNull()
    })

    it("allows creating a file with a message_id", async () => {
      const msgId = uid()
      const newId = uid()

      // Insert a message
      await testSql`INSERT INTO "message" (id, conversation_id, role, content) VALUES (${msgId}, ${convId}, 'assistant', 'Generated a file')`

      const repo = generatedFileRepository(actorA)
      const created = await repo.create({
        id: newId,
        userId: userAId,
        conversationId: convId,
        messageId: msgId,
        filename: "with-message.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        byteSize: 15,
        content: Buffer.from("with-message-ref"),
        metadata: { referencedMessage: msgId },
      })

      expect(created).toBeDefined()
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect().toBeDefined()
      const row = created!
      expect(row.messageId).toBe(msgId)
    })
  })
})
