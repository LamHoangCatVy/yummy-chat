"use client"

import { ConversationProvider, useConversation } from "@/components/sidebar/conversation-context"
import { ConversationList } from "@/components/sidebar/conversation-list"
import { signOut } from "@/lib/auth-client"
import { LogOut, Menu, Settings, ShieldCheck, Sparkles } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"

interface ChatSidebarClientProps {
  readonly children: ReactNode
  readonly userName: string
}

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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

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

  return (
    <div className="flex h-screen overflow-hidden bg-surface-primary p-0 md:p-spacing-3">
      <aside className="hidden w-[304px] shrink-0 flex-col overflow-hidden rounded-[28px] border border-border-subtle bg-surface-glass shadow-[0_24px_80px_rgba(6,35,59,0.10)] backdrop-blur-xl md:flex">
        <BrandHeader />
        <div className="min-h-0 flex-1">
          <ConversationList
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDelete={handleDeleteConversation}
          />
        </div>
        <UserFooter userName={userName} onSignOut={handleSignOut} />
      </aside>

      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-surface-overlay backdrop-blur-[2px] md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsMobileMenuOpen(false)
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close sidebar"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[304px] max-w-[88vw] flex-col overflow-hidden border-r border-border-subtle bg-surface-raised shadow-2xl md:hidden">
            <BrandHeader />
            <div className="min-h-0 flex-1">
              <ConversationList
                activeId={activeId}
                onSelect={handleSelectConversation}
                onNewConversation={handleNewConversation}
                onDelete={handleDeleteConversation}
                isMobile
                onCloseMobile={() => setIsMobileMenuOpen(false)}
              />
            </div>
            <UserFooter userName={userName} onSignOut={handleSignOut} />
          </aside>
        </>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-surface-raised/80 shadow-none backdrop-blur-xl md:ml-spacing-3 md:rounded-[28px] md:border md:border-border-subtle md:shadow-[0_24px_80px_rgba(6,35,59,0.10)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-spacing-4 md:h-16 md:px-spacing-6">
          <div className="flex min-w-0 items-center gap-spacing-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-md border border-border-subtle bg-surface-raised text-text-secondary transition-all duration-150 hover:border-border-hover hover:text-text-primary md:hidden"
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue to-brand-green text-white shadow-[0_12px_30px_rgba(0,99,177,0.24)] md:flex">
              <Sparkles size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-spacing-2">
                <h1 className="truncate text-[0.98rem] font-semibold leading-[1.3] tracking-[-0.02em] text-text-primary md:text-[1.05rem]">
                  Yummy Chat Workspace
                </h1>
                <span className="hidden rounded-full border border-brand-green/25 bg-brand-mint px-spacing-2 py-spacing-half text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-brand-green sm:inline-flex">
                  Live
                </span>
              </div>
              <p className="hidden text-[0.78rem] leading-[1.4] text-text-tertiary md:block">
                Ask, reason, create documents and reuse operating knowledge.
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-spacing-2 rounded-full border border-border-subtle bg-surface-glass px-spacing-3 py-spacing-2 text-[0.78rem] font-medium text-text-secondary md:flex">
            <ShieldCheck size={15} className="text-brand-green" />
            <span>Secure internal assistant</span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  )
}

function BrandHeader() {
  return (
    <div className="shrink-0 border-b border-border-subtle px-spacing-4 py-spacing-4">
      <div className="flex items-center gap-spacing-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-gradient-to-br from-brand-blue via-brand-blue to-brand-green text-white shadow-[0_14px_34px_rgba(0,99,177,0.28)]">
          <Sparkles size={21} />
        </div>
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-brand-green">
            Yummy
          </p>
          <h2 className="truncate text-[1rem] font-semibold leading-[1.2] tracking-[-0.02em] text-text-primary">
            Knowledge Copilot
          </h2>
        </div>
      </div>
      <div className="mt-spacing-4 grid grid-cols-3 gap-spacing-2">
        <SidebarMetric label="Chats" value="AI" />
        <SidebarMetric label="Skills" value="Tools" />
        <SidebarMetric label="Mode" value="Fast" />
      </div>
    </div>
  )
}

function SidebarMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-radius-lg border border-border-subtle bg-surface-raised/70 px-spacing-2 py-spacing-2 text-center">
      <div className="text-[0.72rem] font-semibold leading-[1.2] text-text-primary">{value}</div>
      <div className="mt-spacing-half text-[0.62rem] uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </div>
    </div>
  )
}

function UserFooter({
  userName,
  onSignOut,
}: {
  readonly userName: string
  readonly onSignOut: () => void
}) {
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <div className="shrink-0 border-t border-border-subtle p-spacing-3">
      <div className="flex items-center gap-spacing-3 rounded-[20px] border border-border-subtle bg-surface-raised/75 p-spacing-2 shadow-[0_12px_30px_rgba(6,35,59,0.06)]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-navy text-[0.78rem] font-bold text-text-inverse">
          {initials || "U"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.82rem] font-semibold leading-[1.3] text-text-primary">
            {userName}
          </p>
          <p className="text-[0.72rem] leading-[1.35] text-text-tertiary">Workspace member</p>
        </div>
        <div className="flex shrink-0 items-center gap-spacing-half">
          <Link
            href="/settings/skills"
            className="flex h-8 w-8 items-center justify-center rounded-radius-md text-text-tertiary transition-all duration-150 hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Settings"
          >
            <Settings size={15} />
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-8 w-8 items-center justify-center rounded-radius-md text-text-tertiary transition-all duration-150 hover:bg-surface-tertiary hover:text-status-error"
            aria-label="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
