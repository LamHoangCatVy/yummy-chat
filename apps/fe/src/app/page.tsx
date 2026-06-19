import { getServerSession } from "@/lib/auth-server"
import { redirect } from "next/navigation"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default async function HomePage() {
  const session = await getServerSession()

  if (session) {
    redirect("/chat")
  }

  redirect("/login")
}
