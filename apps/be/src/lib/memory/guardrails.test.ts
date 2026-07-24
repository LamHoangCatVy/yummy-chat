import { describe, expect, it } from "vitest"
import { evaluateMemorySafety, normalizeMemoryKey } from "./guardrails"

describe("memory guardrails", () => {
  it("blocks credentials and financial identifiers", () => {
    expect(
      evaluateMemorySafety({ key: "api key", value: "sk-secret", category: "preference" }, true),
    ).toBe("blocked")
    expect(
      evaluateMemorySafety(
        { key: "payment", value: "My credit card number is 4111", category: "profile" },
        true,
      ),
    ).toBe("blocked")
  })

  it("requires explicit confirmation for sensitive categories", () => {
    const candidate = { key: "diet", value: "medical diet", category: "health" }
    expect(evaluateMemorySafety(candidate, true)).toBe("confirmation_required")
    expect(evaluateMemorySafety(candidate, false)).toBe("blocked")
  })

  it("allows ordinary stable preferences", () => {
    expect(
      evaluateMemorySafety(
        { key: "response language", value: "Vietnamese", category: "preference" },
        false,
      ),
    ).toBe("allow")
  })

  it("normalizes Vietnamese keys deterministically", () => {
    expect(normalizeMemoryKey("  Ngôn ngữ trả lời  ")).toBe("ngon_ngu_tra_loi")
  })
})
