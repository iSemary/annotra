"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CirclePlus, Loader2, Pencil, Pause, Play, Trash2 } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableActionButton } from "@/components/ui/table-action-button"
import { useConfirm } from "@/components/ui/confirm-dialog"

type SegmentLabelDraft = {
  /** Set when editing an existing annotation */
  id?: string
  start: number
  end: number
  label: string
}

type WaveSegment = {
  id: string
  start: number
  end: number
  label: string
}

function regionLabel(region: {
  getContent?: (asHtml?: boolean) => string | HTMLElement | undefined
}): string {
  const raw = region.getContent?.(false)
  if (typeof raw === "string") {
    const text = raw.replace(/<[^>]*>/g, "").trim()
    return text || "segment"
  }
  if (raw instanceof HTMLElement) {
    const text = raw.textContent?.trim() ?? ""
    return text || "segment"
  }
  return "segment"
}

export function AudioAnnotationEditor({ asset }: { asset: AnnotationAsset }) {
  const url = asset.primary_media_url
  const { confirm } = useConfirm()
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(
    null,
  )
  const mapAnnRef = useRef<Map<string, string>>(new Map())
  const syncSegmentsRef = useRef<() => void>(() => {})

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [segments, setSegments] = useState<WaveSegment[]>([])
  const [segmentDraft, setSegmentDraft] = useState<SegmentLabelDraft | null>(
    null,
  )
  const [savingSegment, setSavingSegment] = useState(false)

  useEffect(() => {
    if (!url || !containerRef.current) return

    let cancelled = false
    mapAnnRef.current = new Map()
    wsRef.current = null
    regionsRef.current = null
    setStatus("loading")
    setPlaying(false)
    setDuration(0)
    setSegments([])

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      waveColor: "#64748b",
      progressColor: "#334155",
      height: 120,
    })
    wsRef.current = ws

    const regions = RegionsPlugin.create()
    regionsRef.current = regions
    ws.registerPlugin(regions)

    const syncSegmentsFromWave = () => {
      if (cancelled) return
      const r = regionsRef.current
      const w = wsRef.current
      if (!r || !w) return
      const dur = w.getDuration()
      if (!Number.isFinite(dur) || dur <= 0) return
      const rows: WaveSegment[] = r
        .getRegions()
        .filter((reg) => mapAnnRef.current.has(reg.id))
        .map((reg) => ({
          id: reg.id,
          start: reg.start,
          end: reg.end,
          label: regionLabel(reg),
        }))
        .sort((a, b) => a.start - b.start)
      setSegments(rows)
    }

    syncSegmentsRef.current = syncSegmentsFromWave

    ws.on("play", () => setPlaying(true))
    ws.on("pause", () => setPlaying(false))

    ws.on("ready", async () => {
      if (cancelled) return
      try {
        const rows = await listAnnotations(asset.id)
        const dur = ws.getDuration()
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur)
        }
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
          mapAnnRef.current.set(r.id, r.id)
        }
        syncSegmentsFromWave()
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

    regions.on("region-created", (region) => {
      const start = region.start
      const end = region.end
      region.remove()
      if (end <= start || cancelled) return
      setSegmentDraft({
        start,
        end,
        label: "",
      })
    })

    regions.on("region-updated", async (region) => {
      const annId = mapAnnRef.current.get(region.id)
      if (!annId || cancelled) return
      try {
        const label = regionLabel(region)
        await patchAnnotation(asset.id, annId, {
          annotation_kind: "audio_segment",
          payload: {
            start: region.start,
            end: region.end,
            label,
          },
        })
        syncSegmentsFromWave()
      } catch {
        toast.error("Could not update segment")
      }
    })

    regions.on("region-removed", async (region) => {
      const annId = mapAnnRef.current.get(region.id)
      if (!annId || cancelled) return
      mapAnnRef.current.delete(region.id)
      try {
        await deleteAnnotation(asset.id, annId)
        toast.success("Segment removed")
      } catch {
        toast.error("Could not delete segment")
      }
      syncSegmentsFromWave()
    })

    const disableDrag = regions.enableDragSelection({
      color: "rgba(34,197,94,0.2)",
    })

    return () => {
      cancelled = true
      disableDrag()
      ws.destroy()
      wsRef.current = null
      regionsRef.current = null
      syncSegmentsRef.current = () => {}
    }
  }, [url, asset.id])

  const togglePlay = useCallback(() => {
    wsRef.current?.playPause()
  }, [])

  const openPlayheadSegmentDraft = useCallback(() => {
    const ws = wsRef.current
    if (!ws || status !== "ready") return

    const dur = ws.getDuration()
    if (!Number.isFinite(dur) || dur <= 0) return

    let start = ws.getCurrentTime()
    let end = Math.min(start + 1, dur)
    if (end - start < 0.1) {
      start = Math.max(0, end - 1)
    }
    if (end <= start) return

    setSegmentDraft({ start, end, label: "" })
  }, [status])

  const openEditDraft = useCallback((s: WaveSegment) => {
    wsRef.current?.setTime(s.start)
    setSegmentDraft({
      id: s.id,
      start: s.start,
      end: s.end,
      label: s.label === "segment" ? "" : s.label,
    })
  }, [])

  const deleteSegment = useCallback(
    async (s: WaveSegment) => {
      const ok = await confirm({
        title: "Delete this segment?",
        description: `"${s.label}" (${s.start.toFixed(2)}s – ${s.end.toFixed(2)}s)`,
        variant: "destructive",
        confirmLabel: "Delete",
      })
      if (!ok) return
      const regions = regionsRef.current
      const reg = regions?.getRegions().find((r) => r.id === s.id)
      if (reg) {
        reg.remove()
        return
      }
      try {
        await deleteAnnotation(asset.id, s.id)
        mapAnnRef.current.delete(s.id)
        syncSegmentsRef.current()
        toast.success("Segment removed")
      } catch {
        toast.error("Could not delete segment")
      }
    },
    [asset.id, confirm],
  )

  const saveSegmentDraft = useCallback(async () => {
    if (!segmentDraft) return
    const regions = regionsRef.current
    if (!regions) return

    const { id, start, end, label } = segmentDraft
    const finalLabel = label.trim() || "segment"
    if (end <= start) {
      toast.error("Invalid time range")
      return
    }

    setSavingSegment(true)
    try {
      if (id) {
        await patchAnnotation(asset.id, id, {
          annotation_kind: "audio_segment",
          payload: { start, end, label: finalLabel },
        })
        const region = regions.getRegions().find((r) => r.id === id)
        region?.setOptions({
          start,
          end,
          content: finalLabel,
        })
        syncSegmentsRef.current()
        setSegmentDraft(null)
        toast.success("Annotation updated")
      } else {
        const row = await createAnnotation(asset.id, {
          annotation_kind: "audio_segment",
          payload: {
            start,
            end,
            label: finalLabel,
          },
        })
        regions.addRegion({
          id: row.id,
          start,
          end,
          color: "rgba(99,102,241,0.25)",
          content: finalLabel,
        })
        mapAnnRef.current.set(row.id, row.id)
        syncSegmentsRef.current()
        setSegmentDraft(null)
        toast.success("Annotation saved")
      }
    } catch {
      toast.error(id ? "Could not update segment" : "Could not save segment")
    } finally {
      setSavingSegment(false)
    }
  }, [asset.id, segmentDraft])

  if (!url) {
    return <p className="text-sm text-muted-foreground">No audio URL.</p>
  }

  const isEditDraft = Boolean(segmentDraft?.id)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={status !== "ready"}
          onClick={togglePlay}
        >
          {playing ? (
            <Pause className="h-4 w-4 mr-1" />
          ) : (
            <Play className="h-4 w-4 mr-1" />
          )}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={status !== "ready" || savingSegment}
          onClick={openPlayheadSegmentDraft}
        >
          <CirclePlus className="h-4 w-4 mr-1" />
          Add annotation
        </Button>
      </div>

      {status === "loading" && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="w-full shrink-0 space-y-2 rounded-md border bg-muted/20 p-2">
        <div ref={containerRef} className="w-full" />
        {status === "ready" && duration > 0 && (
          <>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Timeline (s)
              </p>
              <div className="relative h-7 w-full overflow-hidden rounded-sm border border-border bg-background/80">
                {segments.map((s) => {
                  const left = (s.start / duration) * 100
                  const w = Math.max(((s.end - s.start) / duration) * 100, 0.35)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="absolute top-0.5 bottom-0.5 rounded-sm bg-primary/35 ring-1 ring-primary/50 transition hover:bg-primary/50"
                      style={{ left: `${left}%`, width: `${w}%` }}
                      title={`${s.label}: ${s.start.toFixed(2)}s – ${s.end.toFixed(2)}s`}
                      onClick={() => openEditDraft(s)}
                    />
                  )
                })}
              </div>
              <div className="mt-0.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
                <span>0</span>
                <span>{duration.toFixed(2)}</span>
              </div>
            </div>

            <div className="max-h-[220px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[1%] whitespace-nowrap">
                      Start (s)
                    </TableHead>
                    <TableHead className="w-[1%] whitespace-nowrap">
                      End (s)
                    </TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead className="w-[1%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        No segments yet. Drag on the waveform or use Add
                        annotation.
                      </TableCell>
                    </TableRow>
                  ) : (
                    segments.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {s.start.toFixed(3)}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {s.end.toFixed(3)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {s.label}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            data-row-actions
                          >
                            <TableActionButton
                              label="Edit segment"
                              onClick={() => openEditDraft(s)}
                            >
                              <Pencil className="h-4 w-4" />
                            </TableActionButton>
                            <TableActionButton
                              label="Delete segment"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void deleteSegment(s)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </TableActionButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
      {status === "ready" && (
        <p className="text-xs text-muted-foreground">
          Drag on the waveform to select a range, or use <strong>Add annotation</strong>{" "}
          for a 1s window at the playhead — then set the label in the dialog. Resize
          regions on the wave to adjust times. Use the timeline and table below to
          jump to, edit, or delete segments.
        </p>
      )}

      <Dialog
        open={segmentDraft !== null}
        onOpenChange={(open) => {
          if (!open && !savingSegment) setSegmentDraft(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!savingSegment}>
          <DialogHeader>
            <DialogTitle>
              {isEditDraft ? "Edit audio segment" : "New audio segment"}
            </DialogTitle>
          </DialogHeader>
          {segmentDraft && (
            <div className="grid gap-4 py-2">
              {isEditDraft ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="audio-segment-start">Start (s)</Label>
                    <Input
                      id="audio-segment-start"
                      type="number"
                      step="0.001"
                      min={0}
                      max={duration || undefined}
                      value={segmentDraft.start}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        setSegmentDraft((d) =>
                          d
                            ? {
                                ...d,
                                start: Number.isFinite(v) ? v : d.start,
                              }
                            : null,
                        )
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="audio-segment-end">End (s)</Label>
                    <Input
                      id="audio-segment-end"
                      type="number"
                      step="0.001"
                      min={0}
                      max={duration || undefined}
                      value={segmentDraft.end}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        setSegmentDraft((d) =>
                          d
                            ? {
                                ...d,
                                end: Number.isFinite(v) ? v : d.end,
                              }
                            : null,
                        )
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm tabular-nums">
                  <div>
                    <span className="text-muted-foreground">start</span>{" "}
                    {Number(segmentDraft.start.toFixed(3))}
                  </div>
                  <div>
                    <span className="text-muted-foreground">end</span>{" "}
                    {Number(segmentDraft.end.toFixed(3))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="audio-segment-label">Label</Label>
                <Input
                  id="audio-segment-label"
                  autoFocus
                  placeholder="e.g. Hello"
                  value={segmentDraft.label}
                  onChange={(e) =>
                    setSegmentDraft((d) =>
                      d ? { ...d, label: e.target.value } : null,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void saveSegmentDraft()
                    }
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={savingSegment}
              onClick={() => setSegmentDraft(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingSegment}
              onClick={() => void saveSegmentDraft()}
            >
              {savingSegment && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditDraft ? "Save changes" : "Save segment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
