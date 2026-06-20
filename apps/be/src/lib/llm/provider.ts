/**
 * LLM provider abstraction.
 *
 * All providers implement this interface so the orchestration layer and routes
 * are decoupled from any specific LLM vendor.
 */

// ── Message types ───────────────────────────────────────────────────────────

export interface ProviderMessage {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

// ── Stream request ──────────────────────────────────────────────────────────

export interface StreamRequest {
  readonly messages: readonly ProviderMessage[]
  readonly model: string
  readonly systemPrompt?: string
}

// ── Complete (non-streaming) request / response ─────────────────────────────

export interface CompleteRequest {
  readonly messages: readonly ProviderMessage[]
  readonly model: string
  readonly systemPrompt?: string
  /** Maximum tokens for the completion. */
  readonly maxTokens?: number
}

export interface CompleteResponse {
  readonly content: string
  readonly usage: UsageMetadata
}

// ── Stream chunks ───────────────────────────────────────────────────────────

export type TextDeltaChunk = {
  readonly type: "text-delta"
  readonly textDelta: string
}

export type FinishChunk = {
  readonly type: "finish"
  readonly finishReason: "stop" | "length" | "error" | "abort"
  readonly usage: UsageMetadata
}

export type ErrorChunk = {
  readonly type: "error"
  readonly error: string
  readonly code: string
}

export type StreamChunk = TextDeltaChunk | FinishChunk | ErrorChunk

// ── Usage metadata ──────────────────────────────────────────────────────────

export interface UsageMetadata {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
}

// ── Provider interface ──────────────────────────────────────────────────────

export interface LLMProvider {
  /**
   * Stream text chunks from the provider.
   *
   * The returned async iterable yields {@link StreamChunk} values.
   * The provider MUST honour the AbortSignal — when aborted it should stop
   * producing chunks as soon as possible.
   */
  stream(request: StreamRequest, signal?: AbortSignal): AsyncIterable<StreamChunk>

  /**
   * Non-streaming completion — sends the full prompt and returns the
   * complete response in a single call.  Useful for short generation tasks
   * like title summarisation where streaming overhead is unnecessary.
   */
  complete(request: CompleteRequest, signal?: AbortSignal): Promise<CompleteResponse>
}
