import { GENERATED_FILE_MAX_BYTES, PPTX_MIME_TYPE } from "@yummy/shared"
import type { PptxJsonData } from "@yummy/shared"
import { afterEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock pptxgenjs so we can control buffer size for oversized-detection test.
// The mock delegates to vi.fn() instances that each test can configure.
// ---------------------------------------------------------------------------

const mockPptxAddText = vi.fn()
const mockPptxAddShape = vi.fn()
const mockPptxDefineSlideMaster = vi.fn()
const mockPptxAddSlide = vi.fn(() => ({ addText: mockPptxAddText, addShape: mockPptxAddShape }))
const mockPptxWrite = vi.fn<() => Promise<Buffer>>()
const mockShapeType = { rect: "rect", line: "line", roundRect: "roundRect" }

vi.mock("pptxgenjs", () => ({
  default: vi.fn().mockImplementation(() => ({
    layout: "",
    ShapeType: mockShapeType,
    defineSlideMaster: mockPptxDefineSlideMaster,
    addSlide: mockPptxAddSlide,
    write: mockPptxWrite,
  })),
}))

import { extractPptxJson, generatePptxBuffer } from "./pptx-generator"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid deck — one slide with one bullet. */
const validDeck: PptxJsonData = {
  title: "My Presentation",
  slides: [{ title: "Slide 1", bullets: ["Point A"] }],
}

/** Build a valid pptx-json fenced block. */
function fence(obj: unknown): string {
  return `\`\`\`pptx-json\n${JSON.stringify(obj)}\n\`\`\``
}

/** Return a small ZIP-like buffer (starts with "PK") used by default. */
function smallZipBuffer(): Buffer {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04]) // PK..
}

// ---------------------------------------------------------------------------
// extractPptxJson
// ---------------------------------------------------------------------------

describe("extractPptxJson", () => {
  it("parses a valid pptx-json fenced block", () => {
    const text = `Some preamble\n${fence(validDeck)}\nSome suffix`
    const result = extractPptxJson(text)
    expect(result).toEqual(validDeck)
  })

  it("returns null when no pptx-json block is present", () => {
    expect(extractPptxJson("Just plain text")).toBeNull()
    expect(extractPptxJson("```json\n{}\n```")).toBeNull()
  })

  it("returns null for malformed JSON (no throw)", () => {
    expect(extractPptxJson("```pptx-json\n{broken}\n```")).toBeNull()
    expect(extractPptxJson("```pptx-json\nnot-even-json\n```")).toBeNull()
  })

  it("returns null when JSON is valid but fails schema (9 slides)", () => {
    const nineSlides = {
      title: "Too many",
      slides: Array.from({ length: 9 }, (_, i) => ({
        title: `Slide ${i + 1}`,
        bullets: ["bullet"],
      })),
    }
    expect(extractPptxJson(fence(nineSlides))).toBeNull()
  })

  it("returns null when slide has 9 bullets, 181-char bullet, or unknown property", () => {
    // 9 bullets (max is 8)
    expect(
      extractPptxJson(
        fence({
          title: "Deck",
          slides: [
            {
              title: "S1",
              bullets: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
            },
          ],
        }),
      ),
    ).toBeNull()

    // 181-char bullet (max is 180)
    expect(
      extractPptxJson(
        fence({
          title: "Deck",
          slides: [{ title: "S1", bullets: ["a".repeat(181)] }],
        }),
      ),
    ).toBeNull()

    // Unknown property (strict schema)
    expect(
      extractPptxJson(
        fence({
          title: "Deck",
          slides: [{ title: "S1", bullets: ["ok"], unknown: 1 }],
        }),
      ),
    ).toBeNull()
  })

  it("rejects a deck with title exceeding 120 characters", () => {
    expect(
      extractPptxJson(
        fence({
          title: "A".repeat(121),
          slides: [{ title: "S1", bullets: ["ok"] }],
        }),
      ),
    ).toBeNull()
  })

  it("rejects empty title or empty slides array", () => {
    expect(
      extractPptxJson(fence({ title: "", slides: [{ title: "S1", bullets: ["ok"] }] })),
    ).toBeNull()

    expect(extractPptxJson(fence({ title: "Deck", slides: [] }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// generatePptxBuffer
// ---------------------------------------------------------------------------

describe("generatePptxBuffer", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("produces a buffer that starts with ZIP magic bytes (PK)", async () => {
    mockPptxWrite.mockResolvedValue(smallZipBuffer())

    const result = await generatePptxBuffer(validDeck)

    expect(result.buffer[0]).toBe(0x50) // P
    expect(result.buffer[1]).toBe(0x4b) // K
  })

  it("returns correct filename, mimeType, and byteSize", async () => {
    const fakeBuf = Buffer.from([0x50, 0x4b, 0x00, 0x00, 0x00, 0x00])
    mockPptxWrite.mockResolvedValue(fakeBuf)

    const result = await generatePptxBuffer(validDeck)

    expect(result.filename).toMatch(/^slides-[0-9a-f]{8}\.pptx$/)
    expect(result.mimeType).toBe(PPTX_MIME_TYPE)
    expect(result.byteSize).toBe(fakeBuf.length)
    expect(result.buffer).toBeInstanceOf(Buffer)
  })

  it("calls pptxgenjs with correct slide structure", async () => {
    mockPptxAddSlide.mockClear()
    mockPptxAddText.mockClear()
    mockPptxAddShape.mockClear()
    mockPptxDefineSlideMaster.mockClear()
    mockPptxWrite.mockResolvedValue(smallZipBuffer())

    const deck: PptxJsonData = {
      title: "Q4 Review",
      slides: [
        { title: "Metrics", bullets: ["Revenue up", "Costs down"] },
        { title: "Next Steps", bullets: ["Launch v2", "Hire"] },
      ],
      closing: "Questions?",
    }

    await generatePptxBuffer(deck)

    // Title slide + 2 content slides + closing slide = 4 slides
    expect(mockPptxAddSlide).toHaveBeenCalledTimes(4)

    // One global slide master defined
    expect(mockPptxDefineSlideMaster).toHaveBeenCalledTimes(1)

    // addText: title(1) + 2 content(2 each: title+bullets) + closing(1) = 6
    expect(mockPptxAddText).toHaveBeenCalledTimes(6)

    // addShape: title(2: accent bar + accent line)
    //         + 2 STANDARD_CONTENT(3 each: title accent + card bg + card accent bar)
    //         + closing(1: accent line) = 9
    expect(mockPptxAddShape).toHaveBeenCalledTimes(9)
  })

  it("throws when the generated buffer exceeds GENERATED_FILE_MAX_BYTES", async () => {
    mockPptxWrite.mockResolvedValue(Buffer.alloc(GENERATED_FILE_MAX_BYTES + 1))

    await expect(generatePptxBuffer(validDeck)).rejects.toThrow("PPTX_FILE_TOO_LARGE")
  })
})
