import type {
  AssistantResponsePart,
  StreamToolCallEvent,
  StreamToolResultEvent,
  ToolCallActivity,
} from "./types"

export type ToolStreamEvent =
  | { readonly type: "tool-call"; readonly payload: StreamToolCallEvent }
  | { readonly type: "tool-result"; readonly payload: StreamToolResultEvent }

export function parseToolStreamEvent(value: unknown): ToolStreamEvent | null {
  if (
    !isRecord(value) ||
    typeof value.toolCallId !== "string" ||
    typeof value.toolName !== "string"
  ) {
    return null
  }

  if ("arguments" in value && isRecord(value.arguments)) {
    return {
      type: "tool-call",
      payload: {
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        arguments: value.arguments,
      },
    }
  }

  if ("isError" in value && typeof value.isError === "boolean") {
    return {
      type: "tool-result",
      payload: {
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        content: typeof value.content === "string" ? value.content : "",
        isError: value.isError,
      },
    }
  }

  return null
}

export function applyToolStreamEvent(
  current: readonly ToolCallActivity[],
  event: ToolStreamEvent,
): readonly ToolCallActivity[] {
  const id = event.payload.toolCallId
  const existingIndex = current.findIndex((toolCall) => toolCall.id === id)

  const next: ToolCallActivity =
    event.type === "tool-call"
      ? {
          id,
          name: event.payload.toolName,
          arguments: event.payload.arguments,
          status: "running",
        }
      : {
          id,
          name: event.payload.toolName,
          arguments: existingIndex >= 0 ? (current[existingIndex]?.arguments ?? {}) : {},
          status: event.payload.isError ? "error" : "success",
          result: event.payload.content,
        }

  if (existingIndex < 0) {
    return [...current, next]
  }

  return current.map((toolCall, index) => (index === existingIndex ? next : toolCall))
}

export function appendResponseText(
  current: readonly AssistantResponsePart[],
  textDelta: string,
): readonly AssistantResponsePart[] {
  if (!textDelta) return current

  const last = current.at(-1)
  if (last?.type === "text") {
    return [
      ...current.slice(0, -1),
      {
        type: "text",
        content: last.content + textDelta,
      },
    ]
  }

  return [...current, { type: "text", content: textDelta }]
}

export function appendResponseToolCall(
  current: readonly AssistantResponsePart[],
  toolCallId: string,
): readonly AssistantResponsePart[] {
  if (current.some((part) => part.type === "tool-call" && part.toolCallId === toolCallId)) {
    return current
  }

  return [...current, { type: "tool-call", toolCallId }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
