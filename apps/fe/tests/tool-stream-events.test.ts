import { describe, expect, test } from "vitest"
import {
  appendResponseText,
  appendResponseToolCall,
  applyToolStreamEvent,
  parseToolStreamEvent,
} from "../src/components/chat/tool-stream-events"

describe("MCP tool stream events", () => {
  test("parses tool-call payloads", () => {
    expect(
      parseToolStreamEvent({
        toolCallId: "call-1",
        toolName: "mcp_123_weather_0",
        arguments: { city: "Hanoi" },
      }),
    ).toEqual({
      type: "tool-call",
      payload: {
        toolCallId: "call-1",
        toolName: "mcp_123_weather_0",
        arguments: { city: "Hanoi" },
      },
    })
  })

  test("parses tool-result payloads", () => {
    expect(
      parseToolStreamEvent({
        toolCallId: "call-1",
        toolName: "mcp_123_weather_0",
        content: "28 C",
        isError: false,
      }),
    ).toEqual({
      type: "tool-result",
      payload: {
        toolCallId: "call-1",
        toolName: "mcp_123_weather_0",
        content: "28 C",
        isError: false,
      },
    })
  })

  test("rejects malformed tool events", () => {
    expect(parseToolStreamEvent({ toolCallId: "call-1", arguments: [] })).toBeNull()
    expect(parseToolStreamEvent({ toolName: "weather", isError: "false" })).toBeNull()
  })

  test("updates a running tool call when its result arrives", () => {
    const call = parseToolStreamEvent({
      toolCallId: "call-1",
      toolName: "mcp_123_weather_0",
      arguments: { city: "Hanoi" },
    })
    const result = parseToolStreamEvent({
      toolCallId: "call-1",
      toolName: "mcp_123_weather_0",
      content: "28 C",
      isError: false,
    })

    if (!call || !result) throw new Error("Expected valid tool events")

    const running = applyToolStreamEvent([], call)
    expect(running).toEqual([
      {
        id: "call-1",
        name: "mcp_123_weather_0",
        arguments: { city: "Hanoi" },
        status: "running",
      },
    ])

    expect(applyToolStreamEvent(running, result)).toEqual([
      {
        id: "call-1",
        name: "mcp_123_weather_0",
        arguments: { city: "Hanoi" },
        status: "success",
        result: "28 C",
      },
    ])
  })

  test("records a failed result even when its call event was not observed", () => {
    const result = parseToolStreamEvent({
      toolCallId: "call-2",
      toolName: "mcp_123_search_1",
      content: "Timed out",
      isError: true,
    })

    if (!result) throw new Error("Expected a valid tool result")

    expect(applyToolStreamEvent([], result)).toEqual([
      {
        id: "call-2",
        name: "mcp_123_search_1",
        arguments: {},
        status: "error",
        result: "Timed out",
      },
    ])
  })

  test("preserves interleaved text and tool calls in execution order", () => {
    let parts = appendResponseText([], "Let me find the library ID.")
    parts = appendResponseToolCall(parts, "call-resolve")
    parts = appendResponseText(parts, "Now let me query the documentation.")
    parts = appendResponseToolCall(parts, "call-query")
    parts = appendResponseText(parts, "Here is what I found.")

    expect(parts).toEqual([
      { type: "text", content: "Let me find the library ID." },
      { type: "tool-call", toolCallId: "call-resolve" },
      { type: "text", content: "Now let me query the documentation." },
      { type: "tool-call", toolCallId: "call-query" },
      { type: "text", content: "Here is what I found." },
    ])
  })

  test("coalesces adjacent text deltas and de-duplicates tool lifecycle events", () => {
    let parts = appendResponseText([], "Hello")
    parts = appendResponseText(parts, " world")
    parts = appendResponseToolCall(parts, "call-1")
    parts = appendResponseToolCall(parts, "call-1")

    expect(parts).toEqual([
      { type: "text", content: "Hello world" },
      { type: "tool-call", toolCallId: "call-1" },
    ])
  })
})
