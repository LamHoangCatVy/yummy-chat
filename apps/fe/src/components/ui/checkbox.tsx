"use client"

import { Check } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import type * as React from "react"

import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-radius-sm border border-border-default bg-surface-primary outline-none transition-colors focus-visible:border-border-accent focus-visible:ring-[3px] focus-visible:ring-accent-primary/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent-primary data-[state=checked]:bg-accent-primary data-[state=checked]:text-text-inverse",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <Check className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
