import { redirect } from "next/navigation"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default function SettingsPage() {
  redirect("/chat?settings=skills")
}
