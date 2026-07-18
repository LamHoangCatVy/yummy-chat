import { describe, expect, test } from "vitest"
import {
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
})
