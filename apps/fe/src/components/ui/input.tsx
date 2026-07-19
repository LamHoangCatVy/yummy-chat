import type * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "flex h-9 w-full min-w-0 rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus-visible:border-border-accent focus-visible:ring-[3px] focus-visible:ring-accent-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
