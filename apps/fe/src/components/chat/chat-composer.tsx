"use client"

import { SkillSelector } from "@/components/skills/skill-selector"
import { SendHorizontal, Square } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import type { StreamStatus } from "./types"

interface ChatComposerProps {
  readonly status: StreamStatus
  readonly onSend: (content: string) => void
  readonly onStop: () => void
  readonly disabled?: boolean
  readonly conversationId: string | null
  readonly selectedSkillId: string | null
  readonly onSkillSelect: (skillId: string | null) => void
}

/**
 * Multi-line text input anchored to the bottom of the chat surface.
 *
 * DESIGN.md composer spec:
 * - Auto-resizing textarea (up to 200px)
 * - Send button appears when text is present (accent-primary)
 * - Enter to send, Shift+Enter for newline
 * - Stop button replaces send during streaming
 * - Focus border transition (150ms, border-accent)
 */
export function ChatComposer({
  status,
  onSend,
  onStop,
  disabled = false,
  conversationId,
  selectedSkillId,
  onSkillSelect,
}: ChatComposerProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = status === "streaming"
  const canSend = value.trim().length > 0 && !isStreaming && !disabled

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming || disabled) return
    onSend(trimmed)
    setValue("")
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, isStreaming, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  // Auto-resize textarea based on content (max 200px)
  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  return (
    <div className="border-t border-border-subtle bg-surface-primary px-spacing-4 py-spacing-3">
      <div className="mx-auto max-w-[768px]">
        <div className="flex items-end gap-spacing-2 rounded-radius-md border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 transition-colors duration-[150ms] focus-within:border-border-accent">
          <SkillSelector
            conversationId={conversationId}
            selectedSkillId={selectedSkillId}
            onSelect={onSkillSelect}
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              handleInput()
            }}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            disabled={disabled || isStreaming}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[0.9375rem] leading-[1.6] text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-40"
            aria-label="Message input"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-sm bg-status-error text-text-inverse transition-[transform] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.98]"
              aria-label="Stop generating"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-sm bg-accent-primary text-text-inverse transition-[transform,opacity] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Send message"
            >
              <SendHorizontal size={16} />
            </button>
          )}
        </div>
        <p className="mt-spacing-1 text-center text-[0.75rem] leading-[1.4] text-text-tertiary">
          Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
