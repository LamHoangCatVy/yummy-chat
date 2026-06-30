"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/lib/use-theme"

/**
 * Fixed top-right theme toggle, mounted globally in the root layout so it
 * appears on every page (login, chat, settings).
 *
 * Design notes (DESIGN.md):
 * - Monochrome: `text-text-secondary` → hover `text-text-primary`, neutral
 *   `bg-surface-secondary` + `border-border-subtle` so it stays legible over
 *   any backdrop. No colored accent.
 * - Tonal-shift depth: a subtle border + surface fill, no shadow.
 * - Icons via Lucide (no emojis). Moon shown in light mode (→ go dark),
 *   Sun shown in dark mode (→ go light).
 * - Flash-free: the icon visibility is driven by the `dark:` variant, which
 *   keys off the `.dark` class the inline bootstrap script sets before paint,
 *   so the correct icon shows on first render with no hydration mismatch.
 * - Motion: 150ms color transition (motion-micro).
 */
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme()

  const label =
    resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="fixed right-spacing-4 top-spacing-4 z-50 flex h-9 w-9 items-center justify-center rounded-radius-md border border-border-subtle bg-surface-secondary text-text-secondary transition-colors duration-[150ms] ease-in-out hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-accent"
    >
      {/* Moon: visible in light mode (click → dark) */}
      <Moon size={18} className="block dark:hidden" aria-hidden />
      {/* Sun: visible in dark mode (click → light) */}
      <Sun size={18} className="hidden dark:block" aria-hidden />
    </button>
  )
}
