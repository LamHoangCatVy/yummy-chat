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

export interface MemorySource {
  readonly kind: "saved_memory" | "past_chat"
  readonly id: string
  readonly label: string
  readonly conversationId?: string | null
  readonly excerpt?: string
}

export interface MemoryProposalRequest {
  readonly id: string
  readonly key: string
  readonly value: string
  readonly category: string
}

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
  /** Reasoning/thinking content streamed by a reasoning model, separate from the answer. */
  readonly reasoningContent?: string
  /** MCP tool calls emitted while the assistant response is streaming. */
  readonly toolCalls?: readonly ToolCallActivity[]
  /** Saved memories or past chats that contributed context to this answer. */
  readonly memorySources?: readonly MemorySource[]
  /** Sensitive memory awaiting an explicit user confirmation. */
  readonly memoryProposal?: MemoryProposalRequest
}

/** A file attachment from the assistant that the user can download. */
export interface FileAttachment {
  readonly filename: string
  readonly downloadUrl: string
  readonly mimeType: string
}

export type ToolCallStatus = "running" | "success" | "error"

/** Live state for one MCP tool invocation within an assistant message. */
export interface ToolCallActivity {
  readonly id: string
  readonly name: string
  readonly arguments: Readonly<Record<string, unknown>>
  readonly status: ToolCallStatus
  readonly result?: string
}

/** Possible states for the streaming connection. */
export type StreamStatus = "idle" | "streaming" | "error" | "done"

/** SSE event types from the backend /api/v1/chat/stream endpoint. */
export interface StreamTextEvent {
  readonly text: string
}

export interface StreamReasoningEvent {
  readonly reasoning: string
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

export interface StreamToolCallEvent {
  readonly toolCallId: string
  readonly toolName: string
  readonly arguments: Record<string, unknown>
}

export interface StreamToolResultEvent {
  readonly toolCallId: string
  readonly toolName: string
  readonly content: string
  readonly isError: boolean
}
