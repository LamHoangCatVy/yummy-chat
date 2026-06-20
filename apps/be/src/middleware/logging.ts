import { createMiddleware } from "hono/factory"
import { redact } from "../lib/redact.js"
import type { RequestIdVariables } from "./request-id.js"
import type { SessionVariables } from "./session.js"

type LogVariables = RequestIdVariables & SessionVariables

/**
 * Structured request logging middleware.
 * Logs every request/response with request ID, redacted headers, and timing.
 * Must be registered AFTER requestIdMiddleware.
 */
export const loggingMiddleware = createMiddleware<{
  Variables: LogVariables
}>(async (c, next) => {
  const start = Date.now()
  const requestId = c.get("requestId")
  const method = c.req.method
  const path = c.req.path

  await next()

  const duration = Date.now() - start
  const status = c.res.status
  const user = c.get("user")

  // Structured log line — headers are redacted
  const logEntry = redact({
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    message: `${method} ${path} ${status}`,
    request_id: requestId,
    method,
    path,
    status,
    duration_ms: duration,
    user_id: user?.id ?? null,
    // Redact sensitive headers
    headers: {
      "user-agent": c.req.header("user-agent"),
      "x-forwarded-for": c.req.header("x-forwarded-for"),
      authorization: c.req.header("authorization"),
      cookie: c.req.header("cookie"),
    },
  })

  const line = JSON.stringify(logEntry)
  if (typeof process !== "undefined" && process.stdout) {
    process.stdout.write(`${line}\n`)
  }
})
