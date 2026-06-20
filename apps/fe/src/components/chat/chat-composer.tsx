"use client"

import { ModelSelector } from "@/components/models/model-selector"
import { SkillSelector } from "@/components/skills/skill-selector"
import { ArrowUp, Square } from "lucide-react"
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
  readonly selectedModel: string | null
  readonly onModelSelect: (modelId: string) => void
}

/**
 * Multi-line text input anchored to the bottom of the chat surface.
 *
 * ChatGPT-style composer:
 * - Rounded pill container with a subtle border, two-row layout.
 * - Textarea on top; skill selector (left) and send button (right) below.
 * - Send is a circular black button with an up-arrow; disabled state is muted.
 * - Stop button replaces send while streaming.
 * - Enter to send, Shift+Enter for newline.
 */
export function ChatComposer({
  status,
  onSend,
  onStop,
  disabled = false,
  conversationId,
  selectedSkillId,
  onSkillSelect,
  selectedModel,
  onModelSelect,
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
    <div className="bg-surface-primary px-spacing-4 pb-spacing-4 pt-spacing-2">
      <div className="mx-auto max-w-[48rem]">
        <div className="flex flex-col rounded-[28px] border border-border-subtle bg-surface-primary px-spacing-4 py-spacing-3 transition-[border-color,box-shadow] duration-[150ms] focus-within:border-border-hover focus-within:shadow-[0_0_0_3px_var(--color-accent-ghost)]">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              handleInput()
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message yummy-chat"
            disabled={disabled || isStreaming}
            rows={1}
            className="max-h-[200px] flex-1 resize-none border-0 bg-transparent text-[0.9375rem] leading-[1.6] text-text-primary shadow-none outline-none ring-0 placeholder:text-text-tertiary focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none disabled:opacity-40"
            aria-label="Message input"
          />
          <div className="mt-spacing-2 flex items-center justify-between gap-spacing-2">
            <div className="flex min-w-0 items-center gap-spacing-2">
              <SkillSelector
                conversationId={conversationId}
                selectedSkillId={selectedSkillId}
                onSelect={onSkillSelect}
              />
              <ModelSelector selectedModel={selectedModel} onSelect={onModelSelect} />
            </div>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary text-text-inverse transition-[opacity,transform] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.96]"
                aria-label="Stop generating"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSend}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary text-text-inverse transition-[opacity,transform,background-color] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.96] disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:pointer-events-none"
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-spacing-2 text-center text-[0.75rem] leading-[1.4] text-text-tertiary">
          yummy-chat can make mistakes. Check important info.
        </p>
      </div>
    </div>
  )
}
