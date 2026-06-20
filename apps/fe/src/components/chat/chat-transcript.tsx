"use client"

import { Download, Sparkles, User } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ChatMessage, FileAttachment } from "./types"

interface ChatTranscriptProps {
  readonly messages: readonly ChatMessage[]
  readonly userName: string
}

/**
 * Renders the scrollable message list with streaming text append.
 *
 * ChatGPT-style message rows (no bubbles):
 * - Each message is a full-width row inside a centered max-w container.
 * - A small circular avatar sits to the left; the name sits above the text.
 * - User and assistant share the same layout — only the avatar/icon differs.
 * - Streaming state shows a blinking cursor appended to the text.
 */
export function ChatTranscript({ messages, userName }: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  // Track whether user is at the bottom of the scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  // Auto-scroll when new messages arrive (if user is at bottom)
  const currentCount = messages.length
  if (currentCount !== prevMessageCountRef.current) {
    prevMessageCountRef.current = currentCount
    if (isAtBottomRef.current) {
      requestAnimationFrame(scrollToBottom)
    }
  }

  // Scroll to bottom on initial mount
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-spacing-6">
        <EmptyState userName={userName} />
      </div>
    )
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[48rem] px-spacing-4 pb-spacing-6 pt-spacing-8">
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} userName={userName} />
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({ userName }: { readonly userName: string }) {
  const firstName = userName.split(" ")[0] || userName
  return (
    <div className="text-center">
      <h1 className="text-[2rem] font-semibold leading-[1.2] tracking-[-0.02em] text-text-primary">
        What can I help with, {firstName}?
      </h1>
      <p className="mt-spacing-3 text-[0.9375rem] leading-[1.6] text-text-secondary">
        Send a message to start a conversation.
      </p>
    </div>
  )
}

function MessageRow({
  message,
  userName,
}: {
  readonly message: ChatMessage
  readonly userName: string
}) {
  const isUser = message.role === "user"
  const label = isUser ? userName.split(" ")[0] || userName : "Assistant"
  const displayContent = isUser ? message.content : stripXlsxJsonBlocks(message.content)

  return (
    <div className="mb-spacing-8 flex gap-spacing-4">
      <Avatar isUser={isUser} />
      <div className="min-w-0 flex-1">
        <div className="text-[0.8125rem] font-semibold leading-[1.4] text-text-primary">
          {label}
        </div>
        <div className="mt-spacing-1 text-[0.9375rem] leading-[1.7] text-text-primary">
          {isUser ? (
            <span className="whitespace-pre-wrap">{displayContent}</span>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
              {message.isStreaming && <StreamingCursor />}
            </div>
          )}
          {message.files && message.files.length > 0 && <FileDownloads files={message.files} />}
        </div>
      </div>
    </div>
  )
}

function stripXlsxJsonBlocks(text: string): string {
  return text.replace(/```xlsx-json\s*\n[\s\S]*?\n```/g, "").trim()
}

function FileDownloads({ files }: { readonly files: readonly FileAttachment[] }) {
  return (
    <div className="mt-spacing-3 flex flex-wrap gap-spacing-2">
      {files.map((file) => (
        <a
          key={file.downloadUrl}
          href={file.downloadUrl}
          download={file.filename}
          className="flex items-center gap-spacing-2 rounded-radius-md border border-border-subtle bg-surface-tertiary px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-primary transition-colors duration-[150ms] hover:bg-surface-secondary"
        >
          <Download size={15} />
          <span>{file.filename}</span>
        </a>
      ))}
    </div>
  )
}

function Avatar({ isUser }: { readonly isUser: boolean }) {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-text-secondary"
      aria-hidden="true"
    >
      {isUser ? <User size={15} /> : <Sparkles size={15} />}
    </div>
  )
}

function StreamingCursor() {
  return (
    <span
      className="ml-[2px] inline-block h-[1em] w-[2px] animate-pulse bg-text-primary align-text-bottom"
      aria-label="Streaming"
    />
  )
}
