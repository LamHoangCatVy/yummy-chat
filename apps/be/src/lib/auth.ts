import { db } from "@yummy/db"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { env } from "./env.js"

export function createAuth(database = db) {
  return betterAuth({
    baseURL: env.betterAuthUrl,
    basePath: "/api/v1/auth",
    secret: env.betterAuthSecret,
    database: drizzleAdapter(database, {
      provider: "pg",
    }),
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: env.corsOrigins,
    advanced: {
      generateId: () => crypto.randomUUID(),
      useSecureCookies: env.appEnv === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
