import type { ProviderTool, ProviderToolExecutor, ProviderToolResult } from "./provider.js"

export interface ProviderToolSet {
  readonly tools: readonly ProviderTool[]
  execute(name: string, arguments_: Record<string, unknown>): Promise<ProviderToolResult>
  close?(): Promise<void>
}

export interface CombinedProviderToolSet {
  readonly tools: readonly ProviderTool[]
  readonly execute: ProviderToolExecutor
  close(): Promise<void>
}

export function combineProviderToolSets(sets: readonly ProviderToolSet[]): CombinedProviderToolSet {
  const ownerByTool = new Map<string, ProviderToolSet>()
  const tools: ProviderTool[] = []
  for (const set of sets) {
    for (const tool of set.tools) {
      if (ownerByTool.has(tool.name)) {
        throw new Error(`Duplicate provider tool name: ${tool.name}`)
      }
      ownerByTool.set(tool.name, set)
      tools.push(tool)
    }
  }

  return {
    tools,
    async execute(name, arguments_) {
      const owner = ownerByTool.get(name)
      if (!owner) return { content: `Unknown provider tool: ${name}`, isError: true }
      return owner.execute(name, arguments_)
    },
    async close() {
      await Promise.allSettled(sets.map((set) => set.close?.()))
    },
  }
}
