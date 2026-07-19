"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  ApiError,
  createSkill,
  deleteSkill,
  downloadAgentSkill,
  importAgentSkill,
  listSkills,
  updateSkill,
} from "@/lib/api"
import type { Skill } from "@yummy/shared"
import {
  AlertCircle,
  Download,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type LoadStatus = "idle" | "loading" | "error"

export function SkillsManager() {
  const [skills, setSkills] = useState<readonly Skill[]>([])
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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
    async (input: { name: string; description: string; prompt: string; model: string }) => {
      setIsCreating(false)
      try {
        const skill = await createSkill({ ...input, enabled: true })
        setSkills((prev) => [...prev, skill])
      } catch (err: unknown) {
        const message = err instanceof ApiError ? err.message : "Failed to create skill"
        setErrorMsg(message)
      }
    },
    [],
  )

  const handleUpdate = useCallback(
    async (
      id: string,
      input: { name?: string; description?: string; prompt?: string; model?: string },
    ) => {
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

  const handleImport = useCallback(async (file: File) => {
    setIsImporting(true)
    setErrorMsg(null)
    try {
      const imported = await importAgentSkill(file)
      setSkills((previous) => {
        const exists = previous.some((skill) => skill.id === imported.id)
        return exists
          ? previous.map((skill) => (skill.id === imported.id ? imported : skill))
          : [...previous, imported]
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to import Agent Skill"
      setErrorMsg(message)
    } finally {
      setIsImporting(false)
      if (importInputRef.current) importInputRef.current.value = ""
    }
  }, [])

  const handleDownload = useCallback(async (skill: Skill) => {
    try {
      const blob = await downloadAgentSkill(skill.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${skill.slug}.zip`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to export Agent Skill"
      setErrorMsg(message)
    }
  }, [])

  const handleEnabledChange = useCallback(async (skill: Skill, enabled: boolean) => {
    try {
      const updated = await updateSkill(skill.id, { enabled })
      setSkills((previous) => previous.map((item) => (item.id === skill.id ? updated : item)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update Agent Skill"
      setErrorMsg(message)
    }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.015em] text-text-primary">
          Agent Skills
        </h2>
        <div className="flex items-center gap-spacing-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".md,.zip,text/markdown,application/zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
            }}
          />
          <Button
            variant="outline"
            disabled={isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            {isImporting ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
            Import SKILL.md
          </Button>
          <Button onClick={() => setIsCreating(true)}>
            <Plus size={14} />
            Create skill
          </Button>
        </div>
      </div>
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Reusable Agent Skills load progressively. The model sees each name and description, then
        activates full instructions and bundled resources only when relevant.
      </p>

      {errorMsg && (
        <div className="mt-spacing-4 flex items-center gap-spacing-2 rounded-radius-md border border-status-error/20 bg-status-error/5 px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-status-error">
          <AlertCircle size={14} className="shrink-0" />
          {errorMsg}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setErrorMsg(null)
              void fetchSkills()
            }}
            className="ml-auto h-auto px-0 text-status-error"
          >
            Retry
          </Button>
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
              initial={{
                name: skill.name,
                description: skill.description,
                prompt: skill.prompt,
                model: skill.model,
              }}
              onSubmit={(input) => void handleUpdate(skill.id, input)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SkillCard
              key={skill.id}
              skill={skill}
              onEdit={() => setEditingId(skill.id)}
              onDelete={() => void handleDelete(skill.id)}
              onDownload={() => void handleDownload(skill)}
              onEnabledChange={(enabled) => void handleEnabledChange(skill, enabled)}
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
  onDownload,
  onEnabledChange,
}: {
  readonly skill: Skill
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly onDownload: () => void
  readonly onEnabledChange: (enabled: boolean) => void
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
            {skill.slug}
          </p>
          <p className="mt-spacing-2 line-clamp-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
            {skill.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-spacing-1">
          <Switch
            checked={skill.enabled}
            onCheckedChange={onEnabledChange}
            aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onDownload}
            aria-label={`Download ${skill.name}`}
          >
            <Download size={14} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${skill.name}`}>
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="hover:bg-status-error/10 hover:text-status-error"
            aria-label={`Delete ${skill.name}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface SkillFormProps {
  readonly initial?: { name: string; description: string; prompt: string; model: string }
  readonly onSubmit: (input: {
    name: string
    description: string
    prompt: string
    model: string
  }) => void
  readonly onCancel: () => void
}

function SkillForm({ initial, onSubmit, onCancel }: SkillFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [prompt, setPrompt] = useState(initial?.prompt ?? "")
  const [model, setModel] = useState(initial?.model ?? "default")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !description.trim() || !prompt.trim() || isSubmitting) return
    setIsSubmitting(true)
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      model: model.trim() || "default",
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-spacing-3 rounded-radius-md border border-border-default bg-surface-secondary px-spacing-4 py-spacing-4"
    >
      <div className="flex flex-col gap-spacing-3">
        <div>
          <Label
            htmlFor="skill-name"
            className="mb-spacing-1 text-[0.75rem] tracking-[0.05em] uppercase text-text-tertiary"
          >
            Name
          </Label>
          <Input
            id="skill-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Code Reviewer"
            required
          />
        </div>
        <div>
          <Label
            htmlFor="skill-model"
            className="mb-spacing-1 text-[0.75rem] tracking-[0.05em] uppercase text-text-tertiary"
          >
            Model
          </Label>
          <Input
            id="skill-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="default"
          />
          <p className="mt-spacing-1 text-[0.75rem] leading-[1.4] text-text-tertiary">
            Legacy model override. Leave as default to use the conversation model.
          </p>
        </div>
        <div>
          <Label
            htmlFor="skill-description"
            className="mb-spacing-1 text-[0.75rem] tracking-[0.05em] uppercase text-text-tertiary"
          >
            Description and activation trigger
          </Label>
          <Input
            id="skill-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Review code for correctness and security. Use for code review requests."
            maxLength={1024}
            required
          />
        </div>
        <div>
          <Label
            htmlFor="skill-prompt"
            className="mb-spacing-1 text-[0.75rem] tracking-[0.05em] uppercase text-text-tertiary"
          >
            System Prompt / SKILL.md instructions
          </Label>
          <textarea
            id="skill-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              "# Instructions\n\n1. Inspect the requested code.\n2. Report findings by severity."
            }
            rows={7}
            className="w-full resize-y rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary placeholder:text-text-tertiary focus:border-border-accent focus:outline-none"
            required
          />
        </div>
        <div className="flex items-center justify-end gap-spacing-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !name.trim() || !description.trim() || !prompt.trim()}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {initial ? "Save changes" : "Create skill"}
          </Button>
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
        Create or import a SKILL.md bundle to add a reusable agent workflow.
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
      <Button type="button" size="sm" onClick={onRetry} className="mt-spacing-2">
        Retry
      </Button>
    </div>
  )
}
