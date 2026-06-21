import type { ApiErrorResponse, UserId } from "@yummy/shared"
import { Hono } from "hono"
import { generatedFileRepository } from "../lib/repositories.js"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

type RouteVariables = RequestIdVariables & SessionVariables

export const filesRouter = new Hono<{ Variables: RouteVariables }>()

filesRouter.use("*", requireAuth)

function meta(c: { get: (key: "requestId") => string }) {
  return {
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId"),
  } as const
}

filesRouter.get("/:id", async (c) => {
  const id = c.req.param("id")

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "File not found",
        statusCode: 404,
        resource: "file",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  const user = c.get("user")
  const actor = { userId: (user?.id ?? "") as UserId }
  const repo = generatedFileRepository(actor)
  const file = await repo.getById(id)

  if (!file) {
    const res: ApiErrorResponse = {
      success: false,
      error: {
        type: "NOT_FOUND_ERROR",
        message: "File not found",
        statusCode: 404,
        resource: "file",
      },
      meta: meta(c),
    }
    return c.json(res, 404)
  }

  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.byteSize),
    },
  })
})
