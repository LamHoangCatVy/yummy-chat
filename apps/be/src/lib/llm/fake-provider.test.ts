import { describe, expect, it } from "vitest"
import { FakeLLMProvider } from "./fake-provider"
import type { StreamChunk } from "./provider"

async function collectChunks(iterable: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}

describe("FakeLLMProvider", () => {
  it("emits all default chunks followed by finish", async () => {
    const provider = new FakeLLMProvider({ chunkDelayMs: 1 })
    const chunks = await collectChunks(
      provider.stream({
        messages: [{ role: "user", content: "hello" }],
        model: "fake",
      }),
    )

    const textChunks = chunks.filter((c) => c.type === "text-delta")
    const finishChunks = chunks.filter((c) => c.type === "finish")

    expect(textChunks.length).toBe(7) // DEFAULT_CHUNKS has 7 items
    expect(finishChunks.length).toBe(1)
    expect(finishChunks[0]).toMatchObject({
      type: "finish",
      finishReason: "stop",
    })
  })

  it("emits custom chunks", async () => {
    const provider = new FakeLLMProvider({
      chunks: ["A", "B", "C"],
      chunkDelayMs: 1,
    })
    const chunks = await collectChunks(
      provider.stream({
        messages: [{ role: "user", content: "test" }],
        model: "fake",
      }),
    )

    const textChunks = chunks.filter((c) => c.type === "text-delta")
    expect(textChunks.length).toBe(3)
    expect(textChunks.map((c) => (c.type === "text-delta" ? c.textDelta : ""))).toEqual([
      "A",
      "B",
      "C",
    ])
  })

  it("delivers chunks incrementally (not buffered)", async () => {
    const provider = new FakeLLMProvider({
      chunks: ["one", "two", "three", "four"],
      chunkDelayMs: 30,
    })

    const timestamps: number[] = []
    const start = Date.now()

    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: "test" }],
      model: "fake",
    })) {
      if (chunk.type === "text-delta") {
        timestamps.push(Date.now() - start)
      }
    }

    // Should have at least 3 text chunks
    expect(timestamps.length).toBeGreaterThanOrEqual(3)

    // Each chunk should arrive at least 20ms after the previous
    // (allowing some timing slack)
    for (let i = 1; i < timestamps.length; i++) {
      const prev = timestamps[i - 1]
      const curr = timestamps[i]
      if (prev !== undefined && curr !== undefined) {
        const gap = curr - prev
        expect(gap).toBeGreaterThanOrEqual(15)
      }
    }

    // Total time should be at least 3 * 30ms = 90ms
    const totalTime = timestamps[timestamps.length - 1]
    expect(totalTime).toBeGreaterThanOrEqual(60)
  })

  it("stops emitting when aborted", async () => {
    const provider = new FakeLLMProvider({
      chunks: ["a", "b", "c", "d", "e", "f", "g", "h"],
      chunkDelayMs: 50,
    })

    const controller = new AbortController()
    const chunks: StreamChunk[] = []

    // Abort after 100ms
    setTimeout(() => controller.abort(), 100)

    for await (const chunk of provider.stream(
      {
        messages: [{ role: "user", content: "test" }],
        model: "fake",
      },
      controller.signal,
    )) {
      chunks.push(chunk)
      if (chunk.type === "finish") break
    }

    // Should have received some text chunks but not all 8
    const textChunks = chunks.filter((c) => c.type === "text-delta")
    expect(textChunks.length).toBeGreaterThan(0)
    expect(textChunks.length).toBeLessThan(8)

    // Should have a finish chunk with abort reason
    const finishChunks = chunks.filter((c) => c.type === "finish")
    expect(finishChunks.length).toBe(1)
    expect(finishChunks[0]).toMatchObject({
      type: "finish",
      finishReason: "abort",
    })
  })

  it("emits error after configured number of chunks", async () => {
    const provider = new FakeLLMProvider({
      chunks: ["a", "b", "c", "d", "e"],
      chunkDelayMs: 1,
      errorAfterChunks: 2,
      errorMessage: "Test error",
    })

    const chunks = await collectChunks(
      provider.stream({
        messages: [{ role: "user", content: "test" }],
        model: "fake",
      }),
    )

    const textChunks = chunks.filter((c) => c.type === "text-delta")
    const errorChunks = chunks.filter((c) => c.type === "error")

    expect(textChunks.length).toBe(2)
    expect(errorChunks.length).toBe(1)
    expect(errorChunks[0]).toMatchObject({
      type: "error",
      error: "Test error",
      code: "PROVIDER_ERROR",
    })
  })

  it("includes usage metadata in finish chunk", async () => {
    const provider = new FakeLLMProvider({
      chunks: ["hello", " world"],
      chunkDelayMs: 1,
    })

    const chunks = await collectChunks(
      provider.stream({
        messages: [{ role: "user", content: "test" }],
        model: "fake",
      }),
    )

    const finishChunk = chunks.find((c) => c.type === "finish")
    expect(finishChunk).toBeDefined()
    expect(finishChunk?.type).toBe("finish")
    if (finishChunk && finishChunk.type === "finish") {
      expect(finishChunk.usage.inputTokens).toBeGreaterThan(0)
      expect(finishChunk.usage.outputTokens).toBeGreaterThan(0)
      expect(finishChunk.usage.totalTokens).toBe(
        finishChunk.usage.inputTokens + finishChunk.usage.outputTokens,
      )
    }
  })

  it("emits reasoning chunks before text chunks", async () => {
    const provider = new FakeLLMProvider({
      reasoningChunks: ["Let me think", " about this."],
      chunks: ["The answer", " is 42."],
      chunkDelayMs: 1,
    })

    const chunks = await collectChunks(
      provider.stream({
        messages: [{ role: "user", content: "test" }],
        model: "fake",
      }),
    )

    const reasoningChunks = chunks.filter((c) => c.type === "reasoning-delta")
    const textChunks = chunks.filter((c) => c.type === "text-delta")

    expect(reasoningChunks.length).toBe(2)
    expect(textChunks.length).toBe(2)

    const reasoningText = reasoningChunks
      .map((c) => (c.type === "reasoning-delta" ? c.reasoningDelta : ""))
      .join("")
    expect(reasoningText).toBe("Let me think about this.")

    const text = textChunks.map((c) => (c.type === "text-delta" ? c.textDelta : "")).join("")
    expect(text).toBe("The answer is 42.")

    const firstReasoningIndex = chunks.findIndex((c) => c.type === "reasoning-delta")
    const firstTextIndex = chunks.findIndex((c) => c.type === "text-delta")
    expect(firstReasoningIndex).toBeLessThan(firstTextIndex)
  })
})
