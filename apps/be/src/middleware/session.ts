import { createMiddleware } from "hono/factory"
import type { Auth } from "../lib/auth"

type SessionResponse = Awaited<ReturnType<Auth["api"]["getSession"]>>
type SessionData = NonNullable<SessionResponse>

export type SessionUser = SessionData["user"]
export type SessionSession = SessionData["session"]

export type SessionVariables = {
  readonly user: SessionUser | null
  readonly session: SessionSession | null
}

export function createSessionMiddleware(auth: Auth) {
  return createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      })
      if (!sessionData) {
        c.set("user", null)
        c.set("session", null)
      } else {
        c.set("user", sessionData.user)
        c.set("session", sessionData.session)
      }
    } catch {
      c.set("user", null)
      c.set("session", null)
    }
    return next()
  })
}
