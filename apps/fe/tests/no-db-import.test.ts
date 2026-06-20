import { readFile, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(__dirname, "..", "src")

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true })
  const files: string[] = []
  for (const entry of entries) {
    if (
      entry.endsWith(".ts") ||
      entry.endsWith(".tsx") ||
      entry.endsWith(".mts") ||
      entry.endsWith(".cts")
    ) {
      files.push(join(dir, entry))
    }
  }
  return files
}

describe("boundary: FE must not import @yummy/db", () => {
  test("no source file imports @yummy/db", async () => {
    const files = await collectTsFiles(SRC_DIR)
    const violations: string[] = []

    for (const file of files) {
      const content = await readFile(file, "utf-8")
      if (content.includes("@yummy/db")) {
        violations.push(file)
      }
    }

    expect(violations).toEqual([])
  })
})
