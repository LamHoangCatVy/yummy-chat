"use client"

import { signUp } from "@/lib/auth-client"
import { ShieldCheck, Sparkles } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { FormEvent } from "react"

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signUp({ name, email, password })
      router.push("/chat")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen overflow-hidden bg-surface-primary lg:grid-cols-[0.92fr_1.08fr]">
      <section className="flex min-h-screen items-center justify-center px-spacing-5 py-spacing-10 md:px-spacing-10">
        <div className="w-full max-w-[28rem]">
          <div className="mb-spacing-8">
            <div className="flex items-center gap-spacing-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-gradient-to-br from-brand-blue to-brand-green text-white shadow-[0_18px_42px_rgba(0,99,177,0.24)]">
                <Sparkles size={23} />
              </div>
              <div>
                <p className="text-[0.75rem] font-bold uppercase tracking-[0.22em] text-brand-green">
                  Yummy
                </p>
                <h1 className="text-[1.1rem] font-semibold tracking-[-0.02em] text-text-primary">
                  Chat Workspace
                </h1>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-border-subtle bg-surface-glass p-spacing-4 shadow-[0_28px_90px_rgba(6,35,59,0.12)] backdrop-blur-2xl">
            <div className="rounded-[24px] bg-surface-raised/80 p-spacing-6 md:p-spacing-8">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-brand-mint text-brand-green">
                  <ShieldCheck size={20} />
                </div>
                <h2 className="mt-spacing-5 text-[2rem] font-semibold leading-[1.1] tracking-[-0.045em] text-text-primary">
                  Create your workspace
                </h2>
                <p className="mt-spacing-2 text-[0.92rem] leading-[1.65] text-text-secondary">
                  Set up your account to start building reusable knowledge with Yummy.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-spacing-7 space-y-spacing-4" noValidate>
                {error && (
                  <div
                    role="alert"
                    className="rounded-[16px] border border-status-error/20 bg-status-error/10 px-spacing-4 py-spacing-3 text-sm leading-[1.5] text-status-error"
                  >
                    {error}
                  </div>
                )}

                <div className="space-y-spacing-2">
                  <label htmlFor="name" className="block text-[0.82rem] font-semibold text-text-primary">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block h-12 w-full rounded-[16px] border border-border-default bg-surface-primary px-spacing-4 text-[0.92rem] text-text-primary outline-none transition-all placeholder:text-text-tertiary focus:border-border-hover focus:shadow-[0_0_0_4px_var(--color-accent-blue-ghost)]"
                    placeholder="Your name"
                  />
                </div>

                <div className="space-y-spacing-2">
                  <label htmlFor="email" className="block text-[0.82rem] font-semibold text-text-primary">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block h-12 w-full rounded-[16px] border border-border-default bg-surface-primary px-spacing-4 text-[0.92rem] text-text-primary outline-none transition-all placeholder:text-text-tertiary focus:border-border-hover focus:shadow-[0_0_0_4px_var(--color-accent-blue-ghost)]"
                    placeholder="you@example.com"
                  />
                </div>

                <div className="space-y-spacing-2">
                  <label htmlFor="password" className="block text-[0.82rem] font-semibold text-text-primary">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block h-12 w-full rounded-[16px] border border-border-default bg-surface-primary px-spacing-4 text-[0.92rem] text-text-primary outline-none transition-all placeholder:text-text-tertiary focus:border-border-hover focus:shadow-[0_0_0_4px_var(--color-accent-blue-ghost)]"
                    placeholder="At least 8 characters"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-12 w-full items-center justify-center rounded-[16px] bg-gradient-to-r from-brand-blue to-brand-green px-spacing-4 text-[0.92rem] font-semibold text-white shadow-[0_18px_36px_rgba(0,99,177,0.24)] transition-all hover:-translate-y-[1px] hover:shadow-[0_22px_44px_rgba(0,99,177,0.3)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </button>
              </form>

              <p className="mt-spacing-6 text-center text-sm text-text-secondary">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-brand-blue underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-brand-navy p-spacing-10 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(90,183,255,0.28),transparent_26rem),radial-gradient(circle_at_80%_80%,rgba(0,166,81,0.34),transparent_28rem)]" />
        <div className="relative z-10 inline-flex w-fit rounded-full border border-white/20 bg-white/10 px-spacing-3 py-spacing-2 text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur-xl">
          Built for focused work
        </div>
        <div className="relative z-10 max-w-[40rem]">
          <h2 className="text-[4.3rem] font-semibold leading-[0.95] tracking-[-0.07em]">
            Your second brain for delivery.
          </h2>
          <p className="mt-spacing-6 max-w-[34rem] text-[1.05rem] leading-[1.75] text-white/70">
            Capture context once, reuse it across requirements, testing, planning, documentation,
            and system analysis.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-spacing-3">
          <AuthMetric value="Plan" label="roadmaps" />
          <AuthMetric value="Draft" label="documents" />
          <AuthMetric value="Reuse" label="knowledge" />
        </div>
      </section>
    </main>
  )
}

function AuthMetric({ value, label }: { readonly value: string; readonly label: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/10 p-spacing-4 backdrop-blur-xl">
      <div className="text-[0.95rem] font-semibold leading-[1.2]">{value}</div>
      <div className="mt-spacing-1 text-[0.72rem] uppercase tracking-[0.14em] text-white/60">
        {label}
      </div>
    </div>
  )
}
