"use client"

import { createConversation, listConversations } from "@/lib/api"
import type { Conversation } from "@yummy/shared"
import { AlertCircle, Loader2, SquarePen } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

// ── Types ────────────────────────────────────────────────────────────────────

interface ConversationListProps {
  /** Currently active conversation ID. */
  readonly activeId: string | null
  /** Called when user selects a conversation. */
  readonly onSelect: (id: string) => void
  /** Called when a new conversation is created and selected. */
  readonly onNewConversation: (id: string) => void
  /** Whether the sidebar is in mobile drawer mode. */
  readonly isMobile?: boolean
  /** Called to close the mobile drawer after action. */
  readonly onCloseMobile?: () => void
}

type ListStatus = "idle" | "loading" | "error"

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Sidebar conversation list — ChatGPT-style minimal.
 * - New chat: subtle bordered pill button with a pen icon.
 * - Conversation items: single-line truncated title, neutral hover/active.
 */
export function ConversationList({
  activeId,
  onSelect,
  onNewConversation,
  isMobile = false,
  onCloseMobile,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<readonly Conversation[]>([])
  const [status, setStatus] = useState<ListStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const fetchList = useCallback(async () => {
    setStatus("loading")
    setErrorMsg(null)
    try {
      const result = await listConversations()
      setConversations(result.conversations)
      setStatus("idle")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load conversations"
      setErrorMsg(message)
      setStatus("error")
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const handleNewChat = useCallback(async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const conversation = await createConversation({ title: "New chat" })
      setConversations((prev) => [conversation, ...prev])
      onNewConversation(conversation.id)
      onCloseMobile?.()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create conversation"
      setErrorMsg(message)
    } finally {
      setIsCreating(false)
    }
  }, [isCreating, onNewConversation, onCloseMobile])

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id)
      onCloseMobile?.()
    },
    [onSelect, onCloseMobile],
  )

  return (
    <div className="flex h-full flex-col bg-surface-secondary">
      {/* New chat button */}
      <div className="shrink-0 px-spacing-3 pt-spacing-3 pb-spacing-2">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={isCreating}
          className="flex w-full items-center gap-spacing-2 rounded-full border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-primary transition-colors duration-[150ms] hover:bg-surface-tertiary disabled:opacity-40"
          aria-label="Start new conversation"
        >
          {isCreating ? <Loader2 size={15} className="animate-spin" /> : <SquarePen size={15} />}
          <span>{isCreating ? "Creating..." : "New chat"}</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-spacing-2 py-spacing-1">
        {status === "loading" && conversations.length === 0 && <LoadingState />}
        {status === "error" && conversations.length === 0 && (
          <ErrorState message={errorMsg ?? "Unknown error"} onRetry={fetchList} />
        )}
        {status !== "loading" && conversations.length === 0 && <EmptyState />}
        {conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            isActive={conv.id === activeId}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Footer — mobile close button */}
      {isMobile && (
        <div className="shrink-0 border-t border-border-subtle px-spacing-3 py-spacing-2">
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-full rounded-radius-md px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary transition-colors duration-[150ms] hover:bg-surface-tertiary"
          >
            Close sidebar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: {
  readonly conversation: Conversation
  readonly isActive: boolean
  readonly onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={`group flex w-full items-center rounded-radius-md px-spacing-3 py-spacing-2 text-left transition-colors duration-[150ms] ${
        isActive
          ? "bg-surface-tertiary text-text-primary"
          : "text-text-primary hover:bg-surface-tertiary"
      }`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="truncate text-[0.8125rem] leading-[1.5]">{conversation.title}</span>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-8 text-center">
      <SquarePen size={22} className="text-text-tertiary" />
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        No conversations yet
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-8">
      <Loader2 size={22} className="animate-spin text-text-tertiary" />
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Loading conversations...
      </p>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-8 text-center">
      <AlertCircle size={22} className="text-status-error" />
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-spacing-2 rounded-radius-md bg-accent-primary px-spacing-3 py-spacing-1 text-[0.75rem] font-medium leading-[1.4] text-text-inverse transition-opacity hover:opacity-90"
      >
        Retry
      </button>
    </div>
  )
}
