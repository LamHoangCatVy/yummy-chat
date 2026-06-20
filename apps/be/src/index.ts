import { serve } from "@hono/node-server"
import { createApp } from "./app.js"
import { env } from "./lib/env.js"

const app = createApp()

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`🚀 Yummy Chat API listening on http://localhost:${info.port}`)
    console.log(`📖 API docs: http://localhost:${info.port}/api/docs`)
    console.log(`🏥 Health: http://localhost:${info.port}/api/v1/health`)
  },
)

export type Server = typeof server
