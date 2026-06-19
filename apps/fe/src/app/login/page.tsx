"use client"

import { signIn } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { FormEvent } from "react"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signIn({ email, password })
      router.push("/chat")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[2.25rem] font-semibold leading-[1.2] tracking-[-0.025em] text-text-primary">
            yummy-chat
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-[1.6] text-text-secondary">
            Sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-status-error/20 bg-status-error/5 px-3 py-2 text-sm text-status-error"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-text-primary">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-md border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-border-accent focus:ring-1 focus:ring-border-accent"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-text-primary">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-md border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-border-accent focus:ring-1 focus:ring-border-accent"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-md bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-text-secondary">
          Don&apos;t have an account?{" "}
          <a href="/register" className="font-medium text-accent-primary hover:underline">
            Create one
          </a>
        </p>
      </div>
    </main>
  )
}
