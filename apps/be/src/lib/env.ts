function requireEnv(key: string): string {
  const value = process.env[key]
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optionalEnv(key: string, fallback: string): string {
  const value = process.env[key]
  return value === undefined || value === "" ? fallback : value
}

export const env = {
  get databaseUrl(): string {
    return requireEnv("DATABASE_URL")
  },
  get betterAuthSecret(): string {
    return requireEnv("BETTER_AUTH_SECRET")
  },
  get betterAuthUrl(): string {
    return requireEnv("BETTER_AUTH_URL")
  },
  get llmProviderApiKey(): string | undefined {
    return process.env.LLM_PROVIDER_API_KEY
  },
  get openaiApiKey(): string | undefined {
    return process.env.OPENAI_API_KEY
  },
  get openaiModel(): string {
    return optionalEnv("OPENAI_MODEL", "gpt-5-nano")
  },
  get appEnv(): string {
    return optionalEnv("APP_ENV", "development")
  },
  get port(): number {
    return Number.parseInt(optionalEnv("PORT", "3001"), 10)
  },
  get corsOrigins(): string[] {
    return optionalEnv("CORS_ORIGINS", "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
  },
} as const

export type Env = typeof env
