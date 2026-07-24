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
  get userApiKeyEncryptionSecret(): string {
    return requireEnv("USER_API_KEY_ENCRYPTION_SECRET")
  },
  get openaiApiKey(): string | undefined {
    return process.env.OPENAI_API_KEY
  },
  get openaiModel(): string {
    return optionalEnv("OPENAI_MODEL", "gpt-5-nano")
  },
  get memoryApiKey(): string | undefined {
    return process.env.MEMORY_API_KEY || process.env.OPENAI_API_KEY
  },
  get memoryBaseUrl(): string {
    return optionalEnv("MEMORY_BASE_URL", "https://api.openai.com/v1")
  },
  get memoryExtractionModel(): string {
    return optionalEnv("MEMORY_EXTRACTION_MODEL", "gpt-5-nano")
  },
  get memoryEmbeddingModel(): string {
    return optionalEnv("MEMORY_EMBEDDING_MODEL", "text-embedding-3-small")
  },
  get memoryV2Enabled(): boolean {
    return process.env.MEMORY_V2_ENABLED !== "false"
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
  get mcpLocalCommandsEnabled(): boolean {
    return process.env.MCP_ALLOW_LOCAL_COMMANDS === "true"
  },
} as const

export type Env = typeof env
