import { API_V1 } from "@yummy/shared"
import type { ApiResponse } from "@yummy/shared"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import type { RequestIdVariables } from "../middleware/request-id"

export const healthRouter = new Hono<{ Variables: RequestIdVariables }>()

healthRouter.get(
  "/",
  describeRoute({
    summary: "Health check",
    description: "Returns the health status of the API",
    responses: {
      200: {
        description: "Service is healthy",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                data: {
                  type: "object",
                  properties: {
                    status: { type: "string", enum: ["ok", "degraded", "error"] },
                    version: { type: "string" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                  required: ["status", "version", "timestamp"],
                },
                meta: {
                  type: "object",
                  properties: {
                    timestamp: { type: "string", format: "date-time" },
                    requestId: { type: "string" },
                  },
                  required: ["timestamp", "requestId"],
                },
              },
              required: ["success", "data", "meta"],
            },
          },
        },
      },
    },
  }),
  (c) => {
    const requestId = c.get("requestId")
    const timestamp = new Date().toISOString()

    const body: ApiResponse<{
      status: "ok"
      version: string
      timestamp: string
    }> = {
      success: true,
      data: {
        status: "ok",
        version: "0.1.0",
        timestamp,
      },
      meta: {
        timestamp,
        requestId,
      },
    }

    return c.json(body, 200)
  },
)

export { API_V1 }
