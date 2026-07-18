import { beforeEach, describe, expect, it, vi } from "vitest"

const create = vi.fn()

vi.mock("openai", () => ({
  OpenAI: class {
    chat = { completions: { create } }
  },
}))

const { OpenAIProvider } = await import("./openai-provider")

function streamOf(chunks: readonly unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

describe("OpenAIProvider MCP tool loop", () => {
  beforeEach(() => create.mockReset())

  it("executes a streamed tool call and continues to the final answer", async () => {
    create
      .mockResolvedValueOnce(
        streamOf([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call-1",
                      function: { name: "mcp_123_weather", arguments: '{"city":"Hanoi"}' },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(
        streamOf([
          { choices: [{ delta: { content: "Sunny" }, finish_reason: null }] },
          {
            choices: [{ delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 12, completion_tokens: 2 },
          },
        ]),
      )

    const executeTool = vi.fn().mockResolvedValue({ content: "28 C" })
    const provider = new OpenAIProvider("test-key", "test-model")
    const chunks = []
    for await (const chunk of provider.stream({
      model: "test-model",
      messages: [{ role: "user", content: "Weather?" }],
      tools: [
        {
          name: "mcp_123_weather",
          description: "Weather",
          inputSchema: { type: "object" },
        },
      ],
      executeTool,
    })) {
      chunks.push(chunk)
    }

    expect(executeTool).toHaveBeenCalledWith("mcp_123_weather", { city: "Hanoi" })
    expect(chunks).toContainEqual({ type: "text-delta", textDelta: "Sunny" })
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" })
    expect(create).toHaveBeenCalledTimes(2)
    const secondRequest = create.mock.calls[1]?.[0]
    expect(secondRequest.messages.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "call-1",
      content: "28 C",
    })
  })
})
