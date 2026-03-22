"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { getProject, type Project } from "@/lib/projects"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === "string" ? params.id : ""
  const idReady = UUID_RE.test(id)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(idReady)

  useEffect(() => {
    if (!idReady) {
      toast.error("Invalid project")
      router.replace("/dashboard/projects")
      return
    }
    let cancelled = false
    setLoading(true)
    getProject(id)
      .then((proj) => {
        if (!cancelled) setProject(proj)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load project")
          router.push("/dashboard/projects")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id, idReady, router])

  if (loading && !project) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!project || !idReady) {
    return null
  }

  return (
    <div className="min-h-full space-y-6 bg-background text-foreground">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {project.description}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Project metadata</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={project.status === "active" ? "default" : "secondary"}>
              {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p>{formatDate(project.created_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last updated</p>
            <p>{formatDate(project.updated_at)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
