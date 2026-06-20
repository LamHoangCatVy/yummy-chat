import type { LLMProvider, StreamChunk, StreamRequest } from "./provider.js"

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string
  private readonly defaultModel: string

  constructor(apiKey: string, defaultModel: string) {
    this.apiKey = apiKey
    this.defaultModel = defaultModel
  }

  async *stream(request: StreamRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const { OpenAI } = await import("openai")
    const client = new OpenAI({ apiKey: this.apiKey })

    const messages = request.systemPrompt
      ? [{ role: "system" as const, content: request.systemPrompt }, ...request.messages]
      : [...request.messages]

    let inputTokens = 0
    let outputTokens = 0

    try {
      const completion = await client.chat.completions.create(
        {
          model: request.model || this.defaultModel,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      )

      for await (const chunk of completion) {
        if (signal?.aborted) {
          yield {
            type: "finish",
            finishReason: "abort",
            usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          }
          return
        }

        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          outputTokens += Math.ceil(delta.length / 4)
          yield { type: "text-delta", textDelta: delta }
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }
      }

      yield {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      }
    } catch (err) {
      if (signal?.aborted) {
        yield {
          type: "finish",
          finishReason: "abort",
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        }
        return
      }
      const message = err instanceof Error ? err.message : "OpenAI API error"
      yield { type: "error", error: message, code: "PROVIDER_ERROR" }
    }
  }
}
