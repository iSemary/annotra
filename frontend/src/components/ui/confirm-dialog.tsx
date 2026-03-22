"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(null)

interface ConfirmState extends Omit<ConfirmOptions, "resolve"> {
  open: boolean
}

const defaultState: ConfirmState = {
  open: false,
  title: "",
  description: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  variant: "default",
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState>(defaultState)
  const resolveRef = React.useRef<((value: boolean) => void) | null>(null)

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({
        open: true,
        title: options.title,
        description: options.description ?? "",
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: options.variant ?? "default",
      })
    })
  }, [])

  const handleClose = React.useCallback((value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setState(defaultState)
  }, [])

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) handleClose(false)
    },
    [handleClose]
  )

  const value = React.useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <Dialog open={state.open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{state.title}</DialogTitle>
            {state.description ? (
              <DialogDescription>{state.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
            >
              {state.cancelLabel}
            </Button>
            <Button
              type="button"
              variant={state.variant === "destructive" ? "destructive" : "default"}
              onClick={() => handleClose(true)}
            >
              {state.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirm(): ConfirmDialogContextValue {
  const ctx = React.useContext(ConfirmDialogContext)
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmDialogProvider")
  }
  return ctx
}
