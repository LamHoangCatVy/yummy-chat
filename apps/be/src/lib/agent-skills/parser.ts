import path from "node:path"
import JSZip from "jszip"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

const MAX_SKILL_MARKDOWN_BYTES = 500_000
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024
const MAX_RESOURCE_BYTES = 2 * 1024 * 1024
const MAX_RESOURCES = 100
const AGENT_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".mjs",
  ".py",
  ".rst",
  ".sh",
  ".sql",
  ".svg",
  ".tex",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
])

export interface AgentSkillManifest {
  readonly name: string
  readonly description: string
  readonly license?: string
  readonly compatibility?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly allowedTools?: string
}

export interface ParsedAgentSkill {
  readonly manifest: AgentSkillManifest
  readonly instructions: string
}

export interface AgentSkillResourceInput {
  readonly path: string
  readonly content: string
  readonly encoding: "utf8" | "base64"
  readonly mimeType: string
  readonly byteSize: number
}

export interface ParsedAgentSkillBundle extends ParsedAgentSkill {
  readonly resources: readonly AgentSkillResourceInput[]
}

export interface StoredAgentSkillResource {
  readonly path: string
  readonly content: string
  readonly encoding: string
  readonly mimeType: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseManifest(frontmatter: string): AgentSkillManifest {
  let value: unknown
  try {
    value = parseYaml(frontmatter)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid YAML"
    throw new Error(`Invalid SKILL.md frontmatter: ${message}`)
  }

  if (!isRecord(value)) throw new Error("SKILL.md frontmatter must be a YAML object")

  const name = value.name
  const description = value.description
  if (typeof name !== "string" || !AGENT_SKILL_NAME.test(name) || name.length > 64) {
    throw new Error("SKILL.md name must be 1-64 lowercase letters, numbers, and single hyphens")
  }
  if (
    typeof description !== "string" ||
    description.trim().length === 0 ||
    description.length > 1024
  ) {
    throw new Error("SKILL.md description must be 1-1024 characters")
  }

  const license = typeof value.license === "string" ? value.license : undefined
  const compatibility = typeof value.compatibility === "string" ? value.compatibility : undefined
  if (compatibility && compatibility.length > 500) {
    throw new Error("SKILL.md compatibility must not exceed 500 characters")
  }
  const metadata = isRecord(value.metadata) ? value.metadata : undefined
  const allowedTools =
    typeof value["allowed-tools"] === "string" ? value["allowed-tools"] : undefined

  return {
    name,
    description: description.trim(),
    ...(license ? { license } : {}),
    ...(compatibility ? { compatibility } : {}),
    ...(metadata ? { metadata } : {}),
    ...(allowedTools ? { allowedTools } : {}),
  }
}

export function parseSkillMarkdown(markdown: string): ParsedAgentSkill {
  const normalized = markdown.replace(/^\uFEFF/, "")
  if (Buffer.byteLength(normalized, "utf8") > MAX_SKILL_MARKDOWN_BYTES) {
    throw new Error("SKILL.md exceeds the 500 KB limit")
  }

  const lines = normalized.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") {
    throw new Error("SKILL.md must start with YAML frontmatter")
  }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (closingIndex < 0) throw new Error("SKILL.md frontmatter is missing its closing delimiter")

  const manifest = parseManifest(lines.slice(1, closingIndex).join("\n"))
  const instructions = lines
    .slice(closingIndex + 1)
    .join("\n")
    .trim()
  if (!instructions) throw new Error("SKILL.md must include instruction content")

  return { manifest, instructions }
}

export function buildSkillMarkdown(manifest: AgentSkillManifest, instructions: string): string {
  const frontmatter: Record<string, unknown> = {
    name: manifest.name,
    description: manifest.description,
  }
  if (manifest.license) frontmatter.license = manifest.license
  if (manifest.compatibility) frontmatter.compatibility = manifest.compatibility
  if (manifest.metadata) frontmatter.metadata = manifest.metadata
  if (manifest.allowedTools) frontmatter["allowed-tools"] = manifest.allowedTools

  return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${instructions.trim()}\n`
}

export function normalizeAgentSkillName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
  return (normalized || "skill").slice(0, 64).replace(/-+$/g, "") || "skill"
}

export function normalizeSkillResourcePath(value: string): string {
  const slashPath = value.replaceAll("\\", "/")
  if (
    !slashPath ||
    slashPath.includes("\0") ||
    slashPath.startsWith("/") ||
    /^[a-zA-Z]:\//.test(slashPath)
  ) {
    throw new Error(`Invalid skill resource path: ${value}`)
  }

  const segments = slashPath.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid skill resource path: ${value}`)
  }

  const normalized = path.posix.normalize(slashPath)
  if (normalized === "SKILL.md") {
    throw new Error("SKILL.md cannot also be stored as a supporting resource")
  }
  return normalized
}

function mimeTypeFor(resourcePath: string): string {
  const extension = path.posix.extname(resourcePath).toLowerCase()
  const known: Record<string, string> = {
    ".css": "text/css",
    ".csv": "text/csv",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".md": "text/markdown",
    ".mjs": "text/javascript",
    ".py": "text/x-python",
    ".sh": "text/x-shellscript",
    ".svg": "image/svg+xml",
    ".toml": "application/toml",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
  }
  return (
    known[extension] ?? (TEXT_EXTENSIONS.has(extension) ? "text/plain" : "application/octet-stream")
  )
}

function decodeResource(resourcePath: string, bytes: Uint8Array): AgentSkillResourceInput {
  const extension = path.posix.extname(resourcePath).toLowerCase()
  const isText = TEXT_EXTENSIONS.has(extension) || path.posix.basename(resourcePath) === "Makefile"
  if (!isText) {
    return {
      path: resourcePath,
      content: Buffer.from(bytes).toString("base64"),
      encoding: "base64",
      mimeType: mimeTypeFor(resourcePath),
      byteSize: bytes.byteLength,
    }
  }

  let content: string
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`Skill resource is not valid UTF-8 text: ${resourcePath}`)
  }
  return {
    path: resourcePath,
    content,
    encoding: "utf8",
    mimeType: mimeTypeFor(resourcePath),
    byteSize: bytes.byteLength,
  }
}

export async function parseAgentSkillBundle(
  fileName: string,
  bytes: Uint8Array,
): Promise<ParsedAgentSkillBundle> {
  if (bytes.byteLength > MAX_BUNDLE_BYTES) {
    throw new Error("Skill upload exceeds the 10 MB limit")
  }

  if (fileName.toLowerCase().endsWith(".md")) {
    const markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { ...parseSkillMarkdown(markdown), resources: [] }
  }
  if (!fileName.toLowerCase().endsWith(".zip")) {
    throw new Error("Upload a SKILL.md file or a .zip bundle")
  }

  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const skillFile = archive.file("SKILL.md")
  if (
    !skillFile ||
    (skillFile.unsafeOriginalName !== undefined && skillFile.unsafeOriginalName !== "SKILL.md")
  ) {
    throw new Error("The zip bundle must contain SKILL.md at its root")
  }

  const markdownBytes = await skillFile.async("uint8array")
  const markdown = new TextDecoder("utf-8", { fatal: true }).decode(markdownBytes)
  const parsed = parseSkillMarkdown(markdown)

  const archiveEntries = Object.values(archive.files)
  for (const entry of archiveEntries) {
    if (entry.dir) continue
    const originalName = entry.unsafeOriginalName ?? entry.name
    if (
      originalName !== "SKILL.md" &&
      originalName.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      normalizeSkillResourcePath(originalName)
    }
  }

  const resourceEntries = archiveEntries.filter((entry) => {
    const originalName = entry.unsafeOriginalName ?? entry.name
    return (
      !entry.dir &&
      entry.name !== "SKILL.md" &&
      !originalName.startsWith("__MACOSX/") &&
      !originalName.split("/").some((segment) => segment.startsWith("."))
    )
  })
  if (resourceEntries.length > MAX_RESOURCES) {
    throw new Error(`Skill bundles may contain at most ${MAX_RESOURCES} supporting files`)
  }

  const resources: AgentSkillResourceInput[] = []
  let totalResourceBytes = 0
  for (const entry of resourceEntries) {
    const resourcePath = normalizeSkillResourcePath(entry.unsafeOriginalName ?? entry.name)
    const resourceBytes = await entry.async("uint8array")
    if (resourceBytes.byteLength > MAX_RESOURCE_BYTES) {
      throw new Error(`Skill resource exceeds the 2 MB limit: ${resourcePath}`)
    }
    totalResourceBytes += resourceBytes.byteLength
    if (totalResourceBytes > MAX_BUNDLE_BYTES) {
      throw new Error("Expanded skill resources exceed the 10 MB limit")
    }
    resources.push(decodeResource(resourcePath, resourceBytes))
  }

  return { ...parsed, resources }
}

export async function exportAgentSkillBundle(
  skill: ParsedAgentSkill,
  resources: readonly StoredAgentSkillResource[],
): Promise<Buffer> {
  const archive = new JSZip()
  archive.file("SKILL.md", buildSkillMarkdown(skill.manifest, skill.instructions))
  for (const resource of resources) {
    const resourcePath = normalizeSkillResourcePath(resource.path)
    archive.file(
      resourcePath,
      resource.encoding === "base64" ? Buffer.from(resource.content, "base64") : resource.content,
    )
  }
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}
