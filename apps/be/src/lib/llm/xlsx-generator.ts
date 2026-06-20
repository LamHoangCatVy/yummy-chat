import { randomUUID } from "node:crypto"
import { access, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TEMP_DIR = join(tmpdir(), "yummy-chat-files")

interface XlsxSheetData {
  readonly name: string
  readonly headers: readonly string[]
  readonly rows: readonly (readonly (string | number | null)[])[]
}

interface XlsxJsonData {
  readonly sheets: readonly XlsxSheetData[]
}

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

export async function generateXlsxFile(data: XlsxJsonData): Promise<{
  filename: string
  downloadUrl: string
  mimeType: string
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

  const fileId = randomUUID()
  await mkdir(TEMP_DIR, { recursive: true })
  const filename = `${fileId}.xlsx`
  const filepath = join(TEMP_DIR, filename)
  await workbook.xlsx.writeFile(filepath)

  return {
    filename: `output-${fileId.slice(0, 8)}.xlsx`,
    downloadUrl: `/api/v1/files/${fileId}`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
}

export async function getFilePath(fileId: string): Promise<string | null> {
  const filepath = join(TEMP_DIR, `${fileId}.xlsx`)
  try {
    await access(filepath)
    return filepath
  } catch {
    return null
  }
}
