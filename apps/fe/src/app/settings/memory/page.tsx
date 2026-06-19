import { MemoryManager } from "@/components/memory/memory-manager"
import { requireSession } from "@/lib/auth-server"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default async function MemorySettingsPage() {
  await requireSession()

  return <MemoryManager />
}
