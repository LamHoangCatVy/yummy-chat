import type {
  CompleteRequest,
  CompleteResponse,
  LLMProvider,
  StreamChunk,
  StreamRequest,
} from "./provider.js"

/**
 * Minimal delta shape including provider-specific reasoning fields.
 *
 * The OpenAI SDK types do not expose `reasoning_content` / `reasoning` because
 * they are provider-specific (DeepSeek R1, OpenAI-compatible gateways).  We
 * widen the SDK delta to this interface via `as unknown` so the reasoning
 * stream can be read in a type-safe way without suppressing types.
 */
interface ReasoningCapableDelta {
  readonly content?: string | null
  readonly reasoning_content?: string | null
  readonly reasoning?: string | null
}

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string
  private readonly defaultModel: string
  private readonly baseURL: string | undefined

  constructor(apiKey: string, defaultModel: string, baseURL?: string) {
    this.apiKey = apiKey
    this.defaultModel = defaultModel
    this.baseURL = baseURL
  }

  async *stream(request: StreamRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const { OpenAI } = await import("openai")
    const client = new OpenAI({
      apiKey: this.apiKey,
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
    })

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

        const choice = chunk.choices[0]
        if (choice) {
          const delta = choice.delta as unknown as ReasoningCapableDelta

          const reasoning = delta.reasoning_content ?? delta.reasoning
          if (typeof reasoning === "string" && reasoning.length > 0) {
            yield { type: "reasoning-delta", reasoningDelta: reasoning }
          }

          if (typeof delta.content === "string" && delta.content.length > 0) {
            outputTokens += Math.ceil(delta.content.length / 4)
            yield { type: "text-delta", textDelta: delta.content }
          }
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

  async complete(request: CompleteRequest, signal?: AbortSignal): Promise<CompleteResponse> {
    const { OpenAI } = await import("openai")
    const client = new OpenAI({
      apiKey: this.apiKey,
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
    })

    const messages = request.systemPrompt
      ? [{ role: "system" as const, content: request.systemPrompt }, ...request.messages]
      : [...request.messages]

    const completion = await client.chat.completions.create(
      {
        model: request.model || this.defaultModel,
        messages,
        stream: false,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      },
      { signal },
    )

    const content = completion.choices[0]?.message?.content ?? ""
    const usage = completion.usage
    return {
      content,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
    }
  }
}
