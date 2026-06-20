"use client"

import { API_V1, modelListResponseSchema } from "@yummy/shared"
import type { ModelItem } from "@yummy/shared"
import { ChevronDown, Cpu, Loader2 } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

interface ModelSelectorProps {
  readonly selectedModel: string | null
  readonly onSelect: (modelId: string) => void
}

type LoadStatus = "idle" | "loading" | "error"

async function fetchAvailableModels(): Promise<readonly ModelItem[]> {
  const response = await fetch(API_V1.MODELS)
  if (!response.ok) throw new Error("Could not load models")

  const json: unknown = await response.json()
  const data =
    typeof json === "object" && json !== null && "data" in json
      ? (json as { data: unknown }).data
      : json
  const parsed = modelListResponseSchema.safeParse(data)
  if (!parsed.success) throw new Error("Could not load models")

  return parsed.data.models
}

export function ModelSelector({ selectedModel, onSelect }: ModelSelectorProps) {
  const [models, setModels] = useState<readonly ModelItem[]>([])
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const selectedModelItem = models.find((model) => model.id === selectedModel) ?? null
  const hasModels = models.length > 0

  const fetchModels = useCallback(async () => {
    setStatus("loading")
    try {
      const result = await fetchAvailableModels()
      setModels(result)
      setActiveIndex(0)
      setStatus("idle")
    } catch {
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void fetchModels()
  }, [fetchModels])

  useEffect(() => {
    const firstModel = models[0]
    if (selectedModel === null && firstModel) {
      onSelect(firstModel.id)
    }
  }, [models, onSelect, selectedModel])

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  const handleSelect = useCallback(
    (modelId: string) => {
      onSelect(modelId)
      setIsOpen(false)
    },
    [onSelect],
  )

  const openList = useCallback(() => {
    const selectedIndex = models.findIndex((model) => model.id === selectedModel)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setIsOpen(true)
  }, [models, selectedModel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Escape") {
        setIsOpen(false)
        return
      }

      if ((e.key === "Enter" || e.key === " ") && !isOpen) {
        e.preventDefault()
        openList()
        return
      }

      if (!hasModels) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (!isOpen) {
          openList()
          return
        }
        setActiveIndex((prev) => (prev + 1) % models.length)
        return
      }

      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (!isOpen) {
          openList()
          return
        }
        setActiveIndex((prev) => (prev - 1 + models.length) % models.length)
        return
      }

      if (e.key === "Enter" && isOpen) {
        e.preventDefault()
        const activeModel = models[activeIndex]
        if (activeModel) handleSelect(activeModel.id)
      }
    },
    [activeIndex, handleSelect, hasModels, isOpen, models, openList],
  )

  if (status === "loading") {
    return (
      <div className="flex h-8 w-8 items-center justify-center" aria-label="Loading models">
        <Loader2 size={16} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={() => void fetchModels()}
        className="flex h-8 max-w-[180px] items-center gap-spacing-1 rounded-radius-sm px-spacing-2 py-spacing-1 text-[0.8125rem] leading-[1.5] text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-secondary"
        aria-label="Retry loading models"
        title="Could not load models"
      >
        <Cpu size={14} className="shrink-0" />
        <span className="truncate">Could not load models</span>
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        // biome-ignore lint/a11y/useSemanticElements: custom ARIA combobox for styled dropdown
        type="button"
        role="combobox"
        onClick={() => (isOpen ? setIsOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-spacing-1 rounded-radius-sm px-spacing-2 py-spacing-1 text-[0.8125rem] leading-[1.5] transition-colors duration-[150ms] ${
          selectedModel
            ? "bg-surface-tertiary text-text-primary"
            : "text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary"
        }`}
        aria-label="Model"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
      >
        <Cpu size={14} className="shrink-0" />
        <span className="max-w-[128px] truncate">
          {selectedModelItem?.id ?? selectedModel ?? "Select model"}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-[100ms] ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: custom ARIA listbox for styled dropdown
          role="listbox"
          tabIndex={-1}
          className="absolute bottom-full left-0 z-50 mb-spacing-2 max-h-[260px] w-[260px] overflow-y-auto rounded-radius-md border border-border-subtle bg-surface-primary py-spacing-1"
          aria-label="Available models"
        >
          {!hasModels ? (
            <div className="px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-text-tertiary">
              No models available
            </div>
          ) : (
            models.map((model, index) => {
              const isSelected = model.id === selectedModel
              const showLabel = model.label && model.label !== model.id
              return (
                <button
                  key={model.id}
                  // biome-ignore lint/a11y/useSemanticElements: custom ARIA option for styled listbox
                  type="button"
                  role="option"
                  onClick={() => handleSelect(model.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-center gap-spacing-2 px-spacing-3 py-spacing-2 text-left text-[0.8125rem] leading-[1.5] transition-colors duration-[150ms] hover:bg-surface-tertiary ${
                    isSelected || index === activeIndex
                      ? "bg-surface-tertiary text-text-primary"
                      : "text-text-primary"
                  }`}
                  aria-selected={isSelected}
                >
                  <Cpu size={14} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{model.id}</div>
                    {showLabel ? (
                      <div className="truncate text-[0.75rem] leading-[1.4] text-text-tertiary">
                        {model.label}
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
