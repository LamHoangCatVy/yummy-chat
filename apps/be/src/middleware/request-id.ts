import { randomUUID } from "node:crypto"
import { createMiddleware } from "hono/factory"

export type RequestIdVariables = {
  readonly requestId: string
}

export const requestIdMiddleware = createMiddleware<{
  Variables: RequestIdVariables
}>(async (c, next) => {
  const existing = c.req.header("x-request-id")
  const requestId = existing && existing.length > 0 ? existing : randomUUID()
  c.set("requestId", requestId)
  await next()
  c.res.headers.set("X-Request-Id", requestId)
})
