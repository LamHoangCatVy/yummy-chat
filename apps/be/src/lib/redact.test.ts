import { describe, expect, test } from "vitest"
import { redact, redactAuthHeader, redactUrl } from "./redact"

describe("redact", () => {
  test("redacts password fields", () => {
    const input = { email: "user@test.com", password: "secret123" }
    const result = redact(input)
    expect(result.email).toBe("user@test.com")
    expect(result.password).toBe("[REDACTED]")
  })

  test("redacts token fields", () => {
    const input = { access_token: "abc123", refresh_token: "xyz789" }
    const result = redact(input)
    expect(result.access_token).toBe("[REDACTED]")
    expect(result.refresh_token).toBe("[REDACTED]")
  })

  test("redacts API key fields", () => {
    const input = { api_key: "sk-abc123", apikey: "key-456" }
    const result = redact(input)
    expect(result.api_key).toBe("[REDACTED]")
    expect(result.apikey).toBe("[REDACTED]")
  })

  test("redacts authorization header", () => {
    const input = { authorization: "Bearer token123" }
    const result = redact(input)
    expect(result.authorization).toBe("[REDACTED]")
  })

  test("redacts cookie header", () => {
    const input = { cookie: "session=abc123" }
    const result = redact(input)
    expect(result.cookie).toBe("[REDACTED]")
  })

  test("redacts DATABASE_URL with credentials", () => {
    const input = { DATABASE_URL: "postgres://user:pass@localhost/db" }
    const result = redact(input)
    expect(result.DATABASE_URL).toBe("[REDACTED]")
  })

  test("redacts nested objects", () => {
    const input = {
      user: { name: "John", password: "secret" },
      config: { api_key: "key123" },
    }
    const result = redact(input)
    expect(result.user.name).toBe("John")
    expect(result.user.password).toBe("[REDACTED]")
    expect(result.config.api_key).toBe("[REDACTED]")
  })

  test("redacts arrays", () => {
    const input = {
      items: [
        { name: "item1", token: "tok1" },
        { name: "item2", token: "tok2" },
      ],
    }
    const result = redact(input)
    const first = result.items[0]
    const second = result.items[1]
    expect(first?.name).toBe("item1")
    expect(first?.token).toBe("[REDACTED]")
    expect(second?.token).toBe("[REDACTED]")
  })

  test("detects OpenAI-style keys by pattern", () => {
    const input = { someField: "sk-abcdefghijklmnopqrstuvwxyz1234" }
    const result = redact(input)
    expect(result.someField).toBe("[REDACTED]")
  })

  test("detects GitHub PATs by pattern", () => {
    const input = { someField: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" }
    const result = redact(input)
    expect(result.someField).toBe("[REDACTED]")
  })

  test("handles null and undefined", () => {
    expect(redact(null)).toBeNull()
    expect(redact(undefined)).toBeUndefined()
  })

  test("handles primitives", () => {
    expect(redact("hello")).toBe("hello")
    expect(redact(42)).toBe(42)
    expect(redact(true)).toBe(true)
  })

  test("redacts apiKey (camelCase)", () => {
    const input = { apiKey: "sk-proj-secret-key-12345" }
    const result = redact(input)
    expect(result.apiKey).toBe("[REDACTED]")
  })

  test("redacts encryptedApiKey", () => {
    const input = { encryptedApiKey: "base64-encrypted-blob-here" }
    const result = redact(input)
    expect(result.encryptedApiKey).toBe("[REDACTED]")
  })

  test("redacts user_api_key (snake_case)", () => {
    const input = { user_api_key: "sk-user-key-abcdef" }
    const result = redact(input)
    expect(result.user_api_key).toBe("[REDACTED]")
  })

  test("redacts nested object with BYOK-sensitive fields", () => {
    const input = {
      provider: "openai",
      config: {
        apiKey: "sk-proj-nested-key",
        encryptedApiKey: "aes-gcm-base64-blob==",
      },
      headers: {
        authorization: "Bearer token123",
      },
    }
    const result = redact(input)
    expect(result.provider).toBe("openai")
    expect(result.config.apiKey).toBe("[REDACTED]")
    expect(result.config.encryptedApiKey).toBe("[REDACTED]")
    expect(result.headers.authorization).toBe("[REDACTED]")
  })

  test("handles case-insensitive key matching", () => {
    const input = { Password: "secret", API_KEY: "key123", AuthToken: "tok" }
    const result = redact(input)
    expect(result.Password).toBe("[REDACTED]")
    expect(result.API_KEY).toBe("[REDACTED]")
    expect(result.AuthToken).toBe("[REDACTED]")
  })
})

describe("redactUrl", () => {
  test("redacts query parameters with sensitive names", () => {
    const url = "https://api.example.com/data?api_key=secret123&name=test"
    const result = redactUrl(url)
    expect(result).toContain("api_key=%5BREDACTED%5D")
    expect(result).toContain("name=test")
  })

  test("redacts userinfo in URL", () => {
    const url = "postgres://admin:password123@localhost:5432/db"
    const result = redactUrl(url)
    expect(result).not.toContain("admin")
    expect(result).not.toContain("password123")
    expect(result).toContain("%5BREDACTED%5D")
  })

  test("handles invalid URLs", () => {
    const result = redactUrl("not-a-url")
    expect(result).toBe("[REDACTED]")
  })
})

describe("redactAuthHeader", () => {
  test("redacts authorization header value", () => {
    expect(redactAuthHeader("Bearer token123")).toBe("[REDACTED]")
    expect(redactAuthHeader("Basic abc123")).toBe("[REDACTED]")
  })

  test("handles undefined", () => {
    expect(redactAuthHeader(undefined)).toBe("")
  })
})
