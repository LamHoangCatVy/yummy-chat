"use client"

import { signOut } from "@/lib/auth-client"
import { Brain, Cpu, LogOut, Settings, Wrench } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback } from "react"

const NAV_ITEMS = [
  { href: "/settings/skills", label: "Skills", icon: Cpu },
  { href: "/settings/memory", label: "Memory", icon: Brain },
  { href: "/settings/advanced", label: "Advanced", icon: Wrench },
] as const

interface SettingsNavProps {
  readonly userName: string
}

export function SettingsNav({ userName }: SettingsNavProps) {
  const pathname = usePathname()

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch {
      // Force redirect even if sign-out API fails
    }
    window.location.href = "/login"
  }, [])

  return (
    <aside className="hidden w-[220px] shrink-0 border-r border-border-subtle bg-surface-secondary md:flex md:flex-col">
      <div className="flex items-center gap-spacing-2 border-b border-border-subtle px-spacing-4 py-spacing-4">
        <Settings size={18} className="text-text-secondary" />
        <h1 className="text-[0.9375rem] font-semibold leading-[1.4] text-text-primary">Settings</h1>
      </div>
      <nav className="flex-1 px-spacing-2 py-spacing-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] transition-colors duration-[150ms] ${
                isActive
                  ? "bg-surface-tertiary text-text-primary"
                  : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="shrink-0 border-t border-border-subtle px-spacing-2 py-spacing-2">
        <div className="flex items-center justify-between rounded-radius-md px-spacing-2 py-spacing-1">
          <span className="truncate text-[0.8125rem] font-medium leading-[1.5] text-text-primary">
            {userName}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-7 w-7 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors duration-[150ms] hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
