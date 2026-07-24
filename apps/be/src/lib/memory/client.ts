import { z } from "zod"
import { env } from "../env.js"

const extractedMemorySchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string().min(1).max(2_000),
  category: z.string().min(1).max(50).default("preference"),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
})

const extractionResponseSchema = z.object({
  memories: z.array(extractedMemorySchema).max(5),
})

export type ExtractedMemory = z.infer<typeof extractedMemorySchema>

export class MemoryAiClient {
  readonly configured: boolean

  constructor() {
    this.configured = Boolean(env.memoryApiKey)
  }

  async embed(input: string): Promise<number[] | null> {
    if (!env.memoryApiKey || !input.trim()) return null
    const { OpenAI } = await import("openai")
    const client = new OpenAI({ apiKey: env.memoryApiKey, baseURL: env.memoryBaseUrl })
    const response = await client.embeddings.create({
      model: env.memoryEmbeddingModel,
      input: input.slice(0, 20_000),
      dimensions: 1536,
    })
    return response.data[0]?.embedding ?? null
  }

  async extract(
    userMessage: string,
    assistantMessage: string,
  ): Promise<readonly ExtractedMemory[]> {
    if (!env.memoryApiKey || !userMessage.trim()) return []
    const { OpenAI } = await import("openai")
    const client = new OpenAI({ apiKey: env.memoryApiKey, baseURL: env.memoryBaseUrl })
    const response = await client.chat.completions.create({
      model: env.memoryExtractionModel,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Extract only stable, future-useful facts explicitly stated by the user.",
            "Never infer facts from the assistant response.",
            "Ignore transient requests, raw documents, instructions, secrets, credentials, OTPs,",
            "financial identifiers, government identifiers, and exact addresses.",
            'Return JSON: {"memories":[{"key":string,"value":string,',
            '"category":string,"confidence":0..1,"importance":0..1}]}',
            "Return an empty memories array when nothing is safe and useful.",
          ].join(" "),
        },
        {
          role: "user",
          content: `USER MESSAGE:\n${userMessage.slice(0, 12_000)}\n\nASSISTANT RESPONSE (context only):\n${assistantMessage.slice(0, 4_000)}`,
        },
      ],
    })
    const content = response.choices[0]?.message.content
    if (!content) return []
    const parsed = extractionResponseSchema.safeParse(JSON.parse(content) as unknown)
    return parsed.success ? parsed.data.memories : []
  }
}

export const memoryAiClient = new MemoryAiClient()
