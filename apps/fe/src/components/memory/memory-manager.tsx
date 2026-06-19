"use client"

import {
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
  const [isEnabled, setIsEnabled] = useState(false)
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
      setIsEnabled(settingsResult.enabled)
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

  const handleToggle = useCallback(async () => {
    if (isToggling) return
    setIsToggling(true)
    try {
      const result = await updateMemorySettings({ enabled: !isEnabled })
      setIsEnabled(result.enabled)
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to update settings"
      setErrorMsg(message)
    } finally {
      setIsToggling(false)
    }
  }, [isEnabled, isToggling])

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
      </div>
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Memory stores key information across conversations. When enabled, the AI uses these memories
        for better context.
      </p>

      {settingsLoaded && (
        <div className="mt-spacing-6 rounded-radius-md border border-border-subtle bg-surface-secondary px-spacing-4 py-spacing-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.9375rem] font-medium leading-[1.4] text-text-primary">Memory</p>
              <p className="mt-spacing-1 text-[0.8125rem] leading-[1.5] text-text-secondary">
                {isEnabled
                  ? "Memory is active. The AI retains information across conversations."
                  : "Memory is disabled. The AI won't remember context between sessions."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              aria-label={isEnabled ? "Disable memory" : "Enable memory"}
              onClick={() => void handleToggle()}
              disabled={isToggling}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-radius-full transition-colors duration-[200ms] ${
                isEnabled ? "bg-accent-primary" : "bg-border-default"
              } ${isToggling ? "opacity-60" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-radius-full bg-surface-primary shadow-sm transition-transform duration-[200ms] ${
                  isEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
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

        {!isEnabled && settingsLoaded && (
          <div className="flex flex-col items-center justify-center py-spacing-12 text-center">
            <Brain size={32} className="text-text-tertiary" />
            <p className="mt-spacing-3 text-[0.8125rem] leading-[1.5] text-text-secondary">
              Enable memory above to view and manage entries.
            </p>
          </div>
        )}

        {isEnabled && status !== "loading" && entries.length === 0 && (
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
              <span className="shrink-0 rounded-radius-full bg-accent-ghost px-spacing-2 py-spacing-0.5 text-[0.6875rem] font-medium leading-[1.3] tracking-[0.05em] uppercase text-accent-secondary">
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
    <div className="mt-spacing-3 rounded-radius-md border border-border-accent bg-surface-secondary px-spacing-4 py-spacing-4">
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
