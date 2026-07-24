import { describe, expect, test } from "vitest"
import {
  mapMessageListItemToChatMessage,
  stripGeneratedJsonBlocks,
} from "../src/components/chat/chat-transcript-helpers"
import { messageListItemSchema } from "../src/lib/api"

const baseMessage = {
  id: "msg-1",
  role: "assistant" as const,
  content: "Generated file attached.",
  createdAt: "2026-06-21T00:00:00.000Z",
}

describe("chat history file metadata", () => {
  test("MessageListItem schema parses metadata.files", () => {
    const parsed = messageListItemSchema.parse({
      ...baseMessage,
      metadata: {
        files: [
          {
            filename: "deck.pptx",
            downloadUrl: "/api/v1/files/file-1/download",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          },
        ],
      },
    })

    expect(parsed.metadata).toEqual({
      files: [
        {
          filename: "deck.pptx",
          downloadUrl: "/api/v1/files/file-1/download",
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
      ],
    })
  })

  test("MessageListItem schema parses messages without metadata", () => {
    const parsed = messageListItemSchema.parse(baseMessage)

    expect(parsed.metadata).toBeUndefined()
  })

  test("MessageListItem schema parses null metadata", () => {
    const parsed = messageListItemSchema.parse({ ...baseMessage, metadata: null })

    expect(parsed.metadata).toBeNull()
  })

  test("stripGeneratedJsonBlocks removes xlsx-json and pptx-json fenced blocks", () => {
    const content = [
      "Intro",
      "```xlsx-json",
      '{"rows":[]}',
      "```",
      "Middle",
      "```pptx-json",
      '{"slides":[]}',
      "```",
      "Outro",
    ].join("\n")

    expect(stripGeneratedJsonBlocks(content)).toBe("Intro\n\nMiddle\n\nOutro")
  })

  test("stripGeneratedJsonBlocks preserves text outside generated fences", () => {
    const content = 'Before\n```json\n{"visible":true}\n```\nAfter'

    expect(stripGeneratedJsonBlocks(content)).toBe(content)
  })

  test("mapMessageListItemToChatMessage reconstructs files from valid metadata", () => {
    const chatMessage = mapMessageListItemToChatMessage({
      ...baseMessage,
      metadata: {
        files: [
          {
            filename: "report.xlsx",
            downloadUrl: "/api/v1/files/file-2/download",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ],
      },
    })

    expect(chatMessage.files).toEqual([
      {
        filename: "report.xlsx",
        downloadUrl: "/api/v1/files/file-2/download",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ])
  })

  test("mapMessageListItemToChatMessage ignores invalid file metadata without throwing", () => {
    expect(() =>
      mapMessageListItemToChatMessage({
        ...baseMessage,
        metadata: {
          files: [
            null,
            { filename: "missing-url.pptx", mimeType: "application/vnd.ms-powerpoint" },
            {
              filename: "valid.pptx",
              downloadUrl: "/api/v1/files/file-3/download",
              mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            },
          ],
        },
      }),
    ).not.toThrow()

    const chatMessage = mapMessageListItemToChatMessage({
      ...baseMessage,
      metadata: {
        files: [null, { filename: "missing-url.pptx", mimeType: "application/vnd.ms-powerpoint" }],
      },
    })

    expect(chatMessage.files).toBeUndefined()
  })

  test("mapMessageListItemToChatMessage restores persisted MCP tool results", () => {
    const chatMessage = mapMessageListItemToChatMessage({
      ...baseMessage,
      metadata: {
        toolCalls: [
          {
            id: "call-1",
            name: "mcp_123_weather_0",
            arguments: { city: "Hanoi" },
            status: "success",
            result: "28 C",
          },
        ],
      },
    })

    expect(chatMessage.toolCalls).toEqual([
      {
        id: "call-1",
        name: "mcp_123_weather_0",
        arguments: { city: "Hanoi" },
        status: "success",
        result: "28 C",
      },
    ])
  })

  test("mapMessageListItemToChatMessage restores the persisted response timeline", () => {
    const chatMessage = mapMessageListItemToChatMessage({
      ...baseMessage,
      metadata: {
        responseParts: [
          { type: "text", content: "Let me resolve the library." },
          { type: "tool-call", toolCallId: "call-1" },
          { type: "text", content: "Now I will query the docs." },
        ],
      },
    })

    expect(chatMessage.responseParts).toEqual([
      { type: "text", content: "Let me resolve the library." },
      { type: "tool-call", toolCallId: "call-1" },
      { type: "text", content: "Now I will query the docs." },
    ])
  })

  test("mapMessageListItemToChatMessage ignores malformed MCP metadata", () => {
    const chatMessage = mapMessageListItemToChatMessage({
      ...baseMessage,
      metadata: {
        toolCalls: [
          null,
          { id: "missing-fields" },
          {
            id: "invalid-status",
            name: "search",
            arguments: {},
            status: "unknown",
          },
        ],
      },
    })

    expect(chatMessage.toolCalls).toBeUndefined()
  })

  test("mapMessageListItemToChatMessage ignores malformed response parts", () => {
    const chatMessage = mapMessageListItemToChatMessage({
      ...baseMessage,
      metadata: {
        responseParts: [
          null,
          { type: "text", content: 123 },
          { type: "tool-call" },
          { type: "unknown", content: "ignored" },
        ],
      },
    })

    expect(chatMessage.responseParts).toBeUndefined()
  })

})
