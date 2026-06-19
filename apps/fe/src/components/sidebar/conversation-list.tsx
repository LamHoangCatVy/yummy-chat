"use client"

import { createConversation, listConversations } from "@/lib/api"
import type { Conversation } from "@yummy/shared"
import { AlertCircle, Loader2, MessageSquarePlus } from "lucide-react"
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
 * Sidebar conversation list per DESIGN.md sidebar spec:
 * - New chat button (prominent, top)
 * - Conversation history list (truncated titles, timestamps)
 * - Empty / loading / error / archived states
 * - Active indicator on selected conversation
 * - Collapses to drawer overlay at bp-md (handled by parent layout)
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
      {/* Header with New Chat button */}
      <div className="shrink-0 border-b border-border-subtle px-spacing-3 py-spacing-3">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-spacing-2 rounded-radius-md bg-accent-primary px-spacing-4 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-inverse transition-[transform,opacity] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          aria-label="Start new conversation"
        >
          {isCreating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <MessageSquarePlus size={16} />
          )}
          {isCreating ? "Creating..." : "New chat"}
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-spacing-2 py-spacing-2">
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
  const formattedDate = formatRelativeDate(conversation.updatedAt)

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={`group flex w-full flex-col rounded-radius-md px-spacing-3 py-spacing-2 text-left transition-colors duration-[150ms] ${
        isActive
          ? "bg-surface-tertiary text-text-primary"
          : "text-text-primary hover:bg-surface-tertiary"
      }`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="truncate text-[0.8125rem] font-medium leading-[1.5]">
        {conversation.title}
      </span>
      <span className="mt-spacing-0.5 text-[0.75rem] leading-[1.4] text-text-tertiary">
        {formattedDate}
      </span>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-8 text-center">
      <MessageSquarePlus size={24} className="text-text-tertiary" />
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        No conversations yet
      </p>
      <p className="mt-spacing-1 text-[0.75rem] leading-[1.4] text-text-tertiary">
        Start a new chat to begin
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-8">
      <Loader2 size={24} className="animate-spin text-text-tertiary" />
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
      <AlertCircle size={24} className="text-status-error" />
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO date string as a relative time label. */
function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMinutes < 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
