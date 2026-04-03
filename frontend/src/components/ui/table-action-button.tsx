"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Icon-only table action with Radix tooltip (dashboard layout already wraps `TooltipProvider`). */
export function TableActionButton({
  label,
  caption,
  className,
  asChild,
  type,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; caption?: string }) {
  const control = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 shrink-0", className)}
          type={asChild ? undefined : type ?? "button"}
          asChild={asChild}
          {...props}
        />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )

  if (!caption) return control

  return (
    <div className="flex min-w-0 max-w-19 flex-col items-center gap-0.5">
      {control}
      <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-muted-foreground">
        {caption}
      </span>
    </div>
  )
}
