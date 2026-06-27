import { randomUUID } from "node:crypto"
import { GENERATED_FILE_MAX_BYTES, PPTX_MIME_TYPE, pptxJsonDataSchema } from "@yummy/shared"
import type { PptxJsonData } from "@yummy/shared"
import { defineYummyMaster } from "./pptx/masters"
import { renderClosingSlide, renderContentSlide, renderTitleSlide } from "./pptx/renderers"

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

const PPTX_JSON_PATTERN = /```pptx-json\s*\n([\s\S]*?)\n```/

export function extractPptxJson(text: string): PptxJsonData | null {
  const match = text.match(PPTX_JSON_PATTERN)
  if (!match?.[1]) return null

  try {
    const parsed = JSON.parse(match[1])
    const result = pptxJsonDataSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// PPTX generation
// ---------------------------------------------------------------------------

export async function generatePptxBuffer(data: PptxJsonData): Promise<{
  filename: string
  mimeType: string
  byteSize: number
  buffer: Buffer
}> {
  // Dynamic import for ESM compatibility
  const PptxGenJS = (await import("pptxgenjs")).default

  const pptx = new PptxGenJS()
  pptx.layout = "LAYOUT_WIDE"
  pptx.author = "Yummy Chat"
  pptx.company = "Yummy Chat"

  defineYummyMaster(pptx)

  renderTitleSlide(pptx, data.title)

  // Content slides — each classified into SPLIT_LAYOUT | GRID_CARDS | STANDARD_CONTENT
  for (const slide of data.slides) {
    renderContentSlide(pptx, slide)
  }

  renderClosingSlide(pptx, data.closing || "Thank you")

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer

  // Size check
  if (buffer.length > GENERATED_FILE_MAX_BYTES) {
    throw new Error("PPTX_FILE_TOO_LARGE")
  }

  const fileId = randomUUID()
  const filename = `slides-${fileId.slice(0, 8)}.pptx`

  return {
    filename,
    mimeType: PPTX_MIME_TYPE,
    byteSize: buffer.length,
    buffer,
  }
}
