"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  type AnnotationAsset,
  type AnnotationRow,
} from "@/lib/annotation-assets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function VideoAnnotationEditor({ asset }: { asset: AnnotationAsset }) {
  const url = asset.primary_media_url
  const [rows, setRows] = useState<AnnotationRow[]>([])
  const [loading, setLoading] = useState(true)

  const [fbFrame, setFbFrame] = useState("0")
  const [fbLabel, setFbLabel] = useState("object")
  const [fbX, setFbX] = useState("0")
  const [fbY, setFbY] = useState("0")
  const [fbW, setFbW] = useState("80")
  const [fbH, setFbH] = useState("60")

  const [trId, setTrId] = useState("obj_1")
  const [trLabel, setTrLabel] = useState("object")
  const [trW, setTrW] = useState("")
  const [trH, setTrH] = useState("")
  const [trFramesJson, setTrFramesJson] = useState(
    '[{"frame":0,"x":10,"y":20},{"frame":1,"x":12,"y":22}]',
  )

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listAnnotations(asset.id)
      setRows(list)
    } catch {
      toast.error("Failed to load annotations")
    } finally {
      setLoading(false)
    }
  }, [asset.id])

  useEffect(() => {
    reload()
  }, [reload])

  async function addFrameBox() {
    try {
      await createAnnotation(asset.id, {
        annotation_kind: "video_frame_bbox",
        payload: {
          frame: parseInt(fbFrame, 10),
          label: fbLabel,
          bbox: {
            x: parseFloat(fbX),
            y: parseFloat(fbY),
            w: parseFloat(fbW),
            h: parseFloat(fbH),
          },
        },
      })
      toast.success("Added")
      reload()
    } catch {
      toast.error("Invalid values or request failed")
    }
  }

  async function addTrack() {
    try {
      const frames = JSON.parse(trFramesJson) as { frame: number; x: number; y: number }[]
      const payload: Record<string, unknown> = {
        object_id: trId,
        label: trLabel,
        frames,
      }
      if (trW.trim()) payload.w = parseFloat(trW)
      if (trH.trim()) payload.h = parseFloat(trH)
      await createAnnotation(asset.id, {
        annotation_kind: "video_track",
        payload,
      })
      toast.success("Track added")
      reload()
    } catch {
      toast.error("Invalid track JSON or request failed")
    }
  }

  async function removeRow(id: string) {
    try {
      await deleteAnnotation(asset.id, id)
      toast.success("Removed")
      reload()
    } catch {
      toast.error("Delete failed")
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-3">
        {url ? (
          <video
            src={url}
            controls
            className="w-full max-h-[360px] rounded-md border bg-black"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No video URL.</p>
        )}
        <ul className="text-sm space-y-2 max-h-[280px] overflow-auto border rounded-md p-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
            >
              <span className="font-mono text-xs break-all">
                {r.annotation_kind}: {JSON.stringify(r.payload)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-destructive"
                onClick={() => removeRow(r.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-8">
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">Frame bounding box</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Frame</Label>
              <Input value={fbFrame} onChange={(e) => setFbFrame(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input value={fbLabel} onChange={(e) => setFbLabel(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">x</Label>
              <Input value={fbX} onChange={(e) => setFbX(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">y</Label>
              <Input value={fbY} onChange={(e) => setFbY(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">w</Label>
              <Input value={fbW} onChange={(e) => setFbW(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">h</Label>
              <Input value={fbH} onChange={(e) => setFbH(e.target.value)} />
            </div>
          </div>
          <Button type="button" size="sm" onClick={addFrameBox}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">Moving object track</h3>
          <div className="grid gap-2">
            <div>
              <Label className="text-xs">object_id</Label>
              <Input value={trId} onChange={(e) => setTrId(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">label</Label>
              <Input value={trLabel} onChange={(e) => setTrLabel(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">w (optional)</Label>
                <Input value={trW} onChange={(e) => setTrW(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">h (optional)</Label>
                <Input value={trH} onChange={(e) => setTrH(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">frames JSON</Label>
              <Textarea
                rows={5}
                className="font-mono text-xs"
                value={trFramesJson}
                onChange={(e) => setTrFramesJson(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" size="sm" onClick={addTrack}>
            <Plus className="h-4 w-4 mr-1" />
            Add track
          </Button>
        </div>
      </div>
    </div>
  )
}
