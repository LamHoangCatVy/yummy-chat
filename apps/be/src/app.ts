import { apiReference } from "@scalar/hono-api-reference"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { createAuth } from "./lib/auth"
import { corsMiddleware } from "./middleware/cors"
import { handleError, handleNotFound } from "./middleware/error-handler"
import { loggingMiddleware } from "./middleware/logging"
import { requestIdMiddleware } from "./middleware/request-id"
import type { RequestIdVariables } from "./middleware/request-id"
import { secureHeadersMiddleware } from "./middleware/secure-headers"
import { createSessionMiddleware } from "./middleware/session"
import type { SessionVariables } from "./middleware/session"
import { createApiRouter } from "./routes"

export type AppVariables = RequestIdVariables & SessionVariables

export function createApp() {
  const auth = createAuth()
  const app = new Hono<{ Variables: AppVariables }>()

  // Global middleware — order matters
  app.use("*", requestIdMiddleware)
  app.use("*", corsMiddleware())
  app.use("*", secureHeadersMiddleware)
  app.use("*", createSessionMiddleware(auth))
  app.use("*", loggingMiddleware)

  // API routes
  const apiRouter = createApiRouter(auth)
  app.route("/", apiRouter)

  // OpenAPI spec endpoint
  app.get(
    "/api/v1/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        openapi: "3.1.0",
        info: {
          title: "Yummy Chat API",
          version: "0.1.0",
          description: "API for the Yummy Chat application",
        },
        servers: [{ url: "http://localhost:3001", description: "Local development" }],
      },
    }),
  )

  // Scalar API reference
  app.get(
    "/api/docs",
    apiReference({
      url: "/api/v1/openapi.json",
      pageTitle: "Yummy Chat API",
    }),
  )

  // Error handling
  app.onError(handleError)
  app.notFound(handleNotFound)

  return app
}
