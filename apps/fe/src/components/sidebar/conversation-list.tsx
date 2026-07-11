"use client"

import { useConversation } from "@/components/sidebar/conversation-context"
import { createConversation, deleteConversation, listConversations } from "@/lib/api"
import type { Conversation } from "@yummy/shared"
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface ConversationListProps {
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
  readonly onNewConversation: (id: string) => void
  readonly onDelete?: (id: string) => void
  readonly isMobile?: boolean
  readonly onCloseMobile?: () => void
}

type ListStatus = "idle" | "loading" | "error"

export function ConversationList({
  activeId,
  onSelect,
  onNewConversation,
  onDelete,
  isMobile = false,
  onCloseMobile,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<readonly Conversation[]>([])
  const [status, setStatus] = useState<ListStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [query, setQuery] = useState("")
  const { disableNewChat } = useConversation()

  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(query.trim().toLowerCase()),
  )

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

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id)
      } catch {
        // Silently fail — item is already removed optimistically
      }
      setConversations((prev) => prev.filter((c) => c.id !== id))
      onDelete?.(id)
    },
    [onDelete],
  )

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="shrink-0 px-spacing-4 pb-spacing-3 pt-spacing-4">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={isCreating || disableNewChat}
          className="group flex w-full items-center justify-between overflow-hidden rounded-[18px] bg-gradient-to-r from-brand-blue to-brand-green px-spacing-4 py-spacing-3 text-left text-white shadow-[0_16px_34px_rgba(0,99,177,0.22)] transition-all duration-150 hover:-translate-y-[1px] hover:shadow-[0_20px_42px_rgba(0,99,177,0.28)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          aria-label="Start new conversation"
        >
          <span className="flex min-w-0 items-center gap-spacing-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/18">
              {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.9rem] font-semibold leading-[1.2]">
                {isCreating ? "Creating workspace..." : "New conversation"}
              </span>
              <span className="mt-spacing-half block text-[0.72rem] leading-[1.3] text-white/78">
                Start with a clean context
              </span>
            </span>
          </span>
          <Sparkles size={16} className="shrink-0 opacity-80 transition-transform group-hover:rotate-12" />
        </button>

        <div className="relative mt-spacing-3">
          <Search
            size={15}
            className="pointer-events-none absolute left-spacing-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="h-10 w-full rounded-[16px] border border-border-subtle bg-surface-raised/70 pl-spacing-9 pr-spacing-3 text-[0.82rem] text-text-primary outline-none transition-all duration-150 placeholder:text-text-tertiary focus:border-border-hover focus:bg-surface-raised focus:shadow-[0_0_0_4px_var(--color-accent-blue-ghost)]"
            aria-label="Search conversations"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-spacing-3 pb-spacing-3">
        <div className="mb-spacing-2 flex items-center justify-between px-spacing-1">
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-text-tertiary">
            Recent work
          </span>
          <span className="rounded-full bg-surface-tertiary px-spacing-2 py-spacing-half text-[0.68rem] font-semibold text-text-secondary">
            {filteredConversations.length}
          </span>
        </div>

        {status === "loading" && conversations.length === 0 && <LoadingState />}
        {status === "error" && conversations.length === 0 && (
          <ErrorState message={errorMsg ?? "Unknown error"} onRetry={fetchList} />
        )}
        {status !== "loading" && conversations.length === 0 && <EmptyState />}
        {status !== "loading" && conversations.length > 0 && filteredConversations.length === 0 && (
          <NoSearchResult query={query} />
        )}
        <div className="space-y-spacing-1">
          {filteredConversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      {isMobile && (
        <div className="shrink-0 border-t border-border-subtle px-spacing-3 py-spacing-2">
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-full rounded-radius-md px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-secondary transition-colors duration-150 hover:bg-surface-tertiary hover:text-text-primary"
          >
            Close sidebar
          </button>
        </div>
      )}
    </div>
  )
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  readonly conversation: Conversation
  readonly isActive: boolean
  readonly onSelect: (id: string) => void
  readonly onDelete: (id: string) => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showConfirm) return
    const handle = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowConfirm(false)
      }
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [showConfirm])

  useEffect(() => {
    if (!showConfirm) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowConfirm(false)
    }
    document.addEventListener("keydown", handle)
    return () => document.removeEventListener("keydown", handle)
  }, [showConfirm])

  const handleTrashClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowConfirm((prev) => !prev)
  }, [])

  const handleConfirmDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsDeleting(true)
      void onDelete(conversation.id)
    },
    [conversation.id, onDelete],
  )

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowConfirm(false)
  }, [])

  return (
    <div className="group relative flex w-full items-center">
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className={`flex min-w-0 flex-1 items-center gap-spacing-3 rounded-[16px] border px-spacing-3 py-spacing-3 text-left transition-all duration-150 ${
          isActive
            ? "border-brand-green/30 bg-surface-raised text-text-primary shadow-[0_12px_28px_rgba(6,35,59,0.08)]"
            : "border-transparent text-text-secondary hover:border-border-subtle hover:bg-surface-raised/65 hover:text-text-primary"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${
            isActive ? "bg-brand-mint text-brand-green" : "bg-surface-tertiary text-text-tertiary"
          }`}
          aria-hidden="true"
        >
          <MessageSquare size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.84rem] font-semibold leading-[1.35]">
            {conversation.title}
          </span>
          <span className="mt-spacing-half block truncate text-[0.7rem] leading-[1.25] text-text-tertiary">
            Conversation context
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={handleTrashClick}
        className={`absolute right-spacing-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary transition-all duration-150 hover:bg-surface-tertiary hover:text-status-error ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label={`Delete ${conversation.title}`}
      >
        <Trash2 size={14} />
      </button>

      {showConfirm && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-20 mt-spacing-1 w-[232px] rounded-[18px] border border-border-subtle bg-surface-raised p-spacing-3 shadow-[0_18px_45px_rgba(6,35,59,0.16)]"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <p className="text-[0.82rem] font-semibold leading-[1.4] text-text-primary">
            Delete this conversation?
          </p>
          <p className="mt-spacing-1 text-[0.75rem] leading-[1.45] text-text-tertiary">
            This action cannot be undone.
          </p>
          <div className="mt-spacing-3 flex items-center justify-end gap-spacing-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isDeleting}
              className="rounded-radius-md px-spacing-3 py-spacing-2 text-[0.75rem] font-semibold leading-[1.2] text-text-secondary transition-colors duration-150 hover:bg-surface-tertiary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="rounded-radius-md bg-status-error px-spacing-3 py-spacing-2 text-[0.75rem] font-semibold leading-[1.2] text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border-default bg-surface-raised/45 px-spacing-4 py-spacing-8 text-center">
      <SquarePen size={24} className="text-brand-green" />
      <p className="mt-spacing-2 text-[0.84rem] font-semibold leading-[1.4] text-text-primary">
        No conversations yet
      </p>
      <p className="mt-spacing-1 text-[0.74rem] leading-[1.45] text-text-tertiary">
        Create the first thread to begin building reusable knowledge.
      </p>
    </div>
  )
}

function NoSearchResult({ query }: { readonly query: string }) {
  return (
    <div className="rounded-[20px] border border-border-subtle bg-surface-raised/55 px-spacing-4 py-spacing-6 text-center">
      <Search size={22} className="mx-auto text-text-tertiary" />
      <p className="mt-spacing-2 text-[0.82rem] font-semibold text-text-primary">No match found</p>
      <p className="mt-spacing-1 text-[0.74rem] leading-[1.45] text-text-tertiary">
        No conversation contains “{query}”.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-border-subtle bg-surface-raised/45 px-spacing-4 py-spacing-8">
      <Loader2 size={24} className="animate-spin text-brand-blue" />
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
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-status-error/20 bg-surface-raised/55 px-spacing-4 py-spacing-8 text-center">
      <AlertCircle size={24} className="text-status-error" />
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-spacing-3 rounded-radius-md bg-accent-primary px-spacing-3 py-spacing-2 text-[0.75rem] font-semibold leading-[1.4] text-white transition-opacity hover:opacity-90"
      >
        Retry
      </button>
    </div>
  )
}
