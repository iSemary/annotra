"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon, GripVertical } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const RESIZE_MIN_PX = 320
const RESIZE_MAX_PX = 0.95 * (typeof window !== "undefined" ? window.innerWidth : 1920)

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  style: propsStyle,
  showCloseButton = true,
  resizable = true,
  defaultWidthVw = 70,
  minWidth = RESIZE_MIN_PX,
  maxWidth = RESIZE_MAX_PX,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Allow resizing from the left edge (default true) */
  resizable?: boolean
  /** Initial width in vw when no explicit width is set (default 70) */
  defaultWidthVw?: number
  minWidth?: number
  maxWidth?: number
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [widthPx, setWidthPx] = React.useState<number | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const dragStartRef = React.useRef<{ x: number; w: number } | null>(null)

  const maxPx = typeof window !== "undefined" ? Math.min(maxWidth, window.innerWidth * 0.95) : maxWidth

  React.useEffect(() => {
    if (!resizable || !dragging) return
    const onMove = (e: PointerEvent) => {
      const start = dragStartRef.current
      if (!start) return
      const delta = start.x - e.clientX
      const next = Math.round(start.w + delta)
      setWidthPx(Math.min(maxPx, Math.max(minWidth, next)))
    }
    const onEnd = () => {
      setDragging(false)
      dragStartRef.current = null
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerup", onEnd)
    window.addEventListener("pointercancel", onEnd)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onEnd)
      window.removeEventListener("pointercancel", onEnd)
    }
  }, [resizable, dragging, minWidth, maxPx])

  const handleResizePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (!resizable) return
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      const el = contentRef.current
      const w = widthPx ?? (el ? el.getBoundingClientRect().width : typeof window !== "undefined" ? window.innerWidth * (defaultWidthVw / 100) : 600)
      dragStartRef.current = { x: e.clientX, w }
      setWidthPx(w)
      setDragging(true)
    },
    [resizable, widthPx, defaultWidthVw]
  )

  const handleResizePointerUp = React.useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
    dragStartRef.current = null
  }, [])

  const widthStyle: React.CSSProperties =
    widthPx != null ? { width: widthPx } : { width: `${defaultWidthVw}vw` }
  if (resizable) {
    widthStyle.maxWidth = maxPx
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        className={cn(
          "bg-background fixed right-0 top-0 z-50 flex h-full flex-col border-l shadow-lg outline-none transition-transform duration-300 ease-out data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 max-w-full",
          className
        )}
        style={{ ...propsStyle, ...widthStyle }}
        {...props}
      >
        {resizable && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={widthPx ?? undefined}
            aria-label="Resize"
            onPointerDown={handleResizePointerDown}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            onPointerLeave={(e) => {
              if (dragging) return
              e.currentTarget.releasePointerCapture(e.pointerId)
            }}
            className={cn(
              "absolute left-0 top-0 z-10 flex h-full w-4 cursor-col-resize select-none items-center justify-center touch-none",
              "hover:bg-border/50 active:bg-border/80 transition-colors",
              "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:opacity-0 hover:after:opacity-100"
            )}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/60 pointer-events-none" />
          </div>
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-4 text-left", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex-1 overflow-auto p-4 pt-0", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
}
