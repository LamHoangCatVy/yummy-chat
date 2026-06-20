import crypto from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Derive a 32-byte AES-256 key from any-length secret using SHA-256.
 * This normalizes secrets of any length into a fixed 32-byte key.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest()
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * Output format: base64(IV + ciphertext + authTag)
 *   - IV: 16 random bytes
 *   - Auth tag: 16 bytes (appended automatically by GCM)
 */
export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted: Buffer

  try {
    const update = cipher.update(plaintext, "utf8")
    const final = cipher.final()
    encrypted = Buffer.concat([update, final])
  } catch {
    // Ensure cipher is cleaned up on error
    throw new Error("Encryption failed")
  }

  const authTag = cipher.getAuthTag()

  // Concatenate: IV (16) + ciphertext + authTag (16)
  return Buffer.concat([iv, encrypted, authTag]).toString("base64")
}

/**
 * Decrypt a ciphertext produced by {@link encrypt}.
 *
 * Expects format: base64(IV + ciphertext + authTag)
 * Throws on tampered data, wrong keys, or malformed input.
 */
export function decrypt(ciphertext: string, secret: string): string {
  const key = deriveKey(secret)
  const data = Buffer.from(ciphertext, "base64")

  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext: too short")
  }

  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  try {
    const update = decipher.update(encrypted)
    const final = decipher.final()
    return Buffer.concat([update, final]).toString("utf8")
  } catch {
    throw new Error("Decryption failed: invalid key, corrupted data, or tampered ciphertext")
  }
}
