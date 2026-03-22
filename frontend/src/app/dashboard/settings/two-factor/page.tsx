"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TwoFactorSetup } from "@/components/two-factor/TwoFactorSetup"
import { useAuth } from "@/context/auth-context"
import { twoFactor } from "@/lib/two-factor"
import { toast } from "sonner"

export default function TwoFactorSettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [showSetup, setShowSetup] = useState(false)
  const [showDisableDialog, setShowDisableDialog] = useState(false)
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [disabling, setDisabling] = useState(false)

  const isEnabled = user?.two_factor_enabled ?? false

  useEffect(() => {
    if (user?.two_factor_feature_enabled === false) {
      router.replace("/dashboard/settings")
    }
  }, [user, router])

  useEffect(() => {
    if (showRecoveryCodes && isEnabled && !recoveryCodes) {
      loadRecoveryCodes()
    }
  }, [showRecoveryCodes, isEnabled])

  const loadRecoveryCodes = async () => {
    try {
      setLoading(true)
      const response = await twoFactor.getRecoveryCodes()
      setRecoveryCodes(response.recovery_codes)
    } catch (error) {
      toast.error("Failed to load recovery codes")
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    try {
      setDisabling(true)
      await twoFactor.disable()
      toast.success("Two-factor authentication disabled")
      setShowDisableDialog(false)
      // Refresh user data and reload to update auth context
      window.location.reload()
    } catch (error) {
      toast.error("Failed to disable two-factor authentication")
    } finally {
      setDisabling(false)
    }
  }

  const handleSetupSuccess = (codes: string[]) => {
    setRecoveryCodes(codes)
    setShowSetup(false)
    // Refresh user data and reload to update auth context
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Two-Factor Authentication</h1>
        <p className="text-muted-foreground mt-2">
          Add an extra layer of security to your account
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            {isEnabled
              ? "Two-factor authentication is enabled for your account."
              : "Two-factor authentication is not enabled. Enable it to add an extra layer of security."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${
                isEnabled ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className="font-medium">
              {isEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          {!isEnabled ? (
            <Button onClick={() => setShowSetup(true)}>Enable 2FA</Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRecoveryCodes(true)}
              >
                View Recovery Codes
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowDisableDialog(true)}
              >
                Disable 2FA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {showSetup && (
        <TwoFactorSetup
          onSuccess={handleSetupSuccess}
          onCancel={() => setShowSetup(false)}
        />
      )}

      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication?</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable two-factor authentication? This
              will make your account less secure.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDisableDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisable} disabled={disabling}>
              {disabling ? "Disabling..." : "Disable"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecoveryCodes} onOpenChange={setShowRecoveryCodes}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recovery Codes</DialogTitle>
            <DialogDescription>
              Save these recovery codes in a safe place. You can use them to
              access your account if you lose your authenticator device.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-4">Loading...</div>
          ) : recoveryCodes && recoveryCodes.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <ul className="space-y-2 font-mono text-sm">
                  {recoveryCodes.map((code, index) => (
                    <li key={index}>{code}</li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const text = recoveryCodes.join("\n")
                    const blob = new Blob([text], { type: "text/plain" })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement("a")
                    link.href = url
                    link.download = "recovery-codes.txt"
                    link.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Download Codes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRecoveryCodes(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-muted-foreground">
              No recovery codes available
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
