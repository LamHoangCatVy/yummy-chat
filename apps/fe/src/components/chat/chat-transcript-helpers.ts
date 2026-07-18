import type { MessageListItem } from "@/lib/api"
import type { ChatMessage, FileAttachment, ToolCallActivity } from "./types"

export function stripGeneratedJsonBlocks(text: string): string {
  return text
    .replace(/```xlsx-json\s*\n[\s\S]*?\n```/g, "")
    .replace(/```pptx-json\s*\n[\s\S]*?\n```/g, "")
    .trim()
}

export function mapMessageListItemToChatMessage(m: MessageListItem): ChatMessage {
  const reasoningContent =
    typeof m.metadata?.reasoningContent === "string" ? m.metadata.reasoningContent : undefined
  const toolCalls = parseToolCalls(m.metadata?.toolCalls)

  const base: ChatMessage = {
    id: m.id,
    role: m.role === "system" ? "assistant" : (m.role as "user" | "assistant"),
    content: m.content,
    isStreaming: false,
    createdAt: m.createdAt,
    ...(reasoningContent !== undefined ? { reasoningContent } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  }

  const filesFromMetadata = m.metadata?.files
  if (!Array.isArray(filesFromMetadata)) {
    return base
  }

  const validFiles: FileAttachment[] = []
  for (const file of filesFromMetadata) {
    if (isFileAttachment(file)) {
      validFiles.push({
        filename: file.filename,
        downloadUrl: file.downloadUrl,
        mimeType: file.mimeType,
      })
    }
  }

  if (validFiles.length === 0) {
    return base
  }

  return { ...base, files: validFiles }
}

function isFileAttachment(value: unknown): value is FileAttachment {
  return (
    typeof value === "object" &&
    value !== null &&
    "filename" in value &&
    "downloadUrl" in value &&
    "mimeType" in value &&
    typeof value.filename === "string" &&
    typeof value.downloadUrl === "string" &&
    typeof value.mimeType === "string"
  )
}

function parseToolCalls(value: unknown): readonly ToolCallActivity[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((toolCall) => {
    if (
      typeof toolCall !== "object" ||
      toolCall === null ||
      typeof toolCall.id !== "string" ||
      typeof toolCall.name !== "string" ||
      !isRecord(toolCall.arguments) ||
      !isToolCallStatus(toolCall.status) ||
      (toolCall.result !== undefined && typeof toolCall.result !== "string")
    ) {
      return []
    }

    return [
      {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        status: toolCall.status,
        ...(toolCall.result !== undefined ? { result: toolCall.result } : {}),
      },
    ]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isToolCallStatus(value: unknown): value is "running" | "success" | "error" {
  return value === "running" || value === "success" || value === "error"
}
