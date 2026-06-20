import { describe, expect, test } from "vitest"
import { decrypt, encrypt } from "./encryption"

const TEST_SECRET = "test-encryption-secret-for-unit-tests-32bytes!"

describe("encrypt", () => {
  test("round-trip: encrypt then decrypt returns original plaintext", () => {
    const plaintext = "sk-proj-abc123def456ghi789jkl012mno345pqr"
    const encrypted = encrypt(plaintext, TEST_SECRET)
    const decrypted = decrypt(encrypted, TEST_SECRET)
    expect(decrypted).toBe(plaintext)
  })

  test("round-trip with realistic OpenAI API key format", () => {
    const plaintext = "sk-proj-1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z"
    const encrypted = encrypt(plaintext, TEST_SECRET)
    const decrypted = decrypt(encrypted, TEST_SECRET)
    expect(decrypted).toBe(plaintext)
  })

  test("round-trip with empty string", () => {
    const plaintext = ""
    const encrypted = encrypt(plaintext, TEST_SECRET)
    const decrypted = decrypt(encrypted, TEST_SECRET)
    expect(decrypted).toBe(plaintext)
  })

  test("round-trip with special characters", () => {
    const plaintext = "key!@#$%^&*()_+-=[]{}|;':\",./<>?`~"
    const encrypted = encrypt(plaintext, TEST_SECRET)
    const decrypted = decrypt(encrypted, TEST_SECRET)
    expect(decrypted).toBe(plaintext)
  })

  test("round-trip with unicode characters", () => {
    const plaintext = "🔑 api-key- héllo-wörld-日本語-키"
    const encrypted = encrypt(plaintext, TEST_SECRET)
    const decrypted = decrypt(encrypted, TEST_SECRET)
    expect(decrypted).toBe(plaintext)
  })

  test("produces base64 output", () => {
    const encrypted = encrypt("hello", TEST_SECRET)
    // Base64 regex: alphanumeric, +, /, = padding
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  test("IV uniqueness: same plaintext produces different ciphertexts", () => {
    const plaintext = "my-secret-api-key"
    const encrypted1 = encrypt(plaintext, TEST_SECRET)
    const encrypted2 = encrypt(plaintext, TEST_SECRET)
    const encrypted3 = encrypt(plaintext, TEST_SECRET)
    expect(encrypted1).not.toBe(encrypted2)
    expect(encrypted1).not.toBe(encrypted3)
    expect(encrypted2).not.toBe(encrypted3)
  })

  test("different keys produce different ciphertexts", () => {
    const plaintext = "my-secret-api-key"
    const encrypted1 = encrypt(plaintext, TEST_SECRET)
    const encrypted2 = encrypt(plaintext, "completely-different-secret-key-here")
    expect(encrypted1).not.toBe(encrypted2)
  })
})

describe("decrypt", () => {
  test("tamper detection: modified ciphertext throws", () => {
    const plaintext = "sk-proj-sensitive-data-here"
    const encrypted = encrypt(plaintext, TEST_SECRET)

    // Flip a byte in the middle of the ciphertext (base64 decode, modify, re-encode)
    const data = Buffer.from(encrypted, "base64")
    data[Math.floor(data.length / 2)] ^= 0xff // flip bits

    expect(() => decrypt(data.toString("base64"), TEST_SECRET)).toThrow()
  })

  test("tamper detection: truncated ciphertext throws", () => {
    const encrypted = encrypt("some-data", TEST_SECRET)
    const truncated = encrypted.slice(0, encrypted.length - 4)
    expect(() => decrypt(truncated, TEST_SECRET)).toThrow()
  })

  test("wrong key throws", () => {
    const encrypted = encrypt("sensitive-value", TEST_SECRET)
    expect(() => decrypt(encrypted, "wrong-decryption-key")).toThrow()
  })

  test("completely invalid base64 input throws", () => {
    expect(() => decrypt("not-valid-base64!!!", TEST_SECRET)).toThrow()
  })

  test("empty string input throws", () => {
    expect(() => decrypt("", TEST_SECRET)).toThrow()
  })

  test("short input (less than min length) throws", () => {
    // Minimum: IV(16) + at least 1 byte ciphertext + authTag(16) = 33 bytes
    const tooShort = Buffer.alloc(20).toString("base64")
    expect(() => decrypt(tooShort, TEST_SECRET)).toThrow()
  })
})

describe("key derivation", () => {
  test("short secret (less than 32 bytes) works", () => {
    const shortSecret = "short"
    const plaintext = "test-data"
    const encrypted = encrypt(plaintext, shortSecret)
    const decrypted = decrypt(encrypted, shortSecret)
    expect(decrypted).toBe(plaintext)
  })

  test("long secret (more than 100 bytes) works", () => {
    const longSecret = "x".repeat(200)
    const plaintext = "test-data"
    const encrypted = encrypt(plaintext, longSecret)
    const decrypted = decrypt(encrypted, longSecret)
    expect(decrypted).toBe(plaintext)
  })

  test("secret with high-entropy (hex) works", () => {
    const hexSecret = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0"
    const plaintext = "test-data"
    const encrypted = encrypt(plaintext, hexSecret)
    const decrypted = decrypt(encrypted, hexSecret)
    expect(decrypted).toBe(plaintext)
  })
})
