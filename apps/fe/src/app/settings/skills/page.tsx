import { SkillsManager } from "@/components/skills/skills-manager"
import { requireSession } from "@/lib/auth-server"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default async function SkillsSettingsPage() {
  await requireSession()

  return <SkillsManager />
}
