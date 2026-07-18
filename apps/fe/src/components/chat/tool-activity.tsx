"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { CheckCircle2, ChevronDown, CircleAlert, Loader2, Wrench } from "lucide-react"
import { useState } from "react"
import type { ToolCallActivity } from "./types"

interface ToolActivityProps {
  readonly toolCalls: readonly ToolCallActivity[]
}

export function ToolActivity({ toolCalls }: ToolActivityProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set())

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="mb-spacing-3 space-y-spacing-2" aria-label="Tool activity">
      {toolCalls.map((toolCall) => {
        const expanded = expandedIds.has(toolCall.id)
        const hasArguments = Object.keys(toolCall.arguments).length > 0
        const hasResult = toolCall.result !== undefined
        const hasDetails = hasArguments || hasResult
        const status = statusDetails(toolCall.status)
        const StatusIcon = status.icon

        return (
          <Card key={toolCall.id} className="gap-0 overflow-hidden bg-surface-primary">
            <CardHeader className="min-h-10 gap-spacing-3 px-spacing-3 py-spacing-2">
              <div className="flex min-w-0 items-center gap-spacing-2">
                <Wrench size={14} className="shrink-0 text-text-tertiary" aria-hidden="true" />
                <span
                  className="truncate font-mono text-[0.75rem] font-medium text-text-primary"
                  title={toolCall.name}
                >
                  {displayToolName(toolCall.name)}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-spacing-2">
                <output
                  className={`inline-flex items-center gap-spacing-1 text-[0.75rem] font-medium ${status.className}`}
                >
                  <StatusIcon
                    size={13}
                    className={toolCall.status === "running" ? "animate-spin" : undefined}
                    aria-hidden="true"
                  />
                  {status.label}
                </output>
                {hasDetails && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => toggleExpanded(toolCall.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} details for ${displayToolName(toolCall.name)}`}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
                    />
                  </Button>
                )}
              </div>
            </CardHeader>
            {expanded && hasDetails && (
              <CardContent className="space-y-spacing-3 border-t border-border-subtle px-spacing-3 py-spacing-3">
                {hasArguments && (
                  <ToolDetail label="Arguments">
                    {JSON.stringify(toolCall.arguments, null, 2)}
                  </ToolDetail>
                )}
                {hasResult && (
                  <ToolDetail label="Result">{toolCall.result || "[Empty result]"}</ToolDetail>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function ToolDetail({
  label,
  children,
}: {
  readonly label: string
  readonly children: string
}) {
  return (
    <div>
      <p className="mb-spacing-1 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-radius-sm bg-surface-secondary p-spacing-2 text-left font-mono text-[0.75rem] leading-[1.5] text-text-secondary">
        {children}
      </pre>
    </div>
  )
}

function displayToolName(name: string): string {
  return name.replace(/^mcp_[^_]+_/, "").replace(/_\d+$/, "")
}

function statusDetails(status: ToolCallActivity["status"]) {
  switch (status) {
    case "success":
      return {
        label: "Completed",
        className: "text-status-success",
        icon: CheckCircle2,
      }
    case "error":
      return {
        label: "Failed",
        className: "text-status-error",
        icon: CircleAlert,
      }
    default:
      return {
        label: "Calling",
        className: "text-text-secondary",
        icon: Loader2,
      }
  }
}
