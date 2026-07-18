"use client"

import { McpManager } from "@/components/mcp/mcp-manager"
import { MemoryManager } from "@/components/memory/memory-manager"
import { SkillsManager } from "@/components/skills/skills-manager"
import { Brain, Cpu, Plug, Settings, Wrench, X } from "lucide-react"
import { type MouseEvent, useEffect, useRef } from "react"
import { AdvancedSettings } from "./advanced-settings"

export type SettingsSection = "mcp" | "skills" | "memory" | "advanced"

const NAV_ITEMS = [
  { section: "mcp", label: "MCP", icon: Plug },
  { section: "skills", label: "Skills", icon: Cpu },
  { section: "memory", label: "Memory", icon: Brain },
  { section: "advanced", label: "Advanced", icon: Wrench },
] as const satisfies readonly {
  readonly section: SettingsSection
  readonly label: string
  readonly icon: typeof Settings
}[]

interface SettingsModalProps {
  readonly section: SettingsSection
  readonly onSectionChange: (section: SettingsSection) => void
  readonly onClose: () => void
}

export function SettingsModal({ section, onSectionChange, onClose }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const handleDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    const dialog = event.currentTarget
    const bounds = dialog.getBoundingClientRect()
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    if (clickedOutside) onClose()
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismissal is handled by the dialog's native cancel event.
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-dialog-title"
      className="settings-dialog fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-surface-primary p-0 text-text-primary md:m-auto md:h-[calc(100dvh-2rem)] md:max-h-[720px] md:w-[calc(100vw-2rem)] md:max-w-[960px] md:rounded-radius-xl md:border md:border-border-default"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={handleDialogClick}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-spacing-4 py-spacing-3 md:px-spacing-5">
          <div className="flex items-center gap-spacing-2">
            <Settings size={18} className="text-text-secondary" aria-hidden />
            <h1
              id="settings-dialog-title"
              className="text-[0.9375rem] font-semibold leading-[1.4] text-text-primary"
            >
              Settings
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Close settings"
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Settings sections"
            className="shrink-0 border-b border-border-subtle bg-surface-secondary px-spacing-2 py-spacing-2 md:w-[220px] md:border-r md:border-b-0"
          >
            <div className="flex gap-spacing-1 overflow-x-auto md:flex-col">
              {NAV_ITEMS.map(({ section: itemSection, label, icon: Icon }) => {
                const isActive = section === itemSection
                return (
                  <button
                    key={itemSection}
                    type="button"
                    onClick={() => onSectionChange(itemSection)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] transition-colors duration-[150ms] md:w-full ${
                      isActive
                        ? "bg-surface-tertiary text-text-primary"
                        : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
                    }`}
                  >
                    <Icon size={16} aria-hidden />
                    {label}
                  </button>
                )
              })}
            </div>
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto px-spacing-4 py-spacing-6 md:px-spacing-8 md:py-spacing-8">
            <div className="mx-auto max-w-[640px]">
              {section === "mcp" && <McpManager />}
              {section === "skills" && <SkillsManager />}
              {section === "memory" && <MemoryManager />}
              {section === "advanced" && <AdvancedSettings />}
            </div>
          </main>
        </div>
      </div>
    </dialog>
  )
}
