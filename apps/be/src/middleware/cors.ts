import type { MiddlewareHandler } from "hono"
import { cors } from "hono/cors"
import { env } from "../lib/env"

export function corsMiddleware(): MiddlewareHandler {
  return cors({
    origin: env.corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id", "Retry-After"],
    credentials: true,
    maxAge: 600,
  })
}
