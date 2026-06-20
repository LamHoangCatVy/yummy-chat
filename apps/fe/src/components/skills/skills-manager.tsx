"use client"

import { createSkill, deleteSkill, listSkills, updateSkill } from "@/lib/api"
import { ApiError } from "@/lib/api"
import type { Skill } from "@yummy/shared"
import { AlertCircle, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

type LoadStatus = "idle" | "loading" | "error"

export function SkillsManager() {
  const [skills, setSkills] = useState<readonly Skill[]>([])
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const fetchSkills = useCallback(async () => {
    setStatus("loading")
    setErrorMsg(null)
    try {
      const result = await listSkills()
      setSkills(result.skills)
      setStatus("idle")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load skills"
      setErrorMsg(message)
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void fetchSkills()
  }, [fetchSkills])

  const handleCreate = useCallback(
    async (input: { name: string; prompt: string; model: string }) => {
      setIsCreating(false)
      try {
        const skill = await createSkill(input)
        setSkills((prev) => [...prev, skill])
      } catch (err: unknown) {
        const message = err instanceof ApiError ? err.message : "Failed to create skill"
        setErrorMsg(message)
      }
    },
    [],
  )

  const handleUpdate = useCallback(
    async (id: string, input: { name?: string; prompt?: string; model?: string }) => {
      setEditingId(null)
      try {
        const updated = await updateSkill(id, input)
        setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)))
      } catch (err: unknown) {
        const message = err instanceof ApiError ? err.message : "Failed to update skill"
        setErrorMsg(message)
      }
    },
    [],
  )

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteSkill(id)
      setSkills((prev) => prev.filter((s) => s.id !== id))
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to delete skill"
      setErrorMsg(message)
    }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.015em] text-text-primary">
          Skills
        </h2>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-spacing-2 rounded-radius-md bg-accent-primary px-spacing-4 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-inverse transition-[transform,opacity] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.98]"
        >
          <Plus size={14} />
          Create skill
        </button>
      </div>
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Skills define how the AI behaves in a conversation. Select a skill in the chat composer to
        apply it.
      </p>

      {errorMsg && (
        <div className="mt-spacing-4 flex items-center gap-spacing-2 rounded-radius-md border border-status-error/20 bg-status-error/5 px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-status-error">
          <AlertCircle size={14} className="shrink-0" />
          {errorMsg}
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null)
              void fetchSkills()
            }}
            className="ml-auto text-[0.75rem] font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-spacing-6">
        {status === "loading" && skills.length === 0 && <LoadingState />}
        {status === "error" && skills.length === 0 && (
          <ErrorState message={errorMsg ?? "Unknown error"} onRetry={() => void fetchSkills()} />
        )}
        {status !== "loading" && skills.length === 0 && !isCreating && <EmptyState />}

        {isCreating && <SkillForm onSubmit={handleCreate} onCancel={() => setIsCreating(false)} />}

        {skills.map((skill) =>
          editingId === skill.id ? (
            <SkillForm
              key={skill.id}
              initial={{ name: skill.name, prompt: skill.prompt, model: skill.model }}
              onSubmit={(input) => void handleUpdate(skill.id, input)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SkillCard
              key={skill.id}
              skill={skill}
              onEdit={() => setEditingId(skill.id)}
              onDelete={() => void handleDelete(skill.id)}
            />
          ),
        )}
      </div>
    </div>
  )
}

function SkillCard({
  skill,
  onEdit,
  onDelete,
}: {
  readonly skill: Skill
  readonly onEdit: () => void
  readonly onDelete: () => void
}) {
  return (
    <div className="mt-spacing-3 rounded-radius-md border border-border-subtle bg-surface-secondary px-spacing-4 py-spacing-3">
      <div className="flex items-start justify-between gap-spacing-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-spacing-2">
            <Sparkles size={14} className="shrink-0 text-accent-secondary" />
            <h3 className="truncate text-[0.9375rem] font-medium leading-[1.4] text-text-primary">
              {skill.name}
            </h3>
          </div>
          <p className="mt-spacing-1 text-[0.75rem] leading-[1.4] text-text-tertiary">
            Model: {skill.model}
            {skill.temperature !== null ? ` · Temp: ${skill.temperature}` : null}
            {skill.maxTokens !== null ? ` · Max tokens: ${skill.maxTokens}` : null}
          </p>
          <p className="mt-spacing-2 line-clamp-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
            {skill.prompt}
          </p>
        </div>
        <div className="flex shrink-0 gap-spacing-1">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-secondary"
            aria-label={`Edit ${skill.name}`}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-status-error/10 hover:text-status-error"
            aria-label={`Delete ${skill.name}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

interface SkillFormProps {
  readonly initial?: { name: string; prompt: string; model: string }
  readonly onSubmit: (input: { name: string; prompt: string; model: string }) => void
  readonly onCancel: () => void
}

function SkillForm({ initial, onSubmit, onCancel }: SkillFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [prompt, setPrompt] = useState(initial?.prompt ?? "")
  const [model, setModel] = useState(initial?.model ?? "default")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !prompt.trim() || !model.trim() || isSubmitting) return
    setIsSubmitting(true)
    onSubmit({ name: name.trim(), prompt: prompt.trim(), model: model.trim() })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-spacing-3 rounded-radius-md border border-border-default bg-surface-secondary px-spacing-4 py-spacing-4"
    >
      <div className="flex flex-col gap-spacing-3">
        <div>
          <label
            htmlFor="skill-name"
            className="mb-spacing-1 block text-[0.75rem] font-medium leading-[1.4] tracking-[0.05em] uppercase text-text-tertiary"
          >
            Name
          </label>
          <input
            id="skill-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Code Reviewer"
            className="w-full rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary placeholder:text-text-tertiary focus:border-border-accent focus:outline-none"
            required
          />
        </div>
        <div>
          <label
            htmlFor="skill-model"
            className="mb-spacing-1 block text-[0.75rem] font-medium leading-[1.4] tracking-[0.05em] uppercase text-text-tertiary"
          >
            Model
          </label>
          <input
            id="skill-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. gpt-4o"
            className="w-full rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary placeholder:text-text-tertiary focus:border-border-accent focus:outline-none"
            required
          />
        </div>
        <div>
          <label
            htmlFor="skill-prompt"
            className="mb-spacing-1 block text-[0.75rem] font-medium leading-[1.4] tracking-[0.05em] uppercase text-text-tertiary"
          >
            System Prompt
          </label>
          <textarea
            id="skill-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="You are a helpful assistant that..."
            rows={4}
            className="w-full resize-y rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary placeholder:text-text-tertiary focus:border-border-accent focus:outline-none"
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
            disabled={isSubmitting || !name.trim() || !prompt.trim() || !model.trim()}
            className="flex items-center gap-spacing-2 rounded-radius-md bg-accent-primary px-spacing-4 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-inverse transition-[transform,opacity] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {initial ? "Save changes" : "Create skill"}
          </button>
        </div>
      </div>
    </form>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-12 text-center">
      <Sparkles size={32} className="text-text-tertiary" />
      <h3 className="mt-spacing-4 text-[1.125rem] font-medium leading-[1.4] text-text-primary">
        No skills yet
      </h3>
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Create a skill to customize how the AI behaves in conversations.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-12">
      <Loader2 size={24} className="animate-spin text-text-tertiary" />
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Loading skills...
      </p>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-spacing-4 py-spacing-12 text-center">
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
