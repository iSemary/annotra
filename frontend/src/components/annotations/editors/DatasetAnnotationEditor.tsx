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
import { getMedia, type MediaRecord } from "@/lib/media"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type Box = {
  clientKey: string
  serverId?: string
  label: string
  memberMediaId: string
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
        member_media_id?: string
        bbox?: { x: number; y: number; w: number; h: number }
      }
      const b = p.bbox ?? { x: 0, y: 0, w: 40, h: 40 }
      return {
        clientKey: r.id,
        serverId: r.id,
        label: String(p.label ?? ""),
        memberMediaId: String(p.member_media_id ?? ""),
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
      }
    })
}

export function DatasetAnnotationEditor({ asset }: { asset: AnnotationAsset }) {
  const [members, setMembers] = useState<MediaRecord[]>([])
  const [selectedMember, setSelectedMember] = useState<string>("")
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
    let cancelled = false
    async function loadMembers() {
      try {
        const ids = asset.dataset_media_ids ?? []
        const rows = await Promise.all(ids.map((id) => getMedia(id)))
        if (!cancelled) {
          setMembers(rows)
          if (rows[0]) setSelectedMember(rows[0].id)
        }
      } catch {
        if (!cancelled) toast.error("Failed to load dataset images")
      }
    }
    loadMembers()
    return () => {
      cancelled = true
    }
  }, [asset.dataset_media_ids])

  const currentUrl = useMemo(() => {
    const m = members.find((x) => x.id === selectedMember)
    return m?.url ?? null
  }, [members, selectedMember])

  useEffect(() => {
    if (!currentUrl) {
      setImgEl(null)
      return
    }
    const im = new window.Image()
    im.crossOrigin = "anonymous"
    im.onload = () => {
      setNatural({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 })
      setImgEl(im)
    }
    im.onerror = () => toast.error("Could not load image")
    im.src = currentUrl
  }, [currentUrl])

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
        if (!b.memberMediaId) {
          toast.error("Each box needs a member image")
          setSaving(false)
          return
        }
        const payload = {
          label: b.label || "object",
          member_media_id: b.memberMediaId,
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
    if (!selectedMember) {
      toast.error("Select a dataset image first")
      return
    }
    const x = Math.max(0, natural.w / 2 - 40)
    const y = Math.max(0, natural.h / 2 - 30)
    setBoxes((prev) => [
      ...prev,
      {
        clientKey: `new-${Date.now()}`,
        label: "object",
        memberMediaId: selectedMember,
        x,
        y,
        w: 80,
        h: 60,
      },
    ])
  }

  const memberOpts = members.map((m) => ({
    value: m.id,
    label: `${m.id.slice(0, 8)}… (${m.kind})`,
  }))

  if (loading && members.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 max-w-md">
        <Label>Member image</Label>
        <Select
          options={memberOpts}
          value={selectedMember}
          onChange={setSelectedMember}
          aria-label="Dataset member"
        />
      </div>
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
                {boxes
                  .filter((b) => b.memberMediaId === selectedMember)
                  .map((b) => (
                    <Rect
                      key={b.clientKey}
                      x={b.x * scale}
                      y={b.y * scale}
                      width={b.w * scale}
                      height={b.h * scale}
                      stroke="#3b82f6"
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
                  <Label className="text-xs">Member</Label>
                  <Select
                    options={memberOpts}
                    value={b.memberMediaId}
                    onChange={(v) => updateBox(b.clientKey, { memberMediaId: v })}
                    aria-label="Box member"
                  />
                </div>
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
                    setBoxes((prev) =>
                      prev.filter((x) => x.clientKey !== b.clientKey),
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
