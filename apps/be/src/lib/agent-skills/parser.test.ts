import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import {
  buildSkillMarkdown,
  exportAgentSkillBundle,
  parseAgentSkillBundle,
  parseSkillMarkdown,
} from "./parser"

describe("Agent Skill parser", () => {
  it("parses standard SKILL.md frontmatter and instructions", () => {
    const parsed = parseSkillMarkdown(`---
name: code-review
description: Review code for correctness. Use when the user asks for a review.
metadata:
  owner: platform
---

# Workflow

Inspect changed files and rank findings by severity.
`)

    expect(parsed.manifest.name).toBe("code-review")
    expect(parsed.manifest.metadata).toEqual({ owner: "platform" })
    expect(parsed.instructions).toContain("rank findings")
    expect(buildSkillMarkdown(parsed.manifest, parsed.instructions)).toContain(
      "description: Review code",
    )
  })

  it("loads supporting files from a zip bundle", async () => {
    const archive = new JSZip()
    archive.file(
      "SKILL.md",
      `---
name: data-analysis
description: Analyze tabular data. Use for dataset and spreadsheet questions.
---

# Analyze data
`,
    )
    archive.file("references/schema.md", "# Columns")

    const parsed = await parseAgentSkillBundle(
      "data-analysis.zip",
      await archive.generateAsync({ type: "uint8array" }),
    )

    expect(parsed.resources).toEqual([
      expect.objectContaining({
        path: "references/schema.md",
        content: "# Columns",
        encoding: "utf8",
      }),
    ])
  })

  it("round-trips SKILL.md and resources through export", async () => {
    const exported = await exportAgentSkillBundle(
      {
        manifest: {
          name: "release-notes",
          description: "Draft release notes. Use after a release is prepared.",
        },
        instructions: "# Draft\n\nSummarize user-visible changes.",
      },
      [
        {
          path: "templates/format.md",
          content: "# Version",
          encoding: "utf8",
          mimeType: "text/markdown",
        },
      ],
    )

    const parsed = await parseAgentSkillBundle("release-notes.zip", exported)
    expect(parsed.manifest.name).toBe("release-notes")
    expect(parsed.instructions).toContain("user-visible")
    expect(parsed.resources[0]?.path).toBe("templates/format.md")
  })

  it("rejects invalid names and missing frontmatter", () => {
    expect(() => parseSkillMarkdown("# No frontmatter")).toThrow("YAML frontmatter")
    expect(() =>
      parseSkillMarkdown(`---
name: Invalid Name
description: Invalid name example.
---

# Instructions
`),
    ).toThrow("lowercase letters")
  })
})
