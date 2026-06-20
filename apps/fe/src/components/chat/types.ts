/**
 * Shared types for the chat UI components.
 *
 * These types model the local state of the chat interface — they are NOT
 * database models. The streaming hook converts BE SSE events into these
 * local message objects for the transcript to render.
 */

/** Unique identifier for a locally-tracked message. */
export type LocalMessageId = string & { readonly __brand: unique symbol }

/** Roles that appear in the chat transcript. */
export type MessageRole = "user" | "assistant"

/** A single message in the chat transcript. */
export interface ChatMessage {
  readonly id: string
  readonly role: MessageRole
  readonly content: string
  /** True while the assistant is still streaming tokens. */
  readonly isStreaming: boolean
  /** Timestamp when the message was created (ISO string). */
  readonly createdAt: string
  /** File attachments generated during the response (e.g., xlsx downloads). */
  readonly files?: readonly FileAttachment[]
}

/** A file attachment from the assistant that the user can download. */
export interface FileAttachment {
  readonly filename: string
  readonly downloadUrl: string
  readonly mimeType: string
}

/** Possible states for the streaming connection. */
export type StreamStatus = "idle" | "streaming" | "error" | "done"

/** SSE event types from the backend /api/v1/chat/stream endpoint. */
export interface StreamTextEvent {
  readonly text: string
}

export interface StreamFinishEvent {
  readonly finishReason: string
  readonly usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly totalTokens: number
  }
  readonly messageId: string
}

export interface StreamErrorEvent {
  readonly error: string
  readonly code: string
}
