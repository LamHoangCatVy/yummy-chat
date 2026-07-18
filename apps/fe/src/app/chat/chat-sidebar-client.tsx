"use client"

import type { SettingsSection } from "@/components/settings/settings-modal"
import { ConversationProvider, useConversation } from "@/components/sidebar/conversation-context"
import { ConversationList } from "@/components/sidebar/conversation-list"
import { signOut } from "@/lib/auth-client"
import { LogOut, Menu, Plug, Settings } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

const SettingsModal = dynamic(() =>
  import("@/components/settings/settings-modal").then((module) => module.SettingsModal),
)

const SETTINGS_SECTIONS = new Set<SettingsSection>(["mcp", "skills", "memory", "advanced"])

function parseSettingsSection(value: string | null): SettingsSection | null {
  return value && SETTINGS_SECTIONS.has(value as SettingsSection)
    ? (value as SettingsSection)
    : null
}

interface ChatSidebarClientProps {
  readonly children: ReactNode
  readonly userName: string
}

/**
 * Client component that manages sidebar state, conversation switching,
 * and mobile drawer behavior.
 *
 * Layout:
 * - Sidebar: surface-secondary background, tonal-shift depth (no border vs chat).
 * - Chat area: surface-primary, flex-1.
 * - Mobile (bp-md and below): hamburger toggle + drawer overlay.
 */
export function ChatSidebarClient({ children, userName }: ChatSidebarClientProps) {
  return (
    <ConversationProvider>
      <ChatSidebarInner userName={userName}>{children}</ChatSidebarInner>
    </ConversationProvider>
  )
}

function ChatSidebarInner({
  children,
  userName,
}: { readonly children: ReactNode; readonly userName: string }) {
  const { activeId, setActiveId } = useConversation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const modalOpenedFromChatRef = useRef(false)
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const rawSettingsSection = searchParams.get("settings")
  const settingsSection = parseSettingsSection(rawSettingsSection)

  const settingsUrl = useCallback(
    (section: SettingsSection | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (section) {
        params.set("settings", section)
      } else {
        params.delete("settings")
      }
      const query = params.toString()
      return query ? `/chat?${query}` : "/chat"
    },
    [searchParams],
  )

  useEffect(() => {
    if (rawSettingsSection && !settingsSection) {
      router.replace(settingsUrl(null), { scroll: false })
    }
  }, [rawSettingsSection, router, settingsSection, settingsUrl])

  useEffect(() => {
    if (!settingsSection && settingsTriggerRef.current) {
      const trigger = settingsTriggerRef.current
      settingsTriggerRef.current = null
      requestAnimationFrame(() => trigger.focus())
    }
  }, [settingsSection])

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
    },
    [setActiveId],
  )

  const handleNewConversation = useCallback(
    (id: string) => {
      setActiveId(id)
    },
    [setActiveId],
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      if (activeId === id) {
        setActiveId(null)
      }
    },
    [activeId, setActiveId],
  )

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch {
      // Force redirect even if sign-out API fails
    }
    window.location.href = "/login"
  }, [])

  const handleOpenSettings = useCallback(
    (section: SettingsSection, trigger: HTMLButtonElement) => {
      settingsTriggerRef.current = trigger
      modalOpenedFromChatRef.current = true
      setIsMobileMenuOpen(false)
      router.push(settingsUrl(section), { scroll: false })
    },
    [router, settingsUrl],
  )

  const handleChangeSettingsSection = useCallback(
    (section: SettingsSection) => {
      router.replace(settingsUrl(section), { scroll: false })
    },
    [router, settingsUrl],
  )

  const handleCloseSettings = useCallback(() => {
    if (modalOpenedFromChatRef.current) {
      modalOpenedFromChatRef.current = false
      router.back()
      return
    }
    router.replace(settingsUrl(null), { scroll: false })
  }, [router, settingsUrl])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 flex-col md:flex">
        <div className="flex min-h-0 flex-1 flex-col">
          <McpSidebarButton onOpenSettings={handleOpenSettings} />
          <ConversationList
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDelete={handleDeleteConversation}
          />
        </div>
        <UserFooter
          userName={userName}
          onOpenSettings={handleOpenSettings}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Mobile overlay + drawer */}
      {isMobileMenuOpen && (
        <>
          {/* Scrim backdrop */}
          <div
            className="fixed inset-0 z-40 bg-surface-overlay md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsMobileMenuOpen(false)
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close sidebar"
          />
          {/* Drawer */}
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col md:hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <McpSidebarButton onOpenSettings={handleOpenSettings} />
              <ConversationList
                activeId={activeId}
                onSelect={handleSelectConversation}
                onNewConversation={handleNewConversation}
                onDelete={handleDeleteConversation}
                isMobile
                onCloseMobile={() => setIsMobileMenuOpen(false)}
              />
            </div>
            <UserFooter
              userName={userName}
              onOpenSettings={handleOpenSettings}
              onSignOut={handleSignOut}
            />
          </aside>
        </>
      )}

      {/* Main chat area */}
      <main className="flex min-w-0 flex-1 flex-col bg-surface-primary">
        {/* Mobile header with hamburger */}
        <header className="flex h-12 shrink-0 items-center border-b border-border-subtle px-spacing-4 md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-secondary transition-colors duration-[150ms] hover:bg-surface-tertiary"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <h1 className="ml-spacing-2 text-[0.9375rem] font-semibold leading-[1.4] text-text-primary">
            yummy-chat
          </h1>
        </header>

        {/* Chat content */}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>

      {settingsSection && (
        <SettingsModal
          section={settingsSection}
          onSectionChange={handleChangeSettingsSection}
          onClose={handleCloseSettings}
        />
      )}
    </div>
  )
}

function McpSidebarButton({
  onOpenSettings,
}: {
  readonly onOpenSettings: (section: SettingsSection, trigger: HTMLButtonElement) => void
}) {
  return (
    <div className="shrink-0 bg-surface-secondary px-spacing-3 pt-spacing-3">
      <button
        type="button"
        onClick={(event) => onOpenSettings("mcp", event.currentTarget)}
        className="flex w-full items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-primary transition-colors duration-[150ms] hover:bg-surface-tertiary"
        aria-label="MCP servers and tools"
      >
        <Plug size={16} />
        <span>MCP</span>
      </button>
    </div>
  )
}

function UserFooter({
  userName,
  onOpenSettings,
  onSignOut,
}: {
  readonly userName: string
  readonly onOpenSettings: (section: SettingsSection, trigger: HTMLButtonElement) => void
  readonly onSignOut: () => void
}) {
  return (
    <div className="shrink-0 border-t border-border-subtle px-spacing-2 py-spacing-2">
      <div className="flex items-center justify-between rounded-radius-md px-spacing-2 py-spacing-1">
        <span className="min-w-0 truncate text-[0.8125rem] font-medium leading-[1.5] text-text-primary">
          {userName}
        </span>
        <div className="flex shrink-0 items-center gap-spacing-half">
          <button
            type="button"
            onClick={(event) => onOpenSettings("skills", event.currentTarget)}
            className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Settings"
          >
            <Settings size={15} />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
