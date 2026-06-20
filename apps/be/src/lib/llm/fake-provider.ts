/**
 * Deterministic fake LLM provider for development and testing.
 *
 * Emits pre-configured text chunks with realistic delays.  Supports abort
 * propagation and optional error injection so streaming, cancellation, and
 * error-handling paths can be exercised without a real API key.
 */

import type {
  CompleteRequest,
  CompleteResponse,
  LLMProvider,
  StreamChunk,
  StreamRequest,
  UsageMetadata,
} from "./provider.js"

// ── Configuration ───────────────────────────────────────────────────────────

export interface FakeProviderOptions {
  /** Deterministic chunks to emit.  Defaults to a 5-word sentence. */
  readonly chunks?: readonly string[]
  /** Delay in ms between chunks.  Defaults to 50. */
  readonly chunkDelayMs?: number
  /** If set, throw after emitting this many text chunks. */
  readonly errorAfterChunks?: number
  /** Error message to use when errorAfterChunks is set. */
  readonly errorMessage?: string
}

const DEFAULT_CHUNKS = ["Hello", " from", " the", " fake", " LLM", " provider", "!"] as const

const DEFAULT_DELAY_MS = 50

// ── Fake provider ───────────────────────────────────────────────────────────

export class FakeLLMProvider implements LLMProvider {
  private readonly chunks: readonly string[]
  private readonly chunkDelayMs: number
  private readonly errorAfterChunks: number | undefined
  private readonly errorMessage: string

  constructor(options: FakeProviderOptions = {}) {
    this.chunks = options.chunks ?? DEFAULT_CHUNKS
    this.chunkDelayMs = options.chunkDelayMs ?? DEFAULT_DELAY_MS
    this.errorAfterChunks = options.errorAfterChunks
    this.errorMessage = options.errorMessage ?? "Simulated provider error"
  }

  async *stream(_request: StreamRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    let emittedTextChunks = 0

    for (const chunk of this.chunks) {
      // Check abort before each delay
      if (signal?.aborted) {
        yield {
          type: "finish",
          finishReason: "abort",
          usage: this.computeUsage(emittedTextChunks),
        }
        return
      }

      // Wait with abort awareness
      await this.sleepWithAbort(this.chunkDelayMs, signal)

      // Check abort after delay
      if (signal?.aborted) {
        yield {
          type: "finish",
          finishReason: "abort",
          usage: this.computeUsage(emittedTextChunks),
        }
        return
      }

      // Check if we should inject an error
      if (this.errorAfterChunks !== undefined && emittedTextChunks >= this.errorAfterChunks) {
        yield {
          type: "error",
          error: this.errorMessage,
          code: "PROVIDER_ERROR",
        }
        return
      }

      yield { type: "text-delta", textDelta: chunk }
      emittedTextChunks++
    }

    // Final finish chunk
    yield {
      type: "finish",
      finishReason: "stop",
      usage: this.computeUsage(emittedTextChunks),
    }
  }

  async complete(request: CompleteRequest, _signal?: AbortSignal): Promise<CompleteResponse> {
    const userMsg = request.messages.find((m) => m.role === "user")
    const words = userMsg?.content.split(/\s+/).slice(0, 6).join(" ") ?? "Fake conversation"
    const title = `${words}...`
    return {
      content: title,
      usage: this.computeUsage(Math.ceil(title.length / 4)),
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private computeUsage(textChunks: number): UsageMetadata {
    // Deterministic fake usage: ~4 tokens per chunk for input estimate,
    // 1 token per chunk for output
    const inputTokens = textChunks * 4
    const outputTokens = textChunks
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }
  }

  private sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve()
        return
      }

      const timer = setTimeout(resolve, ms)

      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
  }
}
