import type { ConversationId } from "@yummy/shared"
import type { Actor } from "../authz.js"
import type { ProviderToolSet } from "../llm/tool-set.js"
import { memoryRepository } from "../repositories.js"
import { evaluateMemorySafety } from "./guardrails.js"
import { createMemoryProposal, forgetMemories, getMemorySettings, saveMemory } from "./service.js"

const REMEMBER_MEMORY_TOOL = "remember_memory"
const FORGET_MEMORY_TOOL = "forget_memory"
const LIST_MEMORIES_TOOL = "list_memories"

export async function createMemoryToolSet(
  actor: Actor,
  conversationId: ConversationId,
  available: boolean,
): Promise<ProviderToolSet> {
  const settings = await getMemorySettings(actor.userId)
  if (!available || !settings.savedMemoryEnabled) {
    return {
      tools: [],
      async execute() {
        return { content: "Memory is disabled", isError: true }
      },
    }
  }

  const repository = memoryRepository(actor)
  return {
    tools: [
      {
        name: REMEMBER_MEMORY_TOOL,
        description:
          "Save a stable fact or preference only when the user explicitly asks you to remember it.",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string", minLength: 1, maxLength: 200 },
            value: { type: "string", minLength: 1, maxLength: 2000 },
            category: { type: "string", minLength: 1, maxLength: 50 },
          },
          required: ["key", "value", "category"],
          additionalProperties: false,
        },
      },
      {
        name: FORGET_MEMORY_TOOL,
        description: "Delete saved memories when the user explicitly asks you to forget something.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string", minLength: 1, maxLength: 500 } },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: LIST_MEMORIES_TOOL,
        description: "List saved memories when the user asks what you remember about them.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
    ],
    async execute(name, arguments_) {
      if (name === REMEMBER_MEMORY_TOOL) {
        const key = arguments_.key
        const value = arguments_.value
        const category = arguments_.category
        if (typeof key !== "string" || typeof value !== "string" || typeof category !== "string") {
          return { content: "remember_memory requires key, value and category", isError: true }
        }
        const candidate = { key, value, category }
        const decision = evaluateMemorySafety(candidate, true)
        if (decision === "blocked") {
          return { content: "This information is too sensitive to store in memory.", isError: true }
        }
        const input = {
          userId: actor.userId,
          key,
          value,
          category,
          confidence: 1,
          importance: 1,
          origin: "explicit" as const,
          sourceConversationId: conversationId,
        }
        if (decision === "confirmation_required") {
          const proposal = await createMemoryProposal(input)
          return {
            content: JSON.stringify({
              status: "confirmation_required",
              proposalId: proposal?.id ?? null,
              key,
              value,
              category,
              message: "Ask the user to confirm this sensitive memory.",
            }),
          }
        }
        const row = await saveMemory(input)
        return { content: row ? `Remembered: ${row.key}` : "Memory was not saved", isError: !row }
      }

      if (name === FORGET_MEMORY_TOOL) {
        const query = arguments_.query
        if (typeof query !== "string") {
          return { content: "forget_memory requires a query", isError: true }
        }
        const deleted = await forgetMemories(actor.userId, query)
        return {
          content: deleted > 0 ? `Forgot ${deleted} memory item(s).` : "No matching memory found.",
        }
      }

      if (name === LIST_MEMORIES_TOOL) {
        const rows = await repository.list()
        const summary = rows
          .slice(0, 100)
          .map((row) => `- ${row.key}: ${row.value}`)
          .join("\n")
        return { content: summary || "No saved memories." }
      }

      return { content: `Unknown memory tool: ${name}`, isError: true }
    },
  }
}
