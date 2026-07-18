import type { ReactNode } from "react"

interface SettingsLayoutProps {
  readonly children: ReactNode
}

// Keep legacy settings routes layout-neutral so each page can redirect into the chat modal.
// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for layout
export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return children
}
