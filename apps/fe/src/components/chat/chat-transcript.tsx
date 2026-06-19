"use client"

import { useCallback, useEffect, useRef } from "react"
import type { ChatMessage } from "./types"

interface ChatTranscriptProps {
  readonly messages: readonly ChatMessage[]
  readonly userName: string
}

/**
 * Renders the scrollable message list with streaming text append.
 *
 * - Auto-scrolls to bottom on new content unless the user has scrolled up.
 * - User messages use accent-ghost background (per DESIGN.md chat-bubble spec).
 * - Assistant messages use surface-secondary background.
 * - Streaming state shows a blinking cursor.
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
      <div className="mx-auto max-w-[768px] px-spacing-4 py-spacing-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({ userName }: { readonly userName: string }) {
  return (
    <div className="text-center">
      <h1 className="text-[2.25rem] font-semibold leading-[1.2] tracking-[-0.025em] text-text-primary">
        Welcome back, {userName}
      </h1>
      <p className="mt-spacing-4 text-[0.9375rem] leading-[1.6] text-text-secondary">
        Send a message to start a conversation.
      </p>
    </div>
  )
}

function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className="mb-spacing-4 flex flex-col">
      <div
        className={`rounded-radius-xl px-spacing-4 py-spacing-3 ${
          isUser
            ? "ml-auto max-w-[80%] bg-accent-ghost text-text-primary"
            : "mr-auto max-w-[85%] bg-surface-secondary text-text-primary"
        }`}
      >
        <div className="text-[0.6875rem] font-medium leading-[1.3] tracking-[0.05em] uppercase text-text-tertiary">
          {isUser ? "You" : "Assistant"}
        </div>
        <div className="mt-spacing-1 whitespace-pre-wrap text-[0.9375rem] leading-[1.6]">
          {message.content}
          {message.isStreaming && <StreamingCursor />}
        </div>
      </div>
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
