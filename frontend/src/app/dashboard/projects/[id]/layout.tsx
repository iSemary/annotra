"use client"

import { useParams } from "next/navigation"
import { useAuth } from "@/context/auth-context"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ProjectIdLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const { user } = useAuth()
  const id = typeof params.id === "string" ? params.id : ""
  const idReady = UUID_RE.test(id)
  const canProjects = user?.permissions?.includes("projects:read")

  if (!idReady || !canProjects) {
    return (
      <div className="text-sm text-muted-foreground">Invalid project.</div>
    )
  }

  return <div className="min-w-0">{children}</div>
}
