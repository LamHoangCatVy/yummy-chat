"use client"

import { listSkills, setConversationSkill } from "@/lib/api"
import type { Skill } from "@yummy/shared"
import { ChevronDown, Loader2, Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface SkillSelectorProps {
  readonly conversationId: string | null
  readonly selectedSkillId: string | null
  readonly onSelect: (skillId: string | null) => void
}

type LoadStatus = "idle" | "loading" | "error"

export function SkillSelector({ conversationId, selectedSkillId, onSelect }: SkillSelectorProps) {
  const [skills, setSkills] = useState<readonly Skill[]>([])
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedSkill = skills.find((s) => s.id === selectedSkillId) ?? null

  const fetchSkills = useCallback(async () => {
    setStatus("loading")
    try {
      const result = await listSkills()
      setSkills(result.skills)
      setStatus("idle")
    } catch {
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void fetchSkills()
  }, [fetchSkills])

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
    async (skillId: string | null) => {
      setIsOpen(false)
      if (!conversationId) return

      try {
        await setConversationSkill(conversationId, skillId)
        onSelect(skillId)
      } catch {
        // Keep current selection on failure
      }
    },
    [conversationId, onSelect],
  )

  const handleClear = useCallback(async () => {
    if (!conversationId) return
    try {
      await setConversationSkill(conversationId, null)
      onSelect(null)
    } catch {
      // Keep current selection on failure
    }
    setIsOpen(false)
  }, [conversationId, onSelect])

  if (status === "loading") {
    return (
      <div className="flex h-8 w-8 items-center justify-center">
        <Loader2 size={16} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={() => void fetchSkills()}
        className="flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-secondary"
        aria-label="Retry loading skills"
        title="Failed to load skills — click to retry"
      >
        <Sparkles size={16} />
      </button>
    )
  }

  if (skills.length === 0) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-spacing-1 rounded-radius-sm px-spacing-2 py-spacing-1 text-[0.8125rem] leading-[1.5] transition-colors duration-[150ms] ${
          selectedSkill
            ? "bg-surface-tertiary text-text-primary"
            : "text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary"
        }`}
        aria-label={selectedSkill ? `Skill: ${selectedSkill.name}` : "Select skill"}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Sparkles size={14} />
        {selectedSkill ? (
          <span className="max-w-[120px] truncate">{selectedSkill.name}</span>
        ) : null}
        <ChevronDown
          size={12}
          className={`transition-transform duration-[100ms] ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-0 z-50 mb-spacing-2 w-[240px] rounded-radius-md border border-border-subtle bg-surface-primary py-spacing-1"
          aria-label="Available skills"
        >
          {selectedSkill && (
            <button
              type="button"
              onClick={() => void handleClear()}
              className="flex w-full items-center gap-spacing-2 px-spacing-3 py-spacing-2 text-left text-[0.8125rem] leading-[1.5] text-text-secondary transition-colors duration-[150ms] hover:bg-surface-tertiary"
              aria-selected={false}
            >
              <span className="text-text-tertiary">None</span>
              <span className="text-text-tertiary">Clear skill selection</span>
            </button>
          )}
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => void handleSelect(skill.id)}
              className={`flex w-full items-center gap-spacing-2 px-spacing-3 py-spacing-2 text-left text-[0.8125rem] leading-[1.5] transition-colors duration-[150ms] hover:bg-surface-tertiary ${
                skill.id === selectedSkillId
                  ? "bg-surface-tertiary text-text-primary"
                  : "text-text-primary"
              }`}
              aria-selected={skill.id === selectedSkillId}
            >
              <Sparkles size={14} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{skill.name}</div>
                <div className="truncate text-[0.75rem] leading-[1.4] text-text-tertiary">
                  {skill.model}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
