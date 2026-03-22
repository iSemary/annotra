"use client"

import { useState, useEffect } from "react"
import {
  getDashboardSummary,
  type DashboardSummary,
} from "@/lib/dashboard"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "sonner"

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const data = await getDashboardSummary()
        if (!cancelled) setSummary(data)
      } catch {
        if (!cancelled) {
          toast.error("Failed to load dashboard")
          setSummary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Loading…</p>
        </div>
        <div className="h-32 max-w-md animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Signed-in overview for your workspace
        </p>
      </div>

      {summary ? (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              From <code className="text-xs">GET /dashboard/summary</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Company slug:</span>{" "}
              <span className="font-medium">{summary.slug}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Role:</span>{" "}
              <span className="font-medium">{summary.role}</span>
            </p>
            <p className="break-all text-muted-foreground text-xs">
              User ID: {summary.user_id}
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground">
          No summary available. Ensure your account has the{" "}
          <code className="text-xs">dashboard:read</code> permission.
        </p>
      )}
    </div>
  )
}
