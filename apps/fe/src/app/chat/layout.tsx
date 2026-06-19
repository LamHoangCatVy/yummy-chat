import { requireSession } from "@/lib/auth-server"
import type { ReactNode } from "react"
import { ChatSidebarClient } from "./chat-sidebar-client"

interface ChatLayoutProps {
  readonly children: ReactNode
}

/**
 * Server component layout for the /chat route.
 *
 * Per DESIGN.md:
 * - Three-zone layout: sidebar (left, 260px) + chat surface (center, flex-1)
 * - Sidebar uses surface-secondary, chat uses surface-primary
 * - On bp-md and below, sidebar collapses into a drawer overlay
 * - Max content width for chat surface is 768px (centered)
 */
// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for layout
export default async function ChatLayout({ children }: ChatLayoutProps) {
  const { user } = await requireSession()
  const userName = user.name || user.email

  return <ChatSidebarClient userName={userName}>{children}</ChatSidebarClient>
}
