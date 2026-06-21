import type { MessageListItem } from "@/lib/api"
import type { ChatMessage, FileAttachment } from "./types"

export function stripGeneratedJsonBlocks(text: string): string {
  return text
    .replace(/```xlsx-json\s*\n[\s\S]*?\n```/g, "")
    .replace(/```pptx-json\s*\n[\s\S]*?\n```/g, "")
    .trim()
}

export function mapMessageListItemToChatMessage(m: MessageListItem): ChatMessage {
  const base: ChatMessage = {
    id: m.id,
    role: m.role === "system" ? "assistant" : (m.role as "user" | "assistant"),
    content: m.content,
    isStreaming: false,
    createdAt: m.createdAt,
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
