"use client"

import { Brain, Cpu, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/settings/skills", label: "Skills", icon: Cpu },
  { href: "/settings/memory", label: "Memory", icon: Brain },
] as const

export function SettingsNav() {
  const pathname = usePathname()

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
    </aside>
  )
}
