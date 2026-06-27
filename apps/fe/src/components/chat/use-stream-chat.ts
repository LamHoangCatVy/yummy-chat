"use client"

import { listMessages } from "@/lib/api"
import { API_V1 } from "@yummy/shared"
import { useCallback, useRef, useState } from "react"
import { mapMessageListItemToChatMessage } from "./chat-transcript-helpers"
import type { ChatMessage, FileAttachment, StreamStatus } from "./types"

interface UseStreamChatOptions {
  /** Called when a streaming error occurs (for toast/notification). */
  onError?: (error: string) => void
  /** Called after the first assistant response in a conversation completes. */
  onFirstExchangeComplete?: () => void
}

interface UseStreamChatReturn {
  /** Messages in the current conversation. */
  readonly messages: readonly ChatMessage[]
  /** Current stream status. */
  readonly status: StreamStatus
  /** Send a user message and stream the assistant response. */
  readonly sendMessage: (
    content: string,
    conversationId: string,
    skillId?: string | null,
    model?: string | null,
  ) => Promise<void>
  /** Abort the current streaming response. */
  readonly stop: () => void
  /** Clear all messages (e.g., when starting a new conversation). */
  readonly clear: () => void
  /** Load existing messages for a conversation from the backend. */
  readonly loadMessages: (conversationId: string) => Promise<void>
}

/**
 * Hook that manages chat messages and SSE streaming from the backend.
 *
 * Flow:
 * 1. User sends message → added to local state immediately
 * 2. POST /api/v1/chat/stream with the message
 * 3. Read SSE response: "text" events append to assistant message
 * 4. "finish" event marks streaming complete
 * 5. "error" event sets error status
 */
export function useStreamChat(options: UseStreamChatOptions = {}): UseStreamChatReturn {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [status, setStatus] = useState<StreamStatus>("idle")
  const abortRef = useRef<AbortController | null>(null)
  const firstExchangeRef = useRef(false)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus("idle")
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setStatus("idle")
    firstExchangeRef.current = false
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus("idle")

    try {
      const result = await listMessages(conversationId)
      const loaded: ChatMessage[] = result.data.map(mapMessageListItemToChatMessage)
      setMessages(loaded)
      firstExchangeRef.current = loaded.length === 0
    } catch {
      setMessages([])
      firstExchangeRef.current = true
    }
  }, [])

  const sendMessage = useCallback(
    async (
      content: string,
      conversationId: string,
      skillId?: string | null,
      model?: string | null,
    ) => {
      // Abort any existing stream
      abortRef.current?.abort()

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        isStreaming: false,
        createdAt: new Date().toISOString(),
      }

      const assistantId = crypto.randomUUID()
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setStatus("streaming")

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch(`${API_V1.CHAT}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            content,
            model: model || "gpt-5-nano",
            ...(skillId ? { skillId } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorBody = await response.text()
          setStatus("error")
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${response.status} — ${errorBody}`, isStreaming: false }
                : m,
            ),
          )
          options.onError?.(`Request failed (${response.status})`)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          setStatus("error")
          options.onError?.("No response body")
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (line.startsWith("data:")) {
              const data = line.slice(5).trim()
              if (!data) continue

              try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const parsed: unknown = JSON.parse(data)

                if (
                  typeof parsed === "object" &&
                  parsed !== null &&
                  "text" in parsed &&
                  typeof (parsed as { text: unknown }).text === "string"
                ) {
                  const textDelta = (parsed as { text: string }).text
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: m.content + textDelta } : m,
                    ),
                  )
                } else if (
                  typeof parsed === "object" &&
                  parsed !== null &&
                  "reasoning" in parsed &&
                  typeof (parsed as { reasoning: unknown }).reasoning === "string"
                ) {
                  const reasoningDelta = (parsed as { reasoning: string }).reasoning
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            reasoningContent: (m.reasoningContent ?? "") + reasoningDelta,
                          }
                        : m,
                    ),
                  )
                } else if (
                  typeof parsed === "object" &&
                  parsed !== null &&
                  "finishReason" in parsed
                ) {
                  // Finish event — mark streaming as done
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
                  )
                  setStatus("done")
                } else if (
                  typeof parsed === "object" &&
                  parsed !== null &&
                  "filename" in parsed &&
                  "downloadUrl" in parsed
                ) {
                  const file = parsed as FileAttachment
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, files: [...(m.files ?? []), file] } : m,
                    ),
                  )
                } else if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
                  const errorMsg = (parsed as { error: string }).error
                  setStatus("error")
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: m.content || `Error: ${errorMsg}`, isStreaming: false }
                        : m,
                    ),
                  )
                  options.onError?.(errorMsg)
                }
              } catch {
                // Skip unparseable SSE data lines
              }
            }
          }
        }

        // If stream ended without a finish event, mark as done
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
        )
        setStatus("done")
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User-initiated abort — mark message as stopped
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
          )
          setStatus("idle")
          return
        }

        const message = err instanceof Error ? err.message : "Unknown error"
        setStatus("error")
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `Error: ${message}`, isStreaming: false }
              : m,
          ),
        )
        options.onError?.(message)
      } finally {
        abortRef.current = null
      }
    },
    [options],
  )

  return { messages, status, sendMessage, stop, clear, loadMessages }
}
