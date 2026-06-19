import { API_V1 } from "@yummy/shared"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { SessionResponse } from "./auth-client"

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001"

export async function getServerSession(): Promise<SessionResponse | null> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()

  if (!cookieHeader) return null

  try {
    const res = await fetch(`${API_BASE_URL}${API_V1.AUTH}/get-session`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    })

    if (!res.ok) return null
    const data = (await res.json()) as SessionResponse | null
    return data
  } catch {
    return null
  }
}

export async function requireSession(): Promise<SessionResponse> {
  const session = await getServerSession()
  if (!session) redirect("/login")
  return session
}
