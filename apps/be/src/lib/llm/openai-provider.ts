import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions"
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

interface AccumulatedToolCall {
  id: string
  name: string
  argumentsJson: string
}

const MAX_TOOL_ROUNDS = 8

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

    const messages: ChatCompletionMessageParam[] = request.systemPrompt
      ? [{ role: "system" as const, content: request.systemPrompt }, ...request.messages]
      : [...request.messages]

    let inputTokens = 0
    let outputTokens = 0

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const completion = await client.chat.completions.create(
          {
            model: request.model || this.defaultModel,
            messages,
            stream: true,
            stream_options: { include_usage: true },
            ...(request.tools?.length
              ? {
                  tools: request.tools.map((tool) => ({
                    type: "function" as const,
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.inputSchema,
                    },
                  })),
                  tool_choice: "auto" as const,
                }
              : {}),
          },
          { signal },
        )

        const toolCalls = new Map<number, AccumulatedToolCall>()
        let roundText = ""
        let finishReason: string | null = null
        let estimatedRoundOutputTokens = 0
        let reportedRoundOutputTokens: number | null = null

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
            finishReason = choice.finish_reason ?? finishReason
            const delta = choice.delta as unknown as ReasoningCapableDelta
            const reasoning = delta.reasoning_content ?? delta.reasoning
            if (typeof reasoning === "string" && reasoning.length > 0) {
              yield { type: "reasoning-delta", reasoningDelta: reasoning }
            }
            if (typeof delta.content === "string" && delta.content.length > 0) {
              roundText += delta.content
              estimatedRoundOutputTokens += Math.ceil(delta.content.length / 4)
              yield { type: "text-delta", textDelta: delta.content }
            }

            for (const callDelta of choice.delta.tool_calls ?? []) {
              const current = toolCalls.get(callDelta.index) ?? {
                id: callDelta.id ?? `tool-${round}-${callDelta.index}`,
                name: "",
                argumentsJson: "",
              }
              if (callDelta.id) current.id = callDelta.id
              if (callDelta.function?.name) current.name += callDelta.function.name
              if (callDelta.function?.arguments) {
                current.argumentsJson += callDelta.function.arguments
              }
              toolCalls.set(callDelta.index, current)
            }
          }

          if (chunk.usage) {
            inputTokens += chunk.usage.prompt_tokens ?? 0
            reportedRoundOutputTokens = chunk.usage.completion_tokens ?? reportedRoundOutputTokens
          }
        }

        outputTokens += reportedRoundOutputTokens ?? estimatedRoundOutputTokens

        if (toolCalls.size === 0 || !request.executeTool) {
          yield {
            type: "finish",
            finishReason: finishReason === "length" ? "length" : "stop",
            usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          }
          return
        }

        if (round === MAX_TOOL_ROUNDS) {
          yield {
            type: "error",
            error: "The model exceeded the maximum number of MCP tool rounds",
            code: "TOOL_ROUND_LIMIT",
          }
          return
        }

        const calls = [...toolCalls.values()]
        messages.push({
          role: "assistant",
          content: roundText || null,
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: call.argumentsJson || "{}" },
          })),
        })

        for (const call of calls) {
          let arguments_: Record<string, unknown> = {}
          try {
            const parsed = JSON.parse(call.argumentsJson || "{}") as unknown
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              arguments_ = parsed as Record<string, unknown>
            }
          } catch {
            arguments_ = {}
          }

          yield {
            type: "tool-call",
            toolCallId: call.id,
            toolName: call.name,
            arguments: arguments_,
          }
          const result = await request.executeTool(call.name, arguments_)
          messages.push({ role: "tool", tool_call_id: call.id, content: result.content })
          yield {
            type: "tool-result",
            toolCallId: call.id,
            toolName: call.name,
            isError: result.isError === true,
          }
        }
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
