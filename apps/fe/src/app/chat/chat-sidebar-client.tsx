"use client"

import { ConversationProvider, useConversation } from "@/components/sidebar/conversation-context"
import { ConversationList } from "@/components/sidebar/conversation-list"
import { signOut } from "@/lib/auth-client"
import { Cpu, Menu } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"

interface ChatSidebarClientProps {
  readonly children: ReactNode
  readonly userName: string
}

/**
 * Client component that manages sidebar state, conversation switching,
 * and mobile drawer behavior.
 *
 * DESIGN.md layout spec:
 * - Sidebar: 260px fixed width, surface-secondary background
 * - Chat area: flex-1, surface-primary background
 * - Mobile (bp-md and below): hamburger toggle, drawer overlay
 * - Tonal-shift depth: no border between sidebar and chat (tonal shift alone)
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

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

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch {
      // Force redirect even if sign-out API fails
    }
    window.location.href = "/login"
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 flex-col md:flex">
        <div className="flex min-h-0 flex-1 flex-col">
          <ConversationList
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
          />
        </div>
        {/* User section at bottom of sidebar */}
        <div className="shrink-0 border-t border-border-subtle px-spacing-3 py-spacing-3">
          <div className="flex items-center justify-between">
            <span className="truncate text-[0.8125rem] font-medium leading-[1.5] text-text-primary">
              {userName}
            </span>
            <div className="flex items-center gap-spacing-2">
              <Link
                href="/settings/skills"
                className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-secondary"
                aria-label="Settings"
              >
                <Cpu size={14} />
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-[0.75rem] leading-[1.4] text-text-tertiary transition-colors duration-[150ms] hover:text-text-secondary"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
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
              <ConversationList
                activeId={activeId}
                onSelect={handleSelectConversation}
                onNewConversation={handleNewConversation}
                isMobile
                onCloseMobile={() => setIsMobileMenuOpen(false)}
              />
            </div>
            <div className="shrink-0 border-t border-border-subtle px-spacing-3 py-spacing-3">
              <div className="flex items-center justify-between">
                <span className="truncate text-[0.8125rem] font-medium leading-[1.5] text-text-primary">
                  {userName}
                </span>
                <div className="flex items-center gap-spacing-2">
                  <Link
                    href="/settings/skills"
                    className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-secondary"
                    aria-label="Settings"
                  >
                    <Cpu size={14} />
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-[0.75rem] leading-[1.4] text-text-tertiary transition-colors duration-[150ms] hover:text-text-secondary"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
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
    </div>
  )
}
