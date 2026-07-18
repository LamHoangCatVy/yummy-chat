import type * as React from "react"

import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "ghost" | "outline"
type ButtonSize = "default" | "sm" | "icon"

interface ButtonProps extends React.ComponentProps<"button"> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-accent-primary text-text-inverse hover:opacity-90",
  ghost: "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary",
  outline:
    "border border-border-default bg-surface-primary text-text-primary hover:bg-surface-tertiary",
}

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-spacing-3 py-spacing-2",
  sm: "h-8 px-spacing-2",
  icon: "size-8",
}

function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-spacing-2 whitespace-nowrap rounded-radius-md text-[0.8125rem] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-accent-primary/30 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  )
}

export { Button }
