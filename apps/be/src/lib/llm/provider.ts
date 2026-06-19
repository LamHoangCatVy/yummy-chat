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
}
