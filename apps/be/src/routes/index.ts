import { API_V1 } from "@yummy/shared"
import { Hono } from "hono"
import type { Auth } from "../lib/auth.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"
import { createAuthRouter } from "./auth.js"
import { chatRouter } from "./chat.js"
import { conversationSkillRouter } from "./conversation-skill.js"
import { conversationsRouter } from "./conversations.js"
import { filesRouter } from "./files.js"
import { healthRouter } from "./health.js"
import { memoryRouter } from "./memory.js"
import { messagesRouter } from "./messages.js"
import { skillsRouter } from "./skills.js"

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
  router.route(API_V1.FILES, filesRouter)

  return router
}
