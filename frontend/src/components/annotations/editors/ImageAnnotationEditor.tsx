"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type Konva from "konva"
import { CirclePlus, Loader2, Save } from "lucide-react"
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva"
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
import { cn } from "@/lib/utils"

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
/** Height of label row above box (px), matches overlay input */
const LABEL_ROW_H = 28
function finiteOr(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return v
}

function clampNaturalBox(
  x: number,
  y: number,
  w: number,
  h: number,
  natW: number,
  natH: number,
): { x: number; y: number; w: number; h: number } {
  const ww = Math.max(4, Math.min(w, natW))
  const hh = Math.max(4, Math.min(h, natH))
  const xx = Math.max(0, Math.min(finiteOr(x, 0), natW - ww))
  const yy = Math.max(0, Math.min(finiteOr(y, 0), natH - hh))
  return { x: xx, y: yy, w: ww, h: hh }
}

function rowsToBoxes(rows: AnnotationRow[], natW: number, natH: number): Box[] {
  return rows
    .filter((r) => r.annotation_kind === "image_bbox")
    .map((r) => {
      const p = r.payload as {
        label?: string
        bbox?: { x: number; y: number; w: number; h: number }
        id?: string
      }
      const raw = p.bbox ?? { x: 0, y: 0, w: 40, h: 40 }
      const { x, y, w, h } = clampNaturalBox(
        finiteOr(raw.x, 0),
        finiteOr(raw.y, 0),
        finiteOr(raw.w, 40),
        finiteOr(raw.h, 40),
        Math.max(1, natW),
        Math.max(1, natH),
      )
      return {
        clientKey: r.id,
        serverId: r.id,
        label: String(p.label ?? ""),
        x,
        y,
        w,
        h,
      }
    })
}

function clampStageBox(
  box: { x: number; y: number; width: number; height: number; rotation: number },
  stageW: number,
  stageH: number,
) {
  const minPx = 10
  let { x, y, width, height, rotation } = box
  if (!Number.isFinite(x)) x = 0
  if (!Number.isFinite(y)) y = 0
  if (!Number.isFinite(width)) width = minPx
  if (!Number.isFinite(height)) height = minPx
  width = Math.max(minPx, width)
  height = Math.max(minPx, height)
  x = Math.max(0, Math.min(x, stageW - width))
  y = Math.max(0, Math.min(y, stageH - height))
  if (width > stageW) {
    width = stageW
    x = 0
  }
  if (height > stageH) {
    height = stageH
    y = 0
  }
  return { x, y, width, height, rotation }
}

/** Safe numeric string for controlled <input type="number" /> (never NaN). */
function numInputValue(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return String(n)
}

export function ImageAnnotationEditor({ asset }: { asset: AnnotationAsset }) {
  const url = asset.primary_media_url
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState({ w: 1, h: 1 })
  const [boxes, setBoxes] = useState<Box[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const shapeRefs = useRef<Map<string, Konva.Rect>>(new Map())
  const trRef = useRef<Konva.Transformer>(null)

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
      const nw = Math.max(1, natural.w)
      const nh = Math.max(1, natural.h)
      setBoxes(rowsToBoxes(rows, nw, nh))
    } catch {
      toast.error("Failed to load annotations")
    } finally {
      setLoading(false)
    }
  }, [asset.id, natural.w, natural.h])

  useEffect(() => {
    reload()
  }, [reload])

  const updateBox = useCallback((key: string, patch: Partial<Box>) => {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.clientKey !== key) return b
        const next = { ...b, ...patch }
        const c = clampNaturalBox(
          next.x,
          next.y,
          next.w,
          next.h,
          natural.w,
          natural.h,
        )
        return { ...next, ...c }
      }),
    )
  }, [natural.w, natural.h])

  // Re-attach transformer only when selection changes — not on every box move/resize
  // (including on boxes[]) or React-controlled rect updates fight the transformer.
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const raf = requestAnimationFrame(() => {
      if (!selectedKey) {
        tr.nodes([])
        tr.getLayer()?.batchDraw()
        return
      }
      const node = shapeRefs.current.get(selectedKey)
      if (node) {
        tr.nodes([node])
      } else {
        tr.nodes([])
      }
      tr.getLayer()?.batchDraw()
    })
    return () => cancelAnimationFrame(raf)
  }, [selectedKey])

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
    const clientKey = `new-${Date.now()}`
    const nw = natural.w
    const nh = natural.h
    const { x, y, w, h } = clampNaturalBox(
      nw / 2 - 40,
      nh / 2 - 30,
      80,
      60,
      nw,
      nh,
    )
    setBoxes((prev) => [
      ...prev,
      {
        clientKey,
        label: "object",
        x,
        y,
        w,
        h,
      },
    ])
    setSelectedKey(clientKey)
  }

  function syncRectFromNode(clientKey: string, node: Konva.Rect) {
    const sx = node.scaleX()
    const sy = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)
    node.offsetX(0)
    node.offsetY(0)

    const nx = node.x() / scale
    const ny = node.y() / scale
    const nw = (node.width() * sx) / scale
    const nh = (node.height() * sy) / scale

    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nw) || !Number.isFinite(nh)) {
      return
    }

    const c = clampNaturalBox(nx, ny, nw, nh, natural.w, natural.h)
    updateBox(clientKey, c)
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
    <div className="flex h-full min-h-0 flex-1 flex-col gap-6 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[1fr_280px] lg:items-stretch">
      <div className="flex min-h-0 min-w-0 flex-col space-y-3 overflow-y-auto overflow-x-hidden rounded-md border bg-muted/30 p-2">
        {imgEl && (
          <div
            className="relative shrink-0 overflow-visible"
            style={{ width: stageW, height: stageH }}
          >
            <Stage
              width={stageW}
              height={stageH}
              onMouseDown={(e) => {
                const t = e.target
                const stage = t.getStage()
                if (!stage) return
                if (t === stage || t.name() === "bg") {
                  setSelectedKey(null)
                }
              }}
            >
              <Layer>
                <KonvaImage
                  name="bg"
                  image={imgEl}
                  width={stageW}
                  height={stageH}
                  listening
                />
                {boxes.map((b) => (
                  <Rect
                    key={b.clientKey}
                    ref={(node) => {
                      if (node) shapeRefs.current.set(b.clientKey, node)
                      else shapeRefs.current.delete(b.clientKey)
                    }}
                    x={b.x * scale}
                    y={b.y * scale}
                    width={b.w * scale}
                    height={b.h * scale}
                    stroke="#22c55e"
                    strokeWidth={2}
                    draggable
                    dragBoundFunc={(pos) => {
                      const node = shapeRefs.current.get(b.clientKey)
                      const wPx = node
                        ? Math.max(8, node.width() * node.scaleX())
                        : Math.max(8, b.w * scale)
                      const hPx = node
                        ? Math.max(8, node.height() * node.scaleY())
                        : Math.max(8, b.h * scale)
                      return {
                        x: Math.max(0, Math.min(pos.x, stageW - wPx)),
                        y: Math.max(0, Math.min(pos.y, stageH - hPx)),
                      }
                    }}
                    onClick={() => setSelectedKey(b.clientKey)}
                    onTap={() => setSelectedKey(b.clientKey)}
                    onDragMove={(e) => {
                      syncRectFromNode(b.clientKey, e.target as Konva.Rect)
                    }}
                    onDragEnd={(e) => {
                      syncRectFromNode(b.clientKey, e.target as Konva.Rect)
                    }}
                    onTransformEnd={(e) => {
                      syncRectFromNode(b.clientKey, e.target as Konva.Rect)
                    }}
                  />
                ))}
                <Transformer
                  ref={trRef}
                  rotateEnabled={false}
                  flipEnabled={false}
                  borderStroke="#16a34a"
                  anchorStroke="#16a34a"
                  anchorFill="#ffffff"
                  anchorSize={10}
                  keepRatio={false}
                  ignoreStroke
                  boundBoxFunc={(oldBox, newBox) =>
                    clampStageBox(newBox, stageW, stageH)
                  }
                />
              </Layer>
            </Stage>
            {boxes.map((b) => {
              const boxTop = b.y * scale
              const leftPx = b.x * scale
              const labelTop = Math.max(0, boxTop - LABEL_ROW_H)
              const textLen = Math.max(
                (b.label || "").length,
                b.label ? 0 : 5,
              )
              const inputSize = Math.max(4, textLen + 1)
              return (
                <input
                  key={`overlay-label-${b.clientKey}`}
                  type="text"
                  size={inputSize}
                  aria-label={`Label for box ${b.label || "object"}`}
                  placeholder="Label"
                  className={cn(
                    "absolute z-20 box-border h-7 max-w-full rounded-none border-0 text-left text-xs font-bold",
                    "bg-[#22c55e] px-1.5 text-white placeholder:text-white/80",
                    "shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    selectedKey === b.clientKey && "ring-2 ring-white/90",
                  )}
                  style={{
                    left: leftPx,
                    top: labelTop,
                    maxWidth: Math.max(0, stageW - leftPx),
                  }}
                  value={b.label}
                  onChange={(e) =>
                    updateBox(b.clientKey, { label: e.target.value })
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={() => setSelectedKey(b.clientKey)}
                />
              )
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground px-1">
          Drag boxes and resize with handles. Edit labels in the fields above each
          box or in the list, then Save.
        </p>
      </div>
      <div className="flex min-h-0 flex-col space-y-4 lg:min-h-0">
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addBox}>
            <CirclePlus className="h-4 w-4 mr-1" />
            Add annotation
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
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden lg:min-h-0">
          {boxes.map((b) => (
            <li
              key={b.clientKey}
              className={`rounded-md border p-3 space-y-2 text-sm cursor-pointer transition-colors ${
                selectedKey === b.clientKey
                  ? "border-primary ring-1 ring-primary/30 bg-primary/5"
                  : ""
              }`}
              onClick={() => setSelectedKey(b.clientKey)}
            >
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  className="rounded-none"
                  value={b.label}
                  onChange={(e) =>
                    updateBox(b.clientKey, { label: e.target.value })
                  }
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">x</Label>
                  <Input
                    type="number"
                    value={numInputValue(b.x)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      updateBox(b.clientKey, {
                        x: Number.isFinite(v) ? v : 0,
                      })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <Label className="text-xs">y</Label>
                  <Input
                    type="number"
                    value={numInputValue(b.y)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      updateBox(b.clientKey, {
                        y: Number.isFinite(v) ? v : 0,
                      })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <Label className="text-xs">w</Label>
                  <Input
                    type="number"
                    value={numInputValue(b.w)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      updateBox(b.clientKey, {
                        w: Number.isFinite(v) ? v : 4,
                      })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <Label className="text-xs">h</Label>
                  <Input
                    type="number"
                    value={numInputValue(b.h)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      updateBox(b.clientKey, {
                        h: Number.isFinite(v) ? v : 4,
                      })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  if (selectedKey === b.clientKey) setSelectedKey(null)
                  setBoxes((prev) =>
                    prev.filter((x) => x.clientKey !== b.clientKey),
                  )
                }}
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
