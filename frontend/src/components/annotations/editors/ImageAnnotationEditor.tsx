"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CirclePlus, Loader2, Save } from "lucide-react"
import { Stage, Layer, Image as KonvaImage, Rect } from "react-konva"
import { toast } from "sonner"
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  patchAnnotation,
  type AnnotationAsset,
  type AnnotationRow,
} from "@/lib/annotation-assets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Box = {
  clientKey: string
  serverId?: string
  label: string
  x: number
  y: number
  w: number
  h: number
}

const MAX_W = 880

function rowsToBoxes(rows: AnnotationRow[]): Box[] {
  return rows
    .filter((r) => r.annotation_kind === "image_bbox")
    .map((r) => {
      const p = r.payload as {
        label?: string
        bbox?: { x: number; y: number; w: number; h: number }
        id?: string
      }
      const b = p.bbox ?? { x: 0, y: 0, w: 40, h: 40 }
      return {
        clientKey: r.id,
        serverId: r.id,
        label: String(p.label ?? ""),
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
      }
    })
}

export function ImageAnnotationEditor({ asset }: { asset: AnnotationAsset }) {
  const url = asset.primary_media_url
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState({ w: 1, h: 1 })
  const [boxes, setBoxes] = useState<Box[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const scale = useMemo(() => {
    if (!natural.w) return 1
    return Math.min(1, MAX_W / natural.w)
  }, [natural.w])

  const stageW = natural.w * scale
  const stageH = natural.h * scale

  useEffect(() => {
    if (!url) return
    const im = new window.Image()
    im.crossOrigin = "anonymous"
    im.onload = () => {
      setNatural({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 })
      setImgEl(im)
    }
    im.onerror = () => toast.error("Could not load image")
    im.src = url
  }, [url])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listAnnotations(asset.id)
      setBoxes(rowsToBoxes(rows))
    } catch {
      toast.error("Failed to load annotations")
    } finally {
      setLoading(false)
    }
  }, [asset.id])

  useEffect(() => {
    reload()
  }, [reload])

  const updateBox = useCallback((key: string, patch: Partial<Box>) => {
    setBoxes((prev) =>
      prev.map((b) => (b.clientKey === key ? { ...b, ...patch } : b)),
    )
  }, [])

  async function persist() {
    setSaving(true)
    try {
      const existing = new Map(boxes.filter((b) => b.serverId).map((b) => [b.serverId!, b]))
      const rows = await listAnnotations(asset.id)
      const serverIds = new Set(rows.map((r) => r.id))
      for (const r of rows) {
        if (r.annotation_kind !== "image_bbox") continue
        if (!existing.has(r.id)) {
          await deleteAnnotation(asset.id, r.id)
        }
      }
      for (const b of boxes) {
        const payload = {
          label: b.label || "object",
          bbox: { x: b.x, y: b.y, w: b.w, h: b.h },
        }
        if (b.serverId && serverIds.has(b.serverId)) {
          await patchAnnotation(asset.id, b.serverId, {
            annotation_kind: "image_bbox",
            payload,
          })
        } else {
          await createAnnotation(asset.id, {
            annotation_kind: "image_bbox",
            payload,
          })
        }
      }
      toast.success("Saved")
      await reload()
    } catch {
      toast.error("Save failed")
    } finally {
      setSaving(false)
    }
  }

  function addBox() {
    const x = Math.max(0, natural.w / 2 - 40)
    const y = Math.max(0, natural.h / 2 - 30)
    setBoxes((prev) => [
      ...prev,
      {
        clientKey: `new-${Date.now()}`,
        label: "object",
        x,
        y,
        w: 80,
        h: 60,
      },
    ])
  }

  if (!url) {
    return <p className="text-sm text-muted-foreground">No image URL for this asset.</p>
  }

  if (loading && !imgEl) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3 overflow-auto rounded-md border bg-muted/30 p-2">
        {imgEl && (
          <Stage width={stageW} height={stageH}>
            <Layer>
              <KonvaImage
                image={imgEl}
                width={stageW}
                height={stageH}
                listening={false}
              />
              {boxes.map((b) => (
                <Rect
                  key={b.clientKey}
                  x={b.x * scale}
                  y={b.y * scale}
                  width={b.w * scale}
                  height={b.h * scale}
                  stroke="#22c55e"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(e) => {
                    const nx = e.target.x() / scale
                    const ny = e.target.y() / scale
                    updateBox(b.clientKey, { x: nx, y: ny })
                  }}
                />
              ))}
            </Layer>
          </Stage>
        )}
        <p className="text-xs text-muted-foreground px-1">
          Drag boxes. Use the list to set labels, then Save.
        </p>
      </div>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addBox}>
            <CirclePlus className="h-4 w-4 mr-1" />
            Add box
          </Button>
          <Button type="button" size="sm" onClick={persist} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save
          </Button>
        </div>
        <ul className="space-y-3 max-h-[480px] overflow-auto">
          {boxes.map((b) => (
            <li
              key={b.clientKey}
              className="rounded-md border p-3 space-y-2 text-sm"
            >
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  value={b.label}
                  onChange={(e) =>
                    updateBox(b.clientKey, { label: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">x</Label>
                  <Input
                    type="number"
                    value={b.x}
                    onChange={(e) =>
                      updateBox(b.clientKey, {
                        x: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">y</Label>
                  <Input
                    type="number"
                    value={b.y}
                    onChange={(e) =>
                      updateBox(b.clientKey, {
                        y: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">w</Label>
                  <Input
                    type="number"
                    value={b.w}
                    onChange={(e) =>
                      updateBox(b.clientKey, {
                        w: parseFloat(e.target.value) || 4,
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">h</Label>
                  <Input
                    type="number"
                    value={b.h}
                    onChange={(e) =>
                      updateBox(b.clientKey, {
                        h: parseFloat(e.target.value) || 4,
                      })
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() =>
                  setBoxes((prev) => prev.filter((x) => x.clientKey !== b.clientKey))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
