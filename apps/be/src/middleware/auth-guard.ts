import type { ApiErrorResponse } from "@yummy/shared"
import { createMiddleware } from "hono/factory"
import { auditFromContext, emitAuditEvent } from "../lib/audit.js"
import type { RequestIdVariables } from "./request-id.js"
import type { SessionVariables } from "./session.js"

type AuthGuardVariables = RequestIdVariables & SessionVariables

export const requireAuth = createMiddleware<{
  Variables: AuthGuardVariables
}>(async (c, next) => {
  const user = c.get("user")
  if (!user) {
    const ctx = auditFromContext(c)
    emitAuditEvent({
      event_type: "auth.failure",
      user_id: null,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
      outcome: "failure",
      details: {
        method: c.req.method,
        path: c.req.path,
        reason: "missing_session",
      },
    })

    const body: ApiErrorResponse = {
      success: false,
      error: {
        type: "AUTH_ERROR",
        message: "Authentication required",
        statusCode: 401,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: c.get("requestId"),
      },
    }
    return c.json(body, 401)
  }
  await next()
})
