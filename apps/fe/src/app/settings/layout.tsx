import type { ReactNode } from "react"

import { requireSession } from "@/lib/auth-server"
import { SettingsNav } from "./settings-nav"

interface SettingsLayoutProps {
  readonly children: ReactNode
}

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for layout
export default async function SettingsLayout({ children }: SettingsLayoutProps) {
  await requireSession()

  return (
    <div className="flex min-h-screen bg-surface-primary">
      <SettingsNav />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-spacing-6 py-spacing-8">{children}</div>
      </main>
    </div>
  )
}
