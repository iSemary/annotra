"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js"
import { toast } from "sonner"
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  patchAnnotation,
  type AnnotationAsset,
} from "@/lib/annotation-assets"

export function AudioAnnotationEditor({ asset }: { asset: AnnotationAsset }) {
  const url = asset.primary_media_url
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    if (!url || !containerRef.current) return

    let cancelled = false
    const mapAnn = new Map<string, string>()

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      waveColor: "#64748b",
      progressColor: "#334155",
      height: 120,
    })
    const regions = RegionsPlugin.create()
    ws.registerPlugin(regions)

    ws.on("ready", async () => {
      if (cancelled) return
      try {
        const rows = await listAnnotations(asset.id)
        for (const r of rows) {
          if (r.annotation_kind !== "audio_segment") continue
          const p = r.payload as { start: number; end: number; label?: string }
          regions.addRegion({
            id: r.id,
            start: p.start,
            end: p.end,
            color: "rgba(99,102,241,0.25)",
            content: p.label ?? "segment",
          })
          mapAnn.set(r.id, r.id)
        }
        setStatus("ready")
      } catch {
        if (!cancelled) {
          toast.error("Failed to load annotations")
          setStatus("error")
        }
      }
    })

    ws.on("error", () => {
      if (!cancelled) {
        toast.error("Audio failed to load")
        setStatus("error")
      }
    })

    regions.on("region-created", async (region) => {
      const start = region.start
      const end = region.end
      region.remove()
      if (end <= start || cancelled) return
      try {
        const row = await createAnnotation(asset.id, {
          annotation_kind: "audio_segment",
          payload: {
            start,
            end,
            label: "segment",
          },
        })
        regions.addRegion({
          id: row.id,
          start,
          end,
          color: "rgba(99,102,241,0.25)",
          content: "segment",
        })
        mapAnn.set(row.id, row.id)
      } catch {
        toast.error("Could not save segment")
      }
    })

    regions.on("region-updated", async (region) => {
      const annId = mapAnn.get(region.id)
      if (!annId || cancelled) return
      try {
        let label = "segment"
        const c = region.getContent?.(false)
        if (typeof c === "string" && c.trim()) label = c.trim()
        await patchAnnotation(asset.id, annId, {
          annotation_kind: "audio_segment",
          payload: {
            start: region.start,
            end: region.end,
            label,
          },
        })
      } catch {
        toast.error("Could not update segment")
      }
    })

    regions.on("region-removed", async (region) => {
      const annId = mapAnn.get(region.id)
      if (!annId || cancelled) return
      mapAnn.delete(region.id)
      try {
        await deleteAnnotation(asset.id, annId)
      } catch {
        /* ignore */
      }
    })

    const disableDrag = regions.enableDragSelection({
      color: "rgba(34,197,94,0.2)",
    })

    return () => {
      cancelled = true
      disableDrag()
      ws.destroy()
    }
  }, [url, asset.id])

  if (!url) {
    return <p className="text-sm text-muted-foreground">No audio URL.</p>
  }

  return (
    <div className="space-y-4">
      {status === "loading" && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={containerRef} className="w-full rounded-md border bg-muted/20 p-2" />
      {status === "ready" && (
        <p className="text-xs text-muted-foreground">
          Drag on the waveform to create a segment. Resize regions to adjust start and end
          times.
        </p>
      )}
    </div>
  )
}
