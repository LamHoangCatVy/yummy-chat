import type { ApiErrorResponse } from "@yummy/shared"
import { createMiddleware } from "hono/factory"
import { emitAuditEvent } from "../lib/audit.js"

export interface RateLimitConfig {
  readonly windowMs: number
  readonly maxRequests: number
  readonly keyFn: (c: {
    req: { header: (name: string) => string | undefined }
    get: (key: "requestId") => string | undefined
  }) => string
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

let cleanupTimer: ReturnType<typeof setInterval> | undefined

function ensureCleanup(): void {
  if (cleanupTimer !== undefined) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key)
      }
    }
  }, 60_000)
  cleanupTimer.unref?.()
}

export function rateLimiter(config: RateLimitConfig) {
  ensureCleanup()

  return createMiddleware<{ Variables: { requestId: string } }>(async (c, next) => {
    const key = config.keyFn(c)
    const now = Date.now()
    const entry = store.get(key)

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + config.windowMs })
      await next()
      return
    }

    if (entry.count >= config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      const requestId = c.get("requestId") ?? "unknown"

      emitAuditEvent({
        event_type: "rate_limit.exceeded",
        user_id: null,
        ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        user_agent: c.req.header("user-agent") ?? null,
        request_id: requestId,
        outcome: "failure",
        details: {
          method: c.req.method,
          path: c.req.path,
          key,
          retry_after: retryAfter,
        },
      })

      const body: ApiErrorResponse = {
        success: false,
        error: {
          type: "RATE_LIMIT_ERROR",
          message: "Too many requests, please try again later",
          statusCode: 429,
          retryAfter,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      }
      c.res.headers.set("Retry-After", String(retryAfter))
      return c.json(body, 429)
    }

    entry.count++
    await next()
  })
}

export const authRateLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  keyFn: (c) => `auth:${c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown"}`,
})

export const chatRateLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyFn: (c) => {
    const userId = c.req.header("x-user-id")
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown"
    return `chat:${userId ?? ip}`
  },
})

/** Visible for testing — clears the in-memory store */
export function resetRateLimitStore(): void {
  store.clear()
}
