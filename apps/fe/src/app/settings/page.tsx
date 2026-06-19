import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth-server"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default async function SettingsPage() {
  await requireSession()
  redirect("/settings/skills")
}
