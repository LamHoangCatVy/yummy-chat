import { API_V1 } from "@yummy/shared"

export interface AuthUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly emailVerified: boolean
  readonly image: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AuthSession {
  readonly id: string
  readonly userId: string
  readonly token: string
  readonly expiresAt: string
  readonly ipAddress: string | null
  readonly userAgent: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SessionResponse {
  readonly user: AuthUser
  readonly session: AuthSession
}

export interface AuthError {
  readonly message: string
}

interface SignInInput {
  readonly email: string
  readonly password: string
}

interface SignUpInput {
  readonly name: string
  readonly email: string
  readonly password: string
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as AuthError | null
    throw new Error(body?.message ?? `Auth request failed (${res.status})`)
  }

  return res.json() as Promise<T>
}

export async function signIn(input: SignInInput): Promise<SessionResponse> {
  return authFetch<SessionResponse>(`${API_V1.AUTH}/sign-in/email`, {
    method: "POST",
    body: JSON.stringify(input),
    credentials: "include",
  })
}

export async function signUp(input: SignUpInput): Promise<SessionResponse> {
  return authFetch<SessionResponse>(`${API_V1.AUTH}/sign-up/email`, {
    method: "POST",
    body: JSON.stringify(input),
    credentials: "include",
  })
}

export async function signOut(): Promise<void> {
  await authFetch<unknown>(`${API_V1.AUTH}/sign-out`, {
    method: "POST",
    credentials: "include",
  })
}

export async function getSession(): Promise<SessionResponse | null> {
  const res = await fetch(`${API_V1.AUTH}/get-session`, {
    credentials: "include",
  })
  if (!res.ok) return null
  const data = (await res.json()) as SessionResponse | null
  return data
}
