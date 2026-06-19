import type { ApiErrorResponse, YummyError } from "@yummy/shared"
import type { Context, ErrorHandler } from "hono"

function makeMeta(c: Context) {
  return {
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId") ?? "unknown",
  } as const
}

function isYummyError(err: unknown): err is YummyError {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    "statusCode" in err &&
    "message" in err
  )
}

export const handleError: ErrorHandler = (err, c) => {
  if (isYummyError(err)) {
    const body: ApiErrorResponse = {
      success: false,
      error: err,
      meta: makeMeta(c),
    }
    return c.json(body, err.statusCode as 400 | 401 | 403 | 404 | 429 | 500)
  }

  const body: ApiErrorResponse = {
    success: false,
    error: {
      type: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      statusCode: 500,
    },
    meta: makeMeta(c),
  }
  return c.json(body, 500)
}

export function handleNotFound(c: Context) {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      type: "NOT_FOUND_ERROR",
      message: `Route ${c.req.method} ${c.req.path} not found`,
      statusCode: 404,
      resource: c.req.path,
    },
    meta: makeMeta(c),
  }
  return c.json(body, 404)
}
