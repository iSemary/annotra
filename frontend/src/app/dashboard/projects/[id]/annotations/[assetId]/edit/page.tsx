"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { getAnnotationAsset, type AnnotationAsset } from "@/lib/annotation-assets"
import { Button } from "@/components/ui/button"
import { AnnotationAssetEditorPanel } from "@/components/annotations/AnnotationAssetEditorPanel"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function EditAnnotationAssetPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = typeof params.id === "string" ? params.id : ""
  const assetId =
    typeof params.assetId === "string" ? params.assetId : ""
  const idsOk = UUID_RE.test(projectId) && UUID_RE.test(assetId)

  const [asset, setAsset] = useState<AnnotationAsset | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!idsOk) {
      toast.error("Invalid link")
      router.replace(`/dashboard/projects/${projectId || ""}`)
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setLoading(true)
    })
    getAnnotationAsset(assetId)
      .then((a) => {
        if (!cancelled) {
          if (a.project_id !== projectId) {
            toast.error("Asset does not belong to this project")
            router.replace(`/dashboard/projects/${projectId}/annotations`)
            return
          }
          setAsset(a)
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load asset")
          router.replace(`/dashboard/projects/${projectId}/annotations`)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [assetId, projectId, idsOk, router])

  if (!idsOk) return null

  if (loading || !asset) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/projects/${projectId}/annotations`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{asset.title}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {asset.file_type} · {asset.status.replace("_", " ")}
          </p>
        </div>
      </div>

      <AnnotationAssetEditorPanel asset={asset} />
    </div>
  )
}
