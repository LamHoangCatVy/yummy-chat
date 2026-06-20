import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import { requireAuth } from "../middleware/auth-guard.js"
import type { RequestIdVariables } from "../middleware/request-id.js"
import type { SessionVariables } from "../middleware/session.js"

type RouteVariables = RequestIdVariables & SessionVariables

export const filesRouter = new Hono<{ Variables: RouteVariables }>()

filesRouter.use("*", requireAuth)

const TEMP_DIR = join(tmpdir(), "yummy-chat-files")

filesRouter.get("/:id", async (c) => {
  const id = c.req.param("id")
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json(
      {
        success: false,
        error: { type: "NOT_FOUND_ERROR", message: "File not found", statusCode: 404 },
      },
      404,
    )
  }

  const filepath = join(TEMP_DIR, `${id}.xlsx`)
  try {
    const buffer = await readFile(filepath)
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="output-${id.slice(0, 8)}.xlsx"`,
      },
    })
  } catch {
    return c.json(
      {
        success: false,
        error: { type: "NOT_FOUND_ERROR", message: "File not found", statusCode: 404 },
      },
      404,
    )
  }
})
