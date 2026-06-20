/**
 * Environment variable validation script.
 *
 * Reads .env.example to discover expected variables,
 * then checks process.env for each required key.
 * Exits 0 if all required vars are set, 1 otherwise.
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

interface EnvCheckResult {
  key: string
  exists: boolean
  optional: boolean
}

function main(): void {
  const envExamplePath = join(__dirname, "..", ".env.example")

  if (!existsSync(envExamplePath)) {
    console.error("❌ .env.example not found at", envExamplePath)
    process.exit(1)
  }

  const exampleContent = readFileSync(envExamplePath, "utf-8")
  const results: EnvCheckResult[] = []
  let hasErrors = false

  console.log("🔍 Checking environment variables against .env.example\n")

  for (const line of exampleContent.split("\n")) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue

    // Skip lines without assignment
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()

    // A variable is optional if its example value is empty or contains "optional"
    const value = trimmed.slice(eqIndex + 1).trim()
    const isOptional =
      value === "" || value === '""' || value === "''" || value.includes("optional")

    const envValue = process.env[key]
    const exists = envValue !== undefined && envValue.length > 0

    if (!exists && !isOptional) {
      console.error(`  ❌ MISSING: ${key}`)
      hasErrors = true
    } else if (!exists && isOptional) {
      console.warn(`  ⚠️  OPTIONAL: ${key} (not set, will use default)`)
    } else {
      console.log(`  ✅ ${key}`)
    }

    results.push({ key, exists, optional: isOptional })
  }

  if (hasErrors) {
    console.error("\n❌ Environment validation failed. Set missing variables in .env")
    process.exit(1)
  }

  console.log("\n✅ All required environment variables are set")
}

main()
