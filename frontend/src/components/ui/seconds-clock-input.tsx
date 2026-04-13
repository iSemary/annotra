"use client"

import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatTimeMmSs, parseTimeToSeconds } from "@/lib/time-format"
import { cn } from "@/lib/utils"

export function SecondsClockInput({
  value,
  onChange,
  placeholder = "00:00",
  disabled,
  id,
  step = 1,
  className,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Step in seconds when using the arrow buttons. */
  step?: number
  className?: string
  "aria-label"?: string
}) {
  const bump = (dir: 1 | -1) => {
    const cur = parseTimeToSeconds(value)
    const base = cur === null ? 0 : cur
    const next = Math.max(0, base + dir * step)
    onChange(formatTimeMmSs(next))
  }

  return (
    <div
      className={cn(
        "flex h-9 w-full overflow-hidden rounded-md border border-input bg-transparent shadow-xs",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <Input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault()
            bump(1)
          } else if (e.key === "ArrowDown") {
            e.preventDefault()
            bump(-1)
          }
        }}
        className={cn(
          "h-9 min-w-0 flex-1 border-0 bg-transparent shadow-none rounded-none",
          "text-center font-mono text-sm tabular-nums tracking-tight",
          "focus-visible:ring-0 focus-visible:ring-offset-0",
        )}
      />
      <div className="grid h-9 w-9 shrink-0 grid-rows-2 border-l border-input">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className="h-full min-h-0 rounded-none border-0 px-0 py-0 hover:bg-muted/80"
          aria-label="Increase time"
          onClick={() => bump(1)}
        >
          <ChevronUp className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className="h-full min-h-0 rounded-none border-0 border-t border-input px-0 py-0 hover:bg-muted/80"
          aria-label="Decrease time"
          onClick={() => bump(-1)}
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
