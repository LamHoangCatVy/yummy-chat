"use client"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  clearMemoryEntries,
  deleteMemoryEntry,
  getMemorySettings,
  listMemoryEntries,
  updateMemorySettings,
} from "@/lib/api"
import { ApiError } from "@/lib/api"
import type { MemoryEntry } from "@yummy/shared"
import { AlertCircle, Brain, Loader2, Pencil, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

type LoadStatus = "idle" | "loading" | "error"

export function MemoryManager() {
  const [entries, setEntries] = useState<readonly MemoryEntry[]>([])
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedMemoryEnabled, setSavedMemoryEnabled] = useState(false)
  const [chatHistoryEnabled, setChatHistoryEnabled] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setStatus("loading")
    setErrorMsg(null)
    try {
      const [settingsResult, entriesResult] = await Promise.all([
        getMemorySettings(),
        listMemoryEntries(),
      ])
      setSavedMemoryEnabled(settingsResult.savedMemoryEnabled)
      setChatHistoryEnabled(settingsResult.chatHistoryEnabled)
      setSettingsLoaded(true)
      setEntries(entriesResult.entries)
      setStatus("idle")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load memory"
      setErrorMsg(message)
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const updateSettings = useCallback(
    async (saved: boolean, history: boolean) => {
      if (isToggling) return
      setIsToggling(true)
      try {
        const result = await updateMemorySettings({
          savedMemoryEnabled: saved,
          chatHistoryEnabled: saved && history,
        })
        setSavedMemoryEnabled(result.savedMemoryEnabled)
        setChatHistoryEnabled(result.chatHistoryEnabled)
      } catch (err: unknown) {
        const message = err instanceof ApiError ? err.message : "Failed to update settings"
        setErrorMsg(message)
      } finally {
        setIsToggling(false)
      }
    },
    [isToggling],
  )

  const handleClear = useCallback(async () => {
    try {
      await clearMemoryEntries()
      setEntries([])
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to clear memory"
      setErrorMsg(message)
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMemoryEntry(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to delete entry"
      setErrorMsg(message)
    }
  }, [])

  const handleUpdate = useCallback(async (id: string, input: { key: string; value: string }) => {
    try {
      const { updateMemoryEntry } = await import("@/lib/api")
      const updated = await updateMemoryEntry(id, input)
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)))
      setEditingId(null)
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to update entry"
      setErrorMsg(message)
    }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.015em] text-text-primary">
          Memory
        </h2>
        {entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => void handleClear()}>
            Clear all
          </Button>
        )}
      </div>
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Memory stores key information across conversations. When enabled, the AI uses these memories
        for better context.
      </p>

      {settingsLoaded && (
        <div className="mt-spacing-6 rounded-radius-md border border-border-subtle bg-surface-secondary px-spacing-4 py-spacing-4">
          <div className="flex items-center justify-between gap-spacing-4">
            <div>
              <p className="text-[0.9375rem] font-medium leading-[1.4] text-text-primary">
                Saved memories
              </p>
              <p className="mt-spacing-1 text-[0.8125rem] leading-[1.5] text-text-secondary">
                Keep stable preferences and facts across conversations.
              </p>
            </div>
            <Switch
              checked={savedMemoryEnabled}
              aria-label="Saved memories"
              onCheckedChange={(checked) => void updateSettings(checked, chatHistoryEnabled)}
              disabled={isToggling}
            />
          </div>
          <div className="mt-spacing-4 flex items-center justify-between gap-spacing-4 border-t border-border-subtle pt-spacing-4">
            <div>
              <p className="text-[0.9375rem] font-medium leading-[1.4] text-text-primary">
                Reference chat history
              </p>
              <p className="mt-spacing-1 text-[0.8125rem] leading-[1.5] text-text-secondary">
                Find relevant context from earlier Yummy Chat conversations.
              </p>
            </div>
            <Switch
              checked={chatHistoryEnabled}
              aria-label="Reference chat history"
              onCheckedChange={(checked) => void updateSettings(savedMemoryEnabled, checked)}
              disabled={isToggling || !savedMemoryEnabled}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mt-spacing-4 flex items-center gap-spacing-2 rounded-radius-md border border-status-error/20 bg-status-error/5 px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-status-error">
          <AlertCircle size={14} className="shrink-0" />
          {errorMsg}
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null)
              void fetchData()
            }}
            className="ml-auto text-[0.75rem] font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-spacing-6">
        <h3 className="text-[1.125rem] font-medium leading-[1.4] tracking-[-0.01em] text-text-primary">
          Memory entries
        </h3>

        {status === "loading" && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-spacing-12">
            <Loader2 size={24} className="animate-spin text-text-tertiary" />
            <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
              Loading memory entries...
            </p>
          </div>
        )}

        {status === "error" && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-spacing-12 text-center">
            <AlertCircle size={24} className="text-status-error" />
            <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
              Failed to load memory entries
            </p>
            <button
              type="button"
              onClick={() => void fetchData()}
              className="mt-spacing-2 rounded-radius-md bg-accent-primary px-spacing-3 py-spacing-1 text-[0.75rem] font-medium leading-[1.4] text-text-inverse transition-opacity hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {!savedMemoryEnabled && settingsLoaded && (
          <div className="flex flex-col items-center justify-center py-spacing-12 text-center">
            <Brain size={32} className="text-text-tertiary" />
            <p className="mt-spacing-3 text-[0.8125rem] leading-[1.5] text-text-secondary">
              Enable memory above to view and manage entries.
            </p>
          </div>
        )}

        {savedMemoryEnabled && status !== "loading" && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-spacing-12 text-center">
            <Brain size={32} className="text-text-tertiary" />
            <p className="mt-spacing-3 text-[0.8125rem] leading-[1.5] text-text-secondary">
              No memory entries yet. Memories will be created as you chat with the AI.
            </p>
          </div>
        )}

        {entries.map((entry) =>
          editingId === entry.id ? (
            <MemoryEditForm
              key={entry.id}
              entry={entry}
              onSubmit={(input) => void handleUpdate(entry.id, input)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <MemoryEntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => setEditingId(entry.id)}
              onDelete={() => void handleDelete(entry.id)}
            />
          ),
        )}
      </div>
    </div>
  )
}

function MemoryEntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  readonly entry: MemoryEntry
  readonly onEdit: () => void
  readonly onDelete: () => void
}) {
  return (
    <div className="mt-spacing-3 rounded-radius-md border border-border-subtle bg-surface-secondary px-spacing-4 py-spacing-3">
      <div className="flex items-start justify-between gap-spacing-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-spacing-2">
            <Brain size={14} className="shrink-0 text-accent-secondary" />
            <span className="truncate text-[0.9375rem] font-medium leading-[1.4] text-text-primary">
              {entry.key}
            </span>
            {entry.category && (
              <span className="shrink-0 rounded-radius-full bg-accent-ghost px-spacing-2 py-spacing-half text-[0.6875rem] font-medium leading-[1.3] tracking-[0.05em] uppercase text-accent-secondary">
                {entry.category}
              </span>
            )}
          </div>
          <p className="mt-spacing-2 line-clamp-3 text-[0.8125rem] leading-[1.5] text-text-secondary">
            {entry.value}
          </p>
          {entry.source && (
            <p className="mt-spacing-1 text-[0.75rem] leading-[1.4] text-text-tertiary">
              Source: {entry.source}
            </p>
          )}
          {entry.confidence !== null && entry.confidence !== undefined && (
            <p className="mt-spacing-1 text-[0.75rem] leading-[1.4] text-text-tertiary">
              Confidence: {Math.round(entry.confidence * 100)}%
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-spacing-1">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-secondary"
            aria-label={`Edit ${entry.key}`}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-status-error/10 hover:text-status-error"
            aria-label={`Delete ${entry.key}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function MemoryEditForm({
  entry,
  onSubmit,
  onCancel,
}: {
  readonly entry: MemoryEntry
  readonly onSubmit: (input: { key: string; value: string }) => void
  readonly onCancel: () => void
}) {
  const [key, setKey] = useState(entry.key)
  const [value, setValue] = useState(entry.value)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim() || !value.trim() || isSubmitting) return
    setIsSubmitting(true)
    onSubmit({ key: key.trim(), value: value.trim() })
  }

  return (
    <div className="mt-spacing-3 rounded-radius-md border border-border-default bg-surface-secondary px-spacing-4 py-spacing-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-spacing-3">
        <div>
          <label
            htmlFor={`memory-key-${entry.id}`}
            className="mb-spacing-1 block text-[0.75rem] font-medium leading-[1.4] tracking-[0.05em] uppercase text-text-tertiary"
          >
            Key
          </label>
          <input
            id={`memory-key-${entry.id}`}
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary focus:border-border-accent focus:outline-none"
            required
          />
        </div>
        <div>
          <label
            htmlFor={`memory-value-${entry.id}`}
            className="mb-spacing-1 block text-[0.75rem] font-medium leading-[1.4] tracking-[0.05em] uppercase text-text-tertiary"
          >
            Value
          </label>
          <textarea
            id={`memory-value-${entry.id}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary focus:border-border-accent focus:outline-none"
            required
          />
        </div>
        <div className="flex items-center justify-end gap-spacing-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-radius-md px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-secondary transition-colors duration-[150ms] hover:bg-surface-tertiary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !key.trim() || !value.trim()}
            className="flex items-center gap-spacing-2 rounded-radius-md bg-accent-primary px-spacing-4 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-inverse transition-[transform,opacity] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Save changes
          </button>
        </div>
      </form>
    </div>
  )
}
