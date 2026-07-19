import type { SkillId, UserId } from "@yummy/shared"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase } from "../../test/db"

const testDatabase = await createTestDatabase(import.meta.url)
process.env.BETTER_AUTH_SECRET = "test-secret-for-agent-skill-loader"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.APP_ENV = "test"

const { db } = await import("@yummy/db")
const { skill, skillResource } = await import("@yummy/db/schema")
const { createAgentSkillToolSet } = await import("./loader")

describe("Agent Skill loader", () => {
  const userId = "00000000-0000-0000-0000-000000000088" as UserId
  const skillId = "00000000-0000-0000-0000-000000000089" as SkillId
  const actor = { userId }

  beforeAll(async () => {
    await testDatabase.reset()
    await testDatabase.sql`
      INSERT INTO "user" (id, name, email, created_at, updated_at)
      VALUES (${userId}, 'Skill Loader', 'skill-loader@test.com', NOW(), NOW())
    `
    await db.insert(skill).values([
      {
        id: skillId,
        ownerId: userId,
        name: "Incident Response",
        slug: "incident-response",
        description: "Investigate incidents. Use when production is unavailable.",
        prompt: "# Workflow\n\nFollow the private incident checklist.",
        model: "default",
      },
      {
        id: "00000000-0000-0000-0000-000000000090",
        ownerId: userId,
        name: "Disabled",
        slug: "disabled-skill",
        description: "This skill is disabled.",
        prompt: "Disabled instructions.",
        enabled: false,
        model: "default",
      },
    ])
    await db.insert(skillResource).values({
      skillId,
      path: "references/runbook.md",
      content: "# Runbook\n\nInspect logs first.",
      encoding: "utf8",
      mimeType: "text/markdown",
      byteSize: 29,
    })
  })

  afterAll(async () => {
    await testDatabase.close()
  })

  it("exposes metadata without placing full instructions in the catalog", async () => {
    const toolSet = await createAgentSkillToolSet(actor)

    expect(toolSet.catalogPrompt).toContain("incident-response")
    expect(toolSet.catalogPrompt).toContain("production is unavailable")
    expect(toolSet.catalogPrompt).not.toContain("private incident checklist")
    expect(toolSet.catalogPrompt).not.toContain("disabled-skill")
    expect(toolSet.tools.map((tool) => tool.name)).toEqual([
      "activate_skill",
      "read_skill_resource",
    ])
  })

  it("loads instructions on activation and gates resource reads", async () => {
    const toolSet = await createAgentSkillToolSet(actor)

    const prematureRead = await toolSet.execute("read_skill_resource", {
      skill: "incident-response",
      path: "references/runbook.md",
    })
    expect(prematureRead.isError).toBe(true)

    const activation = await toolSet.execute("activate_skill", {
      name: "incident-response",
    })
    expect(activation.isError).not.toBe(true)
    expect(activation.content).toContain("private incident checklist")
    expect(activation.content).toContain("references/runbook.md")

    const resource = await toolSet.execute("read_skill_resource", {
      skill: "incident-response",
      path: "references/runbook.md",
    })
    expect(resource.content).toContain("Inspect logs first")
    expect(toolSet.getActivatedSkills()).toEqual([
      expect.objectContaining({ slug: "incident-response" }),
    ])
  })

  it("preactivates an explicitly selected skill", async () => {
    const toolSet = await createAgentSkillToolSet(actor, skillId)

    expect(toolSet.activeSkillName).toBe("Incident Response")
    expect(toolSet.activeSkillPrompt).toContain("private incident checklist")
    expect(toolSet.getActivatedSkills()).toHaveLength(1)
  })
})
