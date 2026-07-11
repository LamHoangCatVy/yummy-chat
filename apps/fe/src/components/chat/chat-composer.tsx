"use client"

import { ModelSelector } from "@/components/models/model-selector"
import { SkillSelector } from "@/components/skills/skill-selector"
import { ArrowUp, Sparkles, Square } from "lucide-react"
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

const SHORTCUTS = [
  "Summarize this into decisions and risks",
  "Create acceptance criteria",
  "Draw a system flow in Mermaid",
] as const

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

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [])

  const handleShortcut = useCallback((prompt: string) => {
    setValue(prompt)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`
    })
  }, [])

  return (
    <div className="shrink-0 px-spacing-4 pb-spacing-4 pt-spacing-2 md:px-spacing-8 md:pb-spacing-6">
      <div className="mx-auto max-w-[58rem]">
        <div className="mb-spacing-3 hidden flex-wrap gap-spacing-2 md:flex">
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut}
              type="button"
              onClick={() => handleShortcut(shortcut)}
              disabled={disabled || isStreaming}
              className="rounded-full border border-border-subtle bg-surface-glass px-spacing-3 py-spacing-2 text-[0.75rem] font-semibold leading-[1.2] text-text-secondary shadow-[0_10px_24px_rgba(6,35,59,0.04)] backdrop-blur-xl transition-all duration-150 hover:-translate-y-[1px] hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {shortcut}
            </button>
          ))}
        </div>

        <div className="rounded-[28px] border border-border-subtle bg-surface-glass p-spacing-2 shadow-[0_24px_70px_rgba(6,35,59,0.14)] backdrop-blur-2xl transition-[border-color,box-shadow,transform] duration-150 focus-within:border-border-hover focus-within:shadow-[0_30px_90px_rgba(0,99,177,0.18)]">
          <div className="rounded-[22px] bg-surface-raised/72 p-spacing-3">
            <div className="flex items-start gap-spacing-3">
              <div className="mt-spacing-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-green sm:flex">
                <Sparkles size={17} />
              </div>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  handleInput()
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask Yummy to analyze, reason, draft, compare, diagram, or plan..."
                disabled={disabled || isStreaming}
                rows={1}
                className="max-h-[220px] min-h-[46px] flex-1 resize-none appearance-none !border-0 bg-transparent text-[0.98rem] leading-[1.65] text-text-primary !shadow-none !outline-none !ring-0 placeholder:text-text-tertiary focus:!border-0 focus:!shadow-none focus:!outline-none focus:!ring-0 focus-visible:!border-0 focus-visible:!shadow-none focus-visible:!outline-none focus-visible:!ring-0 disabled:opacity-40"
                aria-label="Message input"
              />
            </div>

            <div className="mt-spacing-3 flex flex-col gap-spacing-3 border-t border-border-subtle pt-spacing-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-spacing-2">
                <SkillSelector
                  conversationId={conversationId}
                  selectedSkillId={selectedSkillId}
                  onSelect={onSkillSelect}
                />
                <ModelSelector selectedModel={selectedModel} onSelect={onModelSelect} />
                <span className="hidden rounded-full bg-brand-ice px-spacing-3 py-spacing-2 text-[0.72rem] font-semibold text-text-secondary lg:inline-flex">
                  Shift + Enter for new line
                </span>
              </div>

              <div className="flex items-center justify-between gap-spacing-3 sm:justify-end">
                <span className="text-[0.72rem] font-medium leading-[1.3] text-text-tertiary">
                  {isStreaming ? "Yummy is generating..." : "Ready"}
                </span>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStop}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-text-inverse shadow-[0_12px_28px_rgba(6,35,59,0.18)] transition-[opacity,transform] duration-100 ease-in-out hover:opacity-90 active:scale-[0.96]"
                    aria-label="Stop generating"
                  >
                    <Square size={15} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSend}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue to-brand-green text-white shadow-[0_14px_30px_rgba(0,99,177,0.24)] transition-[opacity,transform,filter] duration-100 ease-in-out hover:brightness-105 active:scale-[0.96] disabled:pointer-events-none disabled:grayscale disabled:opacity-45"
                    aria-label="Send message"
                  >
                    <ArrowUp size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <p className="mt-spacing-3 text-center text-[0.75rem] leading-[1.45] text-text-tertiary">
          Yummy can make mistakes. Verify decisions, figures, policies, and production changes.
        </p>
      </div>
    </div>
  )
}
