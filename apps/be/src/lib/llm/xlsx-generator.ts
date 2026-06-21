import { randomUUID } from "node:crypto"

export interface XlsxSheetData {
  readonly name: string
  readonly headers: readonly string[]
  readonly rows: readonly (readonly (string | number | null)[])[]
}

export interface XlsxJsonData {
  readonly sheets: readonly XlsxSheetData[]
}

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const XLSX_JSON_PATTERN = /```xlsx-json\s*\n([\s\S]*?)\n```/

export function extractXlsxJson(text: string): XlsxJsonData | null {
  const match = text.match(XLSX_JSON_PATTERN)
  if (!match?.[1]) return null

  try {
    const parsed = JSON.parse(match[1]) as XlsxJsonData
    if (!parsed.sheets || !Array.isArray(parsed.sheets)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Generate an XLSX workbook and return the buffer + metadata.
 * Does NOT write to disk — use this for DB persistence.
 */
export async function generateXlsxBuffer(data: XlsxJsonData): Promise<{
  filename: string
  mimeType: string
  byteSize: number
  buffer: Buffer
}> {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()

  for (const sheetData of data.sheets) {
    const sheet = workbook.addWorksheet(sheetData.name || "Sheet1")
    sheet.addRow(sheetData.headers)
    for (const row of sheetData.rows) {
      sheet.addRow(row)
    }
  }

  const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer
  const fileId = randomUUID()

  return {
    filename: `output-${fileId.slice(0, 8)}.xlsx`,
    mimeType: XLSX_MIME_TYPE,
    byteSize: buffer.length,
    buffer,
  }
}

/**
 * @deprecated Use `generateXlsxBuffer()` for DB-backed persistence.
 * Legacy helper that writes to a temp file.
 */
export async function generateXlsxFile(data: XlsxJsonData): Promise<{
  filename: string
  downloadUrl: string
  mimeType: string
}> {
  const result = await generateXlsxBuffer(data)
  // Legacy callers expect a downloadUrl — file is still returned as buffer
  // but the caller must persist it separately (this is kept for backward compat).
  return {
    filename: result.filename,
    downloadUrl: "",
    mimeType: result.mimeType,
  }
}
