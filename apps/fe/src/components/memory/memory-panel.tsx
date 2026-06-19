"use client"

import { getMemorySettings, listMemoryEntries, updateMemorySettings } from "@/lib/api"
import { ApiError } from "@/lib/api"
import type { MemoryEntry } from "@yummy/shared"
import { AlertCircle, Brain, Loader2, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

interface MemoryPanelProps {
  readonly onClose: () => void
}

type LoadStatus = "idle" | "loading" | "error"

export function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [entries, setEntries] = useState<readonly MemoryEntry[]>([])
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isEnabled, setIsEnabled] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

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
      const { deleteMemoryEntry } = await import("@/lib/api")
      await deleteMemoryEntry(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to delete entry"
      setErrorMsg(message)
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-surface-secondary">
      <div className="flex items-center justify-between border-b border-border-subtle px-spacing-4 py-spacing-3">
        <div className="flex items-center gap-spacing-2">
          <Brain size={18} className="text-accent-secondary" />
          <h2 className="text-[1.125rem] font-medium leading-[1.4] tracking-[-0.01em] text-text-primary">
            Memory
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-secondary"
          aria-label="Close memory panel"
        >
          <X size={16} />
        </button>
      </div>

      {settingsLoaded && (
        <div className="border-b border-border-subtle px-spacing-4 py-spacing-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.8125rem] font-medium leading-[1.5] text-text-primary">
                Enable memory
              </p>
              <p className="text-[0.75rem] leading-[1.4] text-text-tertiary">
                {isEnabled
                  ? "The AI will remember context across conversations."
                  : "Memory is disabled. The AI won't retain information between sessions."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
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

      <div className="flex-1 overflow-y-auto px-spacing-4 py-spacing-3">
        {errorMsg && (
          <div className="mb-spacing-3 flex items-center gap-spacing-2 rounded-radius-md border border-status-error/20 bg-status-error/5 px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-status-error">
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

        {status === "loading" && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-spacing-12">
            <Loader2 size={24} className="animate-spin text-text-tertiary" />
            <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
              Loading memory...
            </p>
          </div>
        )}

        {status === "error" && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-spacing-12 text-center">
            <AlertCircle size={24} className="text-status-error" />
            <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
              Failed to load memory entries
            </p>
          </div>
        )}

        {!isEnabled && settingsLoaded && (
          <div className="flex flex-col items-center justify-center py-spacing-8 text-center">
            <Brain size={32} className="text-text-tertiary" />
            <p className="mt-spacing-3 text-[0.8125rem] leading-[1.5] text-text-secondary">
              Memory is disabled. Enable it above to let the AI remember context across
              conversations.
            </p>
          </div>
        )}

        {isEnabled && status !== "loading" && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-spacing-8 text-center">
            <Brain size={32} className="text-text-tertiary" />
            <p className="mt-spacing-3 text-[0.8125rem] leading-[1.5] text-text-secondary">
              No memory entries yet. Memories will be created as you chat with the AI.
            </p>
          </div>
        )}

        {isEnabled &&
          entries.map((entry) => (
            <MemoryEntryCard
              key={entry.id}
              entry={entry}
              onDelete={() => void handleDelete(entry.id)}
            />
          ))}
      </div>
    </div>
  )
}

function MemoryEntryCard({
  entry,
  onDelete,
}: {
  readonly entry: MemoryEntry
  readonly onDelete: () => void
}) {
  return (
    <div className="mb-spacing-2 rounded-radius-md border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2">
      <div className="flex items-start justify-between gap-spacing-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-spacing-2">
            <span className="truncate text-[0.8125rem] font-medium leading-[1.5] text-text-primary">
              {entry.key}
            </span>
            {entry.category && (
              <span className="shrink-0 rounded-radius-full bg-accent-ghost px-spacing-2 py-spacing-0.5 text-[0.6875rem] font-medium leading-[1.3] tracking-[0.05em] uppercase text-accent-secondary">
                {entry.category}
              </span>
            )}
          </div>
          <p className="mt-spacing-1 line-clamp-3 text-[0.8125rem] leading-[1.5] text-text-secondary">
            {entry.value}
          </p>
          {entry.confidence !== null && entry.confidence !== undefined && (
            <p className="mt-spacing-1 text-[0.75rem] leading-[1.4] text-text-tertiary">
              Confidence: {Math.round(entry.confidence * 100)}%
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-status-error/10 hover:text-status-error"
          aria-label={`Delete ${entry.key}`}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
