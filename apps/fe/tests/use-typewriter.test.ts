import { describe, expect, test } from "vitest"
import { advanceTypewriterLength } from "../src/components/chat/use-typewriter"

describe("typewriter pacing", () => {
  test("advances incrementally without overshooting the latest streamed target", () => {
    expect(advanceTypewriterLength(0, 100)).toBe(5)
    expect(advanceTypewriterLength(98, 100)).toBe(99)
    expect(advanceTypewriterLength(99, 100)).toBe(100)
    expect(advanceTypewriterLength(100, 100)).toBe(100)
  })

  test("caps a large provider chunk so it is revealed over multiple frames", () => {
    expect(advanceTypewriterLength(0, 10_000)).toBe(24)
  })
})
