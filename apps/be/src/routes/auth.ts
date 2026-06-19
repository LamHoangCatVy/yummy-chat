import { API_V1 } from "@yummy/shared"
import { Hono } from "hono"
import { auditFromContext, emitAuditEvent } from "../lib/audit"
import type { Auth } from "../lib/auth"
import type { RequestIdVariables } from "../middleware/request-id"
import type { SessionVariables } from "../middleware/session"

type AuthRouteVariables = RequestIdVariables & SessionVariables

export function createAuthRouter(auth: Auth) {
  const router = new Hono<{ Variables: AuthRouteVariables }>()

  router.all(`${API_V1.AUTH}/*`, async (c) => {
    const path = c.req.path
    const method = c.req.method
    const ctx = auditFromContext(c)
    const user = c.get("user")

    let eventType: "auth.login" | "auth.logout" | "auth.signup" | "auth.failure" = "auth.login"
    if (path.includes("sign-out") || path.includes("logout")) {
      eventType = "auth.logout"
    } else if (path.includes("sign-up") || path.includes("register")) {
      eventType = "auth.signup"
    } else if (path.includes("sign-in")) {
      eventType = "auth.login"
    }

    const response = await auth.handler(c.req.raw)

    const isSuccess = response.status >= 200 && response.status < 300

    emitAuditEvent({
      event_type: isSuccess ? eventType : "auth.failure",
      user_id: user?.id ?? null,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
      outcome: isSuccess ? "success" : "failure",
      details: {
        method,
        path,
        status: response.status,
      },
    })

    return response
  })

  return router
}
