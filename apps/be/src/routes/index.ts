import { API_V1 } from "@yummy/shared"
import { Hono } from "hono"
import type { Auth } from "../lib/auth"
import type { RequestIdVariables } from "../middleware/request-id"
import type { SessionVariables } from "../middleware/session"
import { createAuthRouter } from "./auth"
import { chatRouter } from "./chat"
import { conversationSkillRouter } from "./conversation-skill"
import { conversationsRouter } from "./conversations"
import { healthRouter } from "./health"
import { memoryRouter } from "./memory"
import { messagesRouter } from "./messages"
import { skillsRouter } from "./skills"

type RouteVariables = RequestIdVariables & SessionVariables

export function createApiRouter(auth: Auth) {
  const router = new Hono<{ Variables: RouteVariables }>()

  router.route(API_V1.HEALTH, healthRouter)
  router.route("/", createAuthRouter(auth))
  router.route(API_V1.CONVERSATIONS, conversationsRouter)
  router.route(`${API_V1.CONVERSATIONS}/:id/messages`, messagesRouter)
  router.route(`${API_V1.CONVERSATIONS}/:id/skill`, conversationSkillRouter)
  router.route(API_V1.SKILLS, skillsRouter)
  router.route(API_V1.CHAT, chatRouter)
  router.route(API_V1.MEMORY, memoryRouter)

  return router
}
