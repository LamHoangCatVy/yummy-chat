"use client"

import { useCallback, useEffect, useState } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "theme"

/**
 * Reads the resolved theme from the DOM rather than from storage on mount.
 * The inline bootstrap script in the root layout already applied the
 * `.dark` class to <html> before first paint (using localStorage then
 * `prefers-color-scheme`), so reading the class reflects the true initial
 * state without a hydration mismatch or flash.
 */
function readResolvedTheme(): Theme {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/**
 * Theme hook backed by the `.dark` class on <html> and `localStorage`.
 *
 * The initial render returns "light" and corrects to the real resolved theme
 * after mount. This avoids a React hydration mismatch: the server renders
 * without knowing the theme, and the inline script already set the correct
 * class on <html> before paint, so only the DOM-driven value is trustworthy.
 *
 * Toggling flips the class and persists the explicit choice. The bootstrap
 * script honors `'dark'` (dark) and any other value (light), so writing
 * `'light'` or `'dark'` is fully compatible on next load.
 */
export function useTheme(): {
  readonly resolvedTheme: Theme
  readonly toggleTheme: () => void
} {
  const [resolvedTheme, setResolvedTheme] = useState<Theme>("light")

  useEffect(() => {
    setResolvedTheme(readResolvedTheme())
  }, [])

  const toggleTheme = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark"
    document.documentElement.classList.toggle("dark", next === "dark")
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage may be unavailable (private mode); the class toggle still applies for this session.
    }
    setResolvedTheme(next)
  }, [])

  return { resolvedTheme, toggleTheme }
}
