"use client"

import { Brain, ChevronDown, Download } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { stripGeneratedJsonBlocks } from "./chat-transcript-helpers"
import type { ChatMessage, FileAttachment } from "./types"
import { useTypewriter } from "./use-typewriter"

interface ChatTranscriptProps {
  readonly messages: readonly ChatMessage[]
  readonly userName: string
}

/**
 * Renders the scrollable message list with streaming text append.
 *
 * Message rows without avatars or name labels:
 * - User messages are right-aligned within the centered max-w container.
 * - Assistant messages are full-width with justified text.
 * - Streaming state shows a blinking cursor appended to the text.
 */
export function ChatTranscript({ messages, userName }: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)
  const lastMessageContentLengthRef = useRef(0)

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

  const lastMessage = messages[messages.length - 1]
  const currentLastMessageLength =
    (lastMessage?.content.length ?? 0) + (lastMessage?.reasoningContent?.length ?? 0)
  if (currentLastMessageLength !== lastMessageContentLengthRef.current) {
    lastMessageContentLengthRef.current = currentLastMessageLength
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
          <MessageRow key={message.id} message={message} />
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
}: {
  readonly message: ChatMessage
}) {
  const isUser = message.role === "user"
  const displayContent = isUser ? message.content : stripGeneratedJsonBlocks(message.content)

  if (isUser) {
    return (
      <div className="mb-spacing-8 flex justify-end">
        <div className="max-w-[42rem]">
          <div className="rounded-radius-xl bg-surface-tertiary px-spacing-4 py-spacing-3 text-right text-[0.9375rem] leading-[1.7] text-text-primary">
            <span className="whitespace-pre-wrap">{displayContent}</span>
          </div>
          {message.files && message.files.length > 0 && (
            <div className="mt-spacing-3 flex justify-end">
              <FileDownloads files={message.files} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-spacing-8">
      <div className="text-justify text-[0.9375rem] leading-[1.7] text-text-primary">
        {message.reasoningContent && (
          <ThinkingPanel
            reasoning={message.reasoningContent}
            isStreaming={message.isStreaming}
          />
        )}
        <AssistantMessageContent
          content={displayContent}
          isStreaming={message.isStreaming}
          hasReasoning={!!message.reasoningContent}
        />
      </div>
      {message.files && message.files.length > 0 && <FileDownloads files={message.files} />}
    </div>
  )
}

function AssistantMessageContent({
  content,
  isStreaming,
  hasReasoning,
}: {
  readonly content: string
  readonly isStreaming: boolean
  readonly hasReasoning: boolean
}) {
  const { text: typedText, isTyping } = useTypewriter(content, isStreaming)

  if (content.length === 0 && isStreaming) {
    return hasReasoning ? null : <TypingIndicator />
  }

  if (content.length === 0) {
    return null
  }

  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{typedText}</ReactMarkdown>
      {isTyping && <StreamingCursor />}
    </div>
  )
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

function StreamingCursor() {
  return (
    <span
      className="ml-[2px] inline-block h-[1em] w-[2px] animate-pulse bg-text-primary align-text-bottom"
      aria-label="Streaming"
    />
  )
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      <span
        className="h-[4px] w-[4px] animate-bounce rounded-full bg-text-secondary"
        style={{ animationDelay: "-0.3s" }}
      />
      <span
        className="h-[4px] w-[4px] animate-bounce rounded-full bg-text-secondary"
        style={{ animationDelay: "-0.15s" }}
      />
      <span className="h-[4px] w-[4px] animate-bounce rounded-full bg-text-secondary" />
    </span>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-[4px] py-spacing-1" aria-label="Assistant is typing">
      <span
        className="h-[7px] w-[7px] animate-bounce rounded-full bg-text-secondary"
        style={{ animationDelay: "-0.3s" }}
      />
      <span
        className="h-[7px] w-[7px] animate-bounce rounded-full bg-text-secondary"
        style={{ animationDelay: "-0.15s" }}
      />
      <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-text-secondary" />
    </div>
  )
}

function ThinkingPanel({
  reasoning,
  isStreaming,
}: {
  readonly reasoning: string
  readonly isStreaming: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { text: typedReasoning, isTyping } = useTypewriter(reasoning, isStreaming)
  const visible = isStreaming || !collapsed

  return (
    <div className="mb-spacing-3">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        disabled={isStreaming}
        className="flex items-center gap-spacing-2 text-[0.8125rem] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:hover:text-text-secondary"
        aria-expanded={visible}
      >
        <Brain size={14} />
        <span>{isStreaming ? "Thinking" : "Thought process"}</span>
        {isStreaming ? (
          <ThinkingDots />
        ) : (
          <ChevronDown
            size={14}
            className={`transition-transform duration-150 ${collapsed ? "" : "rotate-180"}`}
          />
        )}
      </button>
      {visible && (
        <div className="mt-spacing-2 border-l-2 border-border-subtle pl-spacing-3 text-[0.875rem] leading-[1.6] text-text-secondary">
          <span className="whitespace-pre-wrap">{typedReasoning}</span>
          {isTyping && <StreamingCursor />}
        </div>
      )}
    </div>
  )
}
