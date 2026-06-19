import { ChatContainer } from "@/components/chat/chat-container"
import { requireSession } from "@/lib/auth-server"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default async function ChatPage() {
  const { user } = await requireSession()

  return <ChatContainer userName={user.name || user.email} />
}
