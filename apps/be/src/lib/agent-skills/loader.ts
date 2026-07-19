import type { SkillId } from "@yummy/shared"
import type { Actor } from "../authz.js"
import type { ProviderTool, ProviderToolResult } from "../llm/provider.js"
import { type SkillResourceRow, type SkillRow, skillRepository } from "../repositories.js"
import {
  type AgentSkillManifest,
  buildSkillMarkdown,
  normalizeSkillResourcePath,
} from "./parser.js"

const MAX_RESOURCE_CONTEXT_CHARS = 100_000
const ACTIVATE_SKILL_TOOL = "activate_skill"
const READ_SKILL_RESOURCE_TOOL = "read_skill_resource"

export interface ActivatedAgentSkill {
  readonly id: string
  readonly name: string
  readonly slug: string
}

export interface AgentSkillToolSet {
  readonly tools: readonly ProviderTool[]
  readonly catalogPrompt: string
  readonly activeSkillPrompt: string | null
  readonly activeSkillName: string | null
  execute(name: string, arguments_: Record<string, unknown>): Promise<ProviderToolResult>
  getActivatedSkills(): readonly ActivatedAgentSkill[]
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function manifestFor(row: SkillRow): AgentSkillManifest {
  const stored = row.manifest
  const metadata =
    stored.metadata && typeof stored.metadata === "object" && !Array.isArray(stored.metadata)
      ? (stored.metadata as Record<string, unknown>)
      : undefined
  return {
    name: row.slug,
    description: row.description,
    ...(optionalString(stored.license) ? { license: stored.license as string } : {}),
    ...(optionalString(stored.compatibility)
      ? { compatibility: stored.compatibility as string }
      : {}),
    ...(metadata ? { metadata } : {}),
    ...(optionalString(stored.allowedTools) ? { allowedTools: stored.allowedTools as string } : {}),
  }
}

function resourceIndex(resources: readonly SkillResourceRow[]): string {
  if (resources.length === 0) return "No bundled resources."
  return [
    "<skill_resources>",
    ...resources.map(
      (resource) =>
        `- ${resource.path} (${resource.mimeType}, ${resource.byteSize} bytes, ${resource.encoding})`,
    ),
    "</skill_resources>",
  ].join("\n")
}

function renderSkillContent(row: SkillRow, resources: readonly SkillResourceRow[]): string {
  const markdown = buildSkillMarkdown(manifestFor(row), row.prompt)
  return [
    `<skill_content name="${row.slug}">`,
    markdown.trim(),
    "",
    resourceIndex(resources),
    "",
    "Use read_skill_resource only for a listed resource that is needed for the current task.",
    "</skill_content>",
  ].join("\n")
}

function buildCatalogPrompt(skills: readonly SkillRow[]): string {
  if (skills.length === 0) return ""
  const catalog = skills.map((row) => ({
    name: row.slug,
    description: row.description,
  }))
  return [
    "## Available Agent Skills",
    "The following catalog contains metadata only. Do not assume a skill's instructions.",
    "When the user's task matches a skill description, call activate_skill with its name before doing the task.",
    "You may activate multiple relevant skills. Load supporting resources only when the activated skill requires them.",
    "<available_agent_skills>",
    JSON.stringify(catalog),
    "</available_agent_skills>",
  ].join("\n")
}

function toolDefinitions(skills: readonly SkillRow[]): readonly ProviderTool[] {
  if (skills.length === 0) return []
  const names = skills.map((row) => row.slug)
  return [
    {
      name: ACTIVATE_SKILL_TOOL,
      description:
        "Load the full SKILL.md instructions for an available Agent Skill before using that workflow.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: names,
            description: "Exact skill name from the available Agent Skills catalog.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    {
      name: READ_SKILL_RESOURCE_TOOL,
      description:
        "Read one supporting file from an already activated Agent Skill. Use only paths returned by activate_skill.",
      inputSchema: {
        type: "object",
        properties: {
          skill: { type: "string", enum: names },
          path: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["skill", "path"],
        additionalProperties: false,
      },
    },
  ]
}

export async function createAgentSkillToolSet(
  actor: Actor,
  selectedSkillId?: SkillId,
): Promise<AgentSkillToolSet> {
  const repository = skillRepository(actor)
  const skills = await repository.listEnabled()
  const skillsBySlug = new Map(skills.map((row) => [row.slug, row]))
  const activated = new Map<string, ActivatedAgentSkill>()

  let activeSkillPrompt: string | null = null
  let activeSkillName: string | null = null
  if (selectedSkillId) {
    const selected = await repository.getById(selectedSkillId)
    if (selected?.enabled) {
      const resources = await repository.listResources(selectedSkillId)
      activeSkillPrompt = renderSkillContent(selected, resources)
      activeSkillName = selected.name
      activated.set(selected.slug, {
        id: selected.id,
        name: selected.name,
        slug: selected.slug,
      })
    }
  }

  return {
    tools: toolDefinitions(skills),
    catalogPrompt: buildCatalogPrompt(skills),
    activeSkillPrompt,
    activeSkillName,
    async execute(name, arguments_) {
      if (name === ACTIVATE_SKILL_TOOL) {
        const slug = arguments_.name
        if (typeof slug !== "string") {
          return { content: "activate_skill requires a skill name", isError: true }
        }
        const row = skillsBySlug.get(slug)
        if (!row) return { content: `Unknown or disabled Agent Skill: ${slug}`, isError: true }

        const resources = await repository.listResources(row.id as SkillId)
        activated.set(row.slug, { id: row.id, name: row.name, slug: row.slug })
        return { content: renderSkillContent(row, resources) }
      }

      if (name === READ_SKILL_RESOURCE_TOOL) {
        const slug = arguments_.skill
        const requestedPath = arguments_.path
        if (typeof slug !== "string" || typeof requestedPath !== "string") {
          return {
            content: "read_skill_resource requires skill and path strings",
            isError: true,
          }
        }
        if (!activated.has(slug)) {
          return {
            content: `Activate the ${slug} skill before reading its resources`,
            isError: true,
          }
        }
        const row = skillsBySlug.get(slug)
        if (!row) return { content: `Unknown or disabled Agent Skill: ${slug}`, isError: true }

        let resourcePath: string
        try {
          resourcePath = normalizeSkillResourcePath(requestedPath)
        } catch (error) {
          return {
            content: error instanceof Error ? error.message : "Invalid skill resource path",
            isError: true,
          }
        }

        const resource = await repository.getResource(row.id as SkillId, resourcePath)
        if (!resource) {
          return {
            content: `Resource not found in ${slug}: ${resourcePath}`,
            isError: true,
          }
        }
        if (resource.encoding !== "utf8") {
          return {
            content: JSON.stringify({
              path: resource.path,
              mimeType: resource.mimeType,
              byteSize: resource.byteSize,
              encoding: resource.encoding,
              note: "Binary resources are available to the runtime but are not inlined into model context.",
            }),
          }
        }

        const truncated = resource.content.length > MAX_RESOURCE_CONTEXT_CHARS
        const content = resource.content.slice(0, MAX_RESOURCE_CONTEXT_CHARS)
        return {
          content: [
            `<skill_resource skill="${slug}" path="${resource.path}">`,
            content,
            truncated ? "\n[Resource truncated at 100,000 characters]" : "",
            "</skill_resource>",
          ].join("\n"),
        }
      }

      return { content: `Unknown Agent Skills tool: ${name}`, isError: true }
    },
    getActivatedSkills() {
      return [...activated.values()]
    },
  }
}
