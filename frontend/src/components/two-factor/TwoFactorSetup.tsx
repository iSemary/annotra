"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { twoFactor } from "@/lib/two-factor"
import { toast } from "sonner"

const verifySchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
})

type VerifyValues = z.infer<typeof verifySchema>

interface TwoFactorSetupProps {
  onSuccess?: (recoveryCodes: string[]) => void
  onCancel?: () => void
}

export function TwoFactorSetup({ onSuccess, onCancel }: TwoFactorSetupProps) {
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [settingUp, setSettingUp] = useState(false)

  const form = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      code: "",
    },
  })

  const handleSetup = async () => {
    try {
      setSettingUp(true)
      const data = await twoFactor.setup()
      // Map snake_case API response to camelCase component state
      // The API returns qr_code_url, we map it to qrCodeUrl for component state
      if (!data.qr_code_url) {
        throw new Error('QR code URL is missing from response')
      }
      setSetupData({
        secret: data.secret,
        qrCodeUrl: data.qr_code_url, // Map from snake_case to camelCase
      })
    } catch (error) {
      toast.error("Failed to setup two-factor authentication")
    } finally {
      setSettingUp(false)
    }
  }

  const onSubmit = async (values: VerifyValues) => {
    if (!setupData) return

    try {
      setLoading(true)
      const response = await twoFactor.confirm(values.code, setupData.secret)
      setRecoveryCodes(response.recovery_codes)
      toast.success("Two-factor authentication enabled successfully")
      if (onSuccess) {
        onSuccess(response.recovery_codes)
      }
    } catch (error) {
      toast.error("Invalid verification code")
      form.setError("code", { message: "Invalid code" })
    } finally {
      setLoading(false)
    }
  }

  if (recoveryCodes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recovery Codes</CardTitle>
          <CardDescription>
            Save these recovery codes in a safe place. You can use them to access your account if you lose your authenticator device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Done
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!setupData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enable Two-Factor Authentication</CardTitle>
          <CardDescription>
            Add an extra layer of security to your account by enabling two-factor authentication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSetup} disabled={settingUp}>
            {settingUp ? "Setting up..." : "Start Setup"}
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} className="ml-2">
              Cancel
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan QR Code</CardTitle>
        <CardDescription>
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <div className="rounded-lg border p-4 bg-white">
            {setupData?.qrCodeUrl ? (
              <QRCodeSVG 
                value={String(setupData.qrCodeUrl)} 
                size={256} 
                level="H"
                includeMargin={true}
              />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center text-sm text-muted-foreground">
                Loading QR code...
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Or enter this code manually:</p>
          <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">
            {setupData.secret}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verification Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="000000"
                      maxLength={6}
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "")
                        field.onChange(value)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Verifying..." : "Verify & Enable"}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
