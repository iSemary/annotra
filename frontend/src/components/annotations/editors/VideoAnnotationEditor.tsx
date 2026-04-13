"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Scan,
  Trash2,
  X,
} from "lucide-react"
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
import { SecondsClockInput } from "@/components/ui/seconds-clock-input"
import { Textarea } from "@/components/ui/textarea"
import {
  formatTimeMmSs,
  formatTimeMmSsMmm,
  parseTimeToSeconds,
} from "@/lib/time-format"
import { cn } from "@/lib/utils"

const VIDEO_SKIP_SEC = 5

function finiteOr(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return v
}

type ContentRect = {
  offX: number
  offY: number
  dispW: number
  dispH: number
  natW: number
  natH: number
}

function computeVideoContentRect(
  video: HTMLVideoElement,
  container: HTMLElement,
): ContentRect | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null
  const cr = container.getBoundingClientRect()
  const ar = vw / vh
  const crAr = cr.width / cr.height
  let dispW: number
  let dispH: number
  let offX: number
  let offY: number
  if (crAr > ar) {
    dispH = cr.height
    dispW = cr.height * ar
    offX = (cr.width - dispW) / 2
    offY = 0
  } else {
    dispW = cr.width
    dispH = cr.width / ar
    offX = 0
    offY = (cr.height - dispH) / 2
  }
  return { offX, offY, dispW, dispH, natW: vw, natH: vh }
}

function frameIndexFromTime(
  t: number,
  videoDuration: number,
  asset: AnnotationAsset,
): number {
  const dur =
    Number.isFinite(videoDuration) && videoDuration > 0
      ? videoDuration
      : finiteOr(asset.duration_seconds, 0)
  const fc = asset.frame_count
  if (fc != null && fc > 0 && dur > 0) {
    const idx = Math.floor((t / dur) * fc)
    return Math.min(fc - 1, Math.max(0, idx))
  }
  return Math.max(0, Math.floor(t * 30))
}

/** Start time of frame index (seconds), inverse of linear frameIndexFromTime mapping. */
function frameToSecondsAtStart(
  frame: number,
  videoDuration: number,
  asset: AnnotationAsset,
): number {
  const dur =
    Number.isFinite(videoDuration) && videoDuration > 0
      ? videoDuration
      : finiteOr(asset.duration_seconds, 0)
  const fc = asset.frame_count
  if (fc != null && fc > 0 && dur > 0) {
    return Math.max(0, (Math.max(0, frame) / fc) * dur)
  }
  return Math.max(0, frame / 30)
}

function effectiveVideoDuration(
  videoEl: HTMLVideoElement | null,
  asset: AnnotationAsset,
): number {
  const fromEl =
    videoEl &&
    Number.isFinite(videoEl.duration) &&
    videoEl.duration > 0 &&
    !Number.isNaN(videoEl.duration)
      ? videoEl.duration
      : 0
  if (fromEl > 0) return fromEl
  return finiteOr(asset.duration_seconds, 0)
}

function readTimeWindow(payload: Record<string, unknown>): {
  fromSec: number | null
  toSec: number | null
} {
  const rawFrom = payload.from_sec
  const rawTo = payload.to_sec
  if (rawFrom == null || rawFrom === "") {
    return { fromSec: null, toSec: null }
  }
  const fromSec = Number(rawFrom)
  if (!Number.isFinite(fromSec)) {
    return { fromSec: null, toSec: null }
  }
  const toSec =
    rawTo != null && rawTo !== "" ? Number(rawTo) : fromSec
  if (!Number.isFinite(toSec)) {
    return { fromSec, toSec: fromSec }
  }
  const lo = Math.min(fromSec, toSec)
  const hi = Math.max(fromSec, toSec)
  return { fromSec: lo, toSec: hi }
}

/** Saved bbox: visible when current playback time is inside [from_sec, to_sec], else when frame matches playhead frame. */
function videoFrameBboxVisibleAtTime(
  payload: Record<string, unknown>,
  currentTime: number,
  currentFrame: number,
): boolean {
  const { fromSec, toSec } = readTimeWindow(payload)
  if (fromSec != null && toSec != null) {
    return currentTime >= fromSec && currentTime <= toSec
  }
  const f = finiteOr(payload.frame as number | undefined, -1)
  return f === currentFrame
}

/** End of `frame` in seconds (exclusive upper bound of that frame’s slice). */
function frameExclusiveEndSec(
  frame: number,
  videoDuration: number,
  asset: AnnotationAsset,
): number {
  const dur =
    Number.isFinite(videoDuration) && videoDuration > 0
      ? videoDuration
      : finiteOr(asset.duration_seconds, 0)
  const fc = asset.frame_count
  if (fc != null && fc > 0 && dur > 0) {
    const nextFrame = Math.min(frame + 1, fc)
    return Math.min(dur, (nextFrame / fc) * dur)
  }
  return (frame + 1) / 30
}

function videoTrackVisibleAtTime(
  keyFrames: { frame: number }[],
  currentTime: number,
  currentFrame: number,
  videoDuration: number,
  asset: AnnotationAsset,
): boolean {
  if (!keyFrames.length) return false
  const sorted = [...keyFrames].sort((a, b) => a.frame - b.frame)
  const lo = sorted[0].frame
  const hi = sorted[sorted.length - 1].frame
  if (!(videoDuration > 0)) {
    return currentFrame >= lo && currentFrame <= hi
  }
  const t0 = frameToSecondsAtStart(lo, videoDuration, asset)
  const t1 = frameExclusiveEndSec(hi, videoDuration, asset)
  return currentTime >= t0 && currentTime < t1
}

/** Start/end seconds on the asset timeline for list UI (requires positive duration). */
function annotationTimelineSegment(
  r: AnnotationRow,
  videoDuration: number,
  asset: AnnotationAsset,
): { startSec: number; endSec: number } | null {
  if (!(videoDuration > 0)) return null

  if (r.annotation_kind === "video_frame_bbox") {
    const p = r.payload as Record<string, unknown>
    const tw = readTimeWindow(p)
    if (tw.fromSec != null && tw.toSec != null) {
      const lo = Math.max(0, tw.fromSec)
      const hi = Math.min(videoDuration, Math.max(tw.toSec, lo + 1e-6))
      return { startSec: lo, endSec: hi }
    }
    const f = finiteOr(p.frame as number | undefined, 0)
    const t0 = frameToSecondsAtStart(f, videoDuration, asset)
    const t1 = Math.min(videoDuration, frameExclusiveEndSec(f, videoDuration, asset))
    return {
      startSec: t0,
      endSec: Math.max(t1, t0 + 1 / 30),
    }
  }

  if (r.annotation_kind === "video_track") {
    const p = r.payload as { frames?: { frame: number }[] }
    const frames = p.frames ?? []
    if (!frames.length) return null
    const sorted = [...frames].sort((a, b) => a.frame - b.frame)
    const lo = sorted[0].frame
    const hi = sorted[sorted.length - 1].frame
    const t0 = frameToSecondsAtStart(lo, videoDuration, asset)
    const t1 = Math.min(videoDuration, frameExclusiveEndSec(hi, videoDuration, asset))
    return { startSec: t0, endSec: Math.max(t1, t0 + 1e-6) }
  }

  return null
}

function annotationListTitle(r: AnnotationRow): string {
  const p = r.payload as Record<string, unknown>
  if (typeof p.label === "string" && p.label.trim()) return p.label.trim()
  if (typeof p.object_id === "string" && p.object_id.trim())
    return p.object_id.trim()
  return r.annotation_kind.replace(/_/g, " ")
}

function annotationKindStyles(kind: string): {
  bar: string
  badge: string
  glow: string
} {
  if (kind === "video_frame_bbox") {
    return {
      bar: "from-sky-400 to-cyan-500",
      badge:
        "border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-100",
      glow: "shadow-[0_0_12px_rgba(56,189,248,0.25)]",
    }
  }
  if (kind === "video_track") {
    return {
      bar: "from-violet-400 to-fuchsia-500",
      badge:
        "border-violet-500/40 bg-violet-500/15 text-violet-900 dark:text-violet-100",
      glow: "shadow-[0_0_12px_rgba(167,139,250,0.25)]",
    }
  }
  return {
    bar: "from-amber-400 to-orange-500",
    badge:
      "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100",
    glow: "shadow-[0_0_10px_rgba(251,191,36,0.2)]",
  }
}

function trackOverlayAtFrame(
  frames: { frame: number; x: number; y: number }[],
  frame: number,
  w?: number,
  h?: number,
): { x: number; y: number; w?: number; h?: number } | null {
  if (!frames.length) return null
  const sorted = [...frames].sort((a, b) => a.frame - b.frame)
  if (frame <= sorted[0].frame) {
    return { x: sorted[0].x, y: sorted[0].y, w, h }
  }
  const last = sorted[sorted.length - 1]
  if (frame >= last.frame) {
    return { x: last.x, y: last.y, w, h }
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (frame >= a.frame && frame <= b.frame) {
      const span = b.frame - a.frame
      const u = span <= 0 ? 0 : (frame - a.frame) / span
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        w,
        h,
      }
    }
  }
  return null
}

function clampNatBox(
  x: number,
  y: number,
  w: number,
  h: number,
  natW: number,
  natH: number,
) {
  const ww = Math.max(4, Math.min(w, natW))
  const hh = Math.max(4, Math.min(h, natH))
  const xx = Math.max(0, Math.min(x, natW - ww))
  const yy = Math.max(0, Math.min(y, natH - hh))
  return { x: xx, y: yy, w: ww, h: hh }
}

export function VideoAnnotationEditor({ asset }: { asset: AnnotationAsset }) {
  const url = asset.primary_media_url
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [rows, setRows] = useState<AnnotationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [contentRect, setContentRect] = useState<ContentRect | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [currentVideoTime, setCurrentVideoTime] = useState(0)
  /** High-frequency time while playing (for ms timecode); paused/scrub uses `currentVideoTime`. */
  const [livePlaybackTime, setLivePlaybackTime] = useState(0)
  const [drawOnVideo, setDrawOnVideo] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    curX: number
    curY: number
  } | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  const [fbFrame, setFbFrame] = useState("0")
  const [fbFromSec, setFbFromSec] = useState("")
  const [fbToSec, setFbToSec] = useState("")
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

  const [editingFrameBboxId, setEditingFrameBboxId] = useState<string | null>(
    null,
  )
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)

  const measure = useCallback(() => {
    const v = videoRef.current
    const c = containerRef.current
    if (!v || !c) return
    setContentRect(computeVideoContentRect(v, c))
  }, [])

  useLayoutEffect(() => {
    measure()
    const c = containerRef.current
    if (!c || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(c)
    return () => ro.disconnect()
  }, [measure])

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

  useEffect(() => {
    if (!videoPlaying) return
    const el = videoRef.current
    if (el && Number.isFinite(el.currentTime)) {
      setLivePlaybackTime(el.currentTime)
    }
    let id = 0
    const loop = () => {
      const v = videoRef.current
      if (v && Number.isFinite(v.currentTime)) {
        setLivePlaybackTime(v.currentTime)
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [videoPlaying])

  function buildVideoFrameBboxTiming():
    | { ok: false; message: string }
    | { ok: true; frame: number; clearTimeWindow: true }
    | {
        ok: true
        frame: number
        clearTimeWindow: false
        from_sec: number
        to_sec: number
      } {
    const dur = effectiveVideoDuration(videoRef.current, asset)
    const fromTrim = fbFromSec.trim()
    if (fromTrim !== "") {
      const fromSec = parseTimeToSeconds(fromTrim)
      const toTrim = fbToSec.trim()
      const toParsed = toTrim === "" ? fromSec : parseTimeToSeconds(toTrim)
      if (fromSec === null || fromSec < 0) {
        return { ok: false, message: "Invalid From (use MM:SS or seconds)" }
      }
      const toSec = toParsed
      if (toSec === null || toSec < 0) {
        return { ok: false, message: "Invalid To (use MM:SS or seconds)" }
      }
      if (!(dur > 0)) {
        return {
          ok: false,
          message:
            "Need video duration (wait for load or set asset duration / frame count)",
        }
      }
      const lo = Math.min(fromSec, toSec)
      const hi = Math.max(fromSec, toSec)
      const frame = frameIndexFromTime(lo, dur, asset)
      return {
        ok: true,
        frame,
        clearTimeWindow: false,
        from_sec: lo,
        to_sec: hi,
      }
    }
    const f = parseInt(fbFrame, 10)
    if (!Number.isFinite(f) || f < 0) {
      return { ok: false, message: "Invalid frame" }
    }
    return { ok: true, frame: f, clearTimeWindow: true }
  }

  async function addFrameBox() {
    try {
      const bbox = {
        x: parseFloat(fbX),
        y: parseFloat(fbY),
        w: parseFloat(fbW),
        h: parseFloat(fbH),
      }
      if (
        ![bbox.x, bbox.y, bbox.w, bbox.h].every(Number.isFinite) ||
        bbox.w <= 0 ||
        bbox.h <= 0
      ) {
        toast.error("Invalid bbox (w and h must be positive)")
        return
      }

      const resolved = buildVideoFrameBboxTiming()
      if (!resolved.ok) {
        toast.error(resolved.message)
        return
      }
      const payload: Record<string, unknown> = {
        frame: resolved.frame,
        label: fbLabel,
        bbox,
      }
      if (!resolved.clearTimeWindow) {
        payload.from_sec = resolved.from_sec
        payload.to_sec = resolved.to_sec
      }

      await createAnnotation(asset.id, {
        annotation_kind: "video_frame_bbox",
        payload,
      })
      toast.success("Added")
      setFbFrame(String(resolved.frame))
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

  async function saveFrameBboxEdit() {
    const id = editingFrameBboxId
    if (!id) return
    try {
      const bbox = {
        x: parseFloat(fbX),
        y: parseFloat(fbY),
        w: parseFloat(fbW),
        h: parseFloat(fbH),
      }
      if (
        ![bbox.x, bbox.y, bbox.w, bbox.h].every(Number.isFinite) ||
        bbox.w <= 0 ||
        bbox.h <= 0
      ) {
        toast.error("Invalid bbox (w and h must be positive)")
        return
      }
      const label = fbLabel.trim()
      if (!label) {
        toast.error("Label is required")
        return
      }
      const resolved = buildVideoFrameBboxTiming()
      if (!resolved.ok) {
        toast.error(resolved.message)
        return
      }
      const payload: Record<string, unknown> = {
        frame: resolved.frame,
        label,
        bbox,
      }
      if (resolved.clearTimeWindow) {
        payload.from_sec = null
        payload.to_sec = null
      } else {
        payload.from_sec = resolved.from_sec
        payload.to_sec = resolved.to_sec
      }

      await patchAnnotation(asset.id, id, {
        annotation_kind: "video_frame_bbox",
        payload,
      })
      toast.success("Saved")
      setEditingFrameBboxId(null)
      setFbFrame(String(resolved.frame))
      reload()
    } catch {
      toast.error("Save failed")
    }
  }

  async function saveTrackEdit() {
    const id = editingTrackId
    if (!id) return
    try {
      const frames = JSON.parse(trFramesJson) as {
        frame: number
        x: number
        y: number
      }[]
      const payload: Record<string, unknown> = {
        object_id: trId.trim(),
        label: trLabel.trim(),
        frames,
      }
      if (!payload.object_id || !payload.label) {
        toast.error("object_id and label are required")
        return
      }
      if (trW.trim()) payload.w = parseFloat(trW)
      if (trH.trim()) payload.h = parseFloat(trH)
      await patchAnnotation(asset.id, id, {
        annotation_kind: "video_track",
        payload,
      })
      toast.success("Saved")
      setEditingTrackId(null)
      reload()
    } catch {
      toast.error("Invalid track JSON or save failed")
    }
  }

  function beginEditRow(r: AnnotationRow) {
    if (r.annotation_kind === "video_frame_bbox") {
      setEditingTrackId(null)
      setEditingFrameBboxId(r.id)
      const p = r.payload as {
        frame?: number
        label?: string
        bbox?: { x: number; y: number; w: number; h: number }
        from_sec?: unknown
        to_sec?: unknown
      }
      const frameNum = finiteOr(p.frame, 0)
      setFbFrame(String(frameNum))
      setFbLabel(String(p.label ?? "object"))
      const tw = readTimeWindow(p as Record<string, unknown>)
      if (tw.fromSec != null && tw.toSec != null) {
        setFbFromSec(formatTimeMmSs(tw.fromSec))
        setFbToSec(formatTimeMmSs(tw.toSec))
      } else {
        setFbFromSec("")
        setFbToSec("")
      }
      const b = p.bbox ?? { x: 0, y: 0, w: 80, h: 60 }
      setFbX(String(b.x))
      setFbY(String(b.y))
      setFbW(String(b.w))
      setFbH(String(b.h))
      return
    }
    if (r.annotation_kind === "video_track") {
      setEditingFrameBboxId(null)
      setEditingTrackId(r.id)
      const p = r.payload as {
        object_id?: string
        label?: string
        w?: number
        h?: number
        frames?: { frame: number; x: number; y: number }[]
      }
      setTrId(String(p.object_id ?? ""))
      setTrLabel(String(p.label ?? ""))
      setTrW(p.w != null && Number.isFinite(p.w) ? String(p.w) : "")
      setTrH(p.h != null && Number.isFinite(p.h) ? String(p.h) : "")
      setTrFramesJson(JSON.stringify(p.frames ?? [], null, 2))
    }
  }

  async function removeRow(id: string) {
    try {
      await deleteAnnotation(asset.id, id)
      if (editingFrameBboxId === id) setEditingFrameBboxId(null)
      if (editingTrackId === id) setEditingTrackId(null)
      toast.success("Removed")
      reload()
    } catch {
      toast.error("Delete failed")
    }
  }

  function toggleVideoPlay() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  function replayVideo() {
    const el = videoRef.current
    if (!el) return
    el.currentTime = 0
    void el.play().catch(() => {
      /* autoplay may be blocked; seek still applied */
    })
  }

  function skipVideoBy(seconds: number) {
    const el = videoRef.current
    if (!el) return
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0
    const t = el.currentTime
    const next =
      dur > 0
        ? Math.min(dur, Math.max(0, t + seconds))
        : Math.max(0, t + seconds)
    el.currentTime = next
  }

  function syncFrameFromPlayhead() {
    setFbFrame(String(currentFrame))
    const dur = effectiveVideoDuration(videoRef.current, asset)
    if (dur > 0) {
      const t = frameToSecondsAtStart(currentFrame, dur, asset)
      const s = formatTimeMmSs(t)
      setFbFromSec(s)
      setFbToSec(s)
    }
  }

  function syncSecondsFromPlayhead() {
    const el = videoRef.current
    if (!el) return
    const t = el.currentTime
    if (!Number.isFinite(t) || t < 0) return
    const s = formatTimeMmSs(t)
    setFbFromSec(s)
    setFbToSec(s)
    const dur = effectiveVideoDuration(el, asset)
    if (dur > 0) {
      setFbFrame(String(frameIndexFromTime(t, dur, asset)))
    }
  }

  function onVideoTime() {
    const el = videoRef.current
    if (!el) return
    const dur = el.duration
    const t = el.currentTime
    if (Number.isFinite(t) && t >= 0) {
      setCurrentVideoTime(t)
      setLivePlaybackTime(t)
    }
    setCurrentFrame(frameIndexFromTime(t, dur, asset))
    measure()
  }

  function displayToNat(dx: number, dy: number, cr: ContentRect) {
    return {
      x: (dx / cr.dispW) * cr.natW,
      y: (dy / cr.dispH) * cr.natH,
    }
  }

  function onOverlayPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawOnVideo || !contentRect) return
    e.preventDefault()
    const el = overlayRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    const { x, y } = displayToNat(dx, dy, contentRect)
    dragRef.current = { startX: x, startY: y, curX: x, curY: y }
    setDragPreview({ x, y, w: 0, h: 0 })
  }

  function onOverlayPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || !contentRect) return
    const el = overlayRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    const { x: cx, y: cy } = displayToNat(dx, dy, contentRect)
    d.curX = cx
    d.curY = cy
    const x1 = Math.min(d.startX, d.curX)
    const y1 = Math.min(d.startY, d.curY)
    const w = Math.abs(d.curX - d.startX)
    const h = Math.abs(d.curY - d.startY)
    setDragPreview({ x: x1, y: y1, w, h })
  }

  function onOverlayPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    dragRef.current = null
    if (!drawOnVideo || !contentRect || !d) {
      setDragPreview(null)
      return
    }
    try {
      overlayRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const x1 = Math.min(d.startX, d.curX)
    const y1 = Math.min(d.startY, d.curY)
    let w = Math.abs(d.curX - d.startX)
    let h = Math.abs(d.curY - d.startY)
    if (w < 4 || h < 4) {
      setDragPreview(null)
      return
    }
    const c = clampNatBox(x1, y1, w, h, contentRect.natW, contentRect.natH)
    const el = videoRef.current
    const dur = effectiveVideoDuration(el, asset)
    const t =
      el && Number.isFinite(el.currentTime) && el.currentTime >= 0
        ? el.currentTime
        : currentVideoTime
    if (dur > 0) {
      setFbFrame(String(frameIndexFromTime(t, dur, asset)))
    } else {
      setFbFrame(String(currentFrame))
    }
    const t1 = Math.max(0, t)
    const t2 = t1 + 0.1
    setFbFromSec(formatTimeMmSsMmm(t1))
    setFbToSec(formatTimeMmSsMmm(t2))
    setFbX(String(Math.round(c.x * 100) / 100))
    setFbY(String(Math.round(c.y * 100) / 100))
    setFbW(String(Math.round(c.w * 100) / 100))
    setFbH(String(Math.round(c.h * 100) / 100))
    setDragPreview(null)
    setDrawOnVideo(false)
    toast.success("Box drawn — review values and click Add annotation")
  }

  const videoDuration = effectiveVideoDuration(videoRef.current, asset)
  const useSecondsForRange = fbFromSec.trim() !== ""
  const previewFrameMatches = (() => {
    if (useSecondsForRange) {
      const fromSec = parseTimeToSeconds(fbFromSec)
      const toParsed =
        fbToSec.trim() === "" ? fromSec : parseTimeToSeconds(fbToSec)
      const toSec = toParsed
      if (fromSec === null || toSec === null) return false
      const lo = Math.min(fromSec, toSec)
      const hi = Math.max(fromSec, toSec)
      return currentVideoTime >= lo && currentVideoTime <= hi
    }
    const formFrameParsed = parseInt(fbFrame, 10)
    return Number.isFinite(formFrameParsed) && formFrameParsed === currentFrame
  })()
  const rawFbW = parseFloat(fbW)
  const rawFbH = parseFloat(fbH)
  const previewBbox =
    previewFrameMatches &&
    contentRect &&
    Number.isFinite(rawFbW) &&
    Number.isFinite(rawFbH) &&
    rawFbW > 0 &&
    rawFbH > 0
      ? clampNatBox(
          finiteOr(parseFloat(fbX), 0),
          finiteOr(parseFloat(fbY), 0),
          rawFbW,
          rawFbH,
          contentRect.natW,
          contentRect.natH,
        )
      : null

  const frameBboxes = rows.filter((r) => {
    if (r.annotation_kind !== "video_frame_bbox") return false
    return videoFrameBboxVisibleAtTime(
      r.payload as Record<string, unknown>,
      currentVideoTime,
      currentFrame,
    )
  })

  const trackOverlays = rows
    .filter((r) => r.annotation_kind === "video_track")
    .map((r) => {
      const p = r.payload as {
        frames?: { frame: number; x: number; y: number }[]
        w?: number
        h?: number
        label?: string
        object_id?: string
      }
      const frames = Array.isArray(p.frames) ? p.frames : []
      if (
        !videoTrackVisibleAtTime(
          frames,
          currentVideoTime,
          currentFrame,
          videoDuration,
          asset,
        )
      ) {
        return null
      }
      const st = trackOverlayAtFrame(frames, currentFrame, p.w, p.h)
      return { id: r.id, label: String(p.label ?? p.object_id ?? "track"), st }
    })
    .filter((o) => o !== null && o.st !== null) as {
    id: string
    label: string
    st: { x: number; y: number; w?: number; h?: number }
  }[]

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid min-h-0 min-w-0 w-full max-w-full flex-1 gap-8 lg:grid-cols-2 lg:items-start">
      <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3">
        {url ? (
          <>
            <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleVideoPlay}
                disabled={drawOnVideo}
              >
                {videoPlaying ? (
                  <Pause className="h-4 w-4 mr-1" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                {videoPlaying ? "Pause" : "Play"}
              </Button>
              <Button
                type="button"
                variant={drawOnVideo ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setDrawOnVideo((v) => !v)
                  setDragPreview(null)
                  dragRef.current = null
                }}
              >
                {drawOnVideo ? (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    Cancel draw
                  </>
                ) : (
                  <>
                    <Scan className="h-4 w-4 mr-1" />
                    Draw on video
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={syncFrameFromPlayhead}
              >
                Use current frame
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={syncSecondsFromPlayhead}
              >
                Use current time (s)
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className="font-mono text-foreground"
                  title={
                    videoPlaying
                      ? "Current playback time (ms)"
                      : "Current time (ms)"
                  }
                >
                  {formatTimeMmSsMmm(
                    videoPlaying ? livePlaybackTime : currentVideoTime,
                  )}
                </span>
                <span>Frame {currentFrame}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={drawOnVideo}
                onClick={replayVideo}
                aria-label="Replay from start"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Replay
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={drawOnVideo}
                onClick={() => skipVideoBy(-VIDEO_SKIP_SEC)}
                aria-label={`Back ${VIDEO_SKIP_SEC} seconds`}
              >
                <ChevronsLeft className="h-4 w-4 mr-1" />
                −{VIDEO_SKIP_SEC}s
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={drawOnVideo}
                onClick={() => skipVideoBy(VIDEO_SKIP_SEC)}
                aria-label={`Forward ${VIDEO_SKIP_SEC} seconds`}
              >
                +{VIDEO_SKIP_SEC}s
                <ChevronsRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            </div>
            {drawOnVideo && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Drag on the video to draw a box. Use Play/Pause and transport
                controls above to move the playhead.
              </p>
            )}
            <div
              ref={containerRef}
              className="relative w-full max-h-[360px] min-h-[120px] rounded-md border bg-black overflow-hidden flex items-center justify-center"
            >
              <video
                ref={videoRef}
                src={url}
                className="max-h-[360px] w-full h-auto max-w-full object-contain pointer-events-auto"
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onLoadedMetadata={() => {
                  measure()
                  onVideoTime()
                }}
                onTimeUpdate={onVideoTime}
              />
              {contentRect && (
                <div
                  className="absolute z-10"
                  style={{
                    left: contentRect.offX,
                    top: contentRect.offY,
                    width: contentRect.dispW,
                    height: contentRect.dispH,
                  }}
                >
                  <div
                    ref={overlayRef}
                    className={cn(
                      "relative h-full w-full",
                      drawOnVideo && "cursor-crosshair",
                    )}
                    style={{
                      pointerEvents: drawOnVideo ? "auto" : "none",
                    }}
                    onPointerDown={onOverlayPointerDown}
                    onPointerMove={onOverlayPointerMove}
                    onPointerUp={onOverlayPointerUp}
                    onPointerCancel={onOverlayPointerUp}
                  >
                    {frameBboxes.map((r) => {
                      const p = r.payload as {
                        label?: string
                        bbox?: { x: number; y: number; w: number; h: number }
                      }
                      const b = p.bbox ?? { x: 0, y: 0, w: 0, h: 0 }
                      const nw = contentRect.natW
                      const nh = contentRect.natH
                      return (
                        <div
                          key={r.id}
                          className="absolute border-2 border-sky-400 bg-sky-400/15 shadow-sm"
                          style={{
                            left: `${(finiteOr(b.x, 0) / nw) * 100}%`,
                            top: `${(finiteOr(b.y, 0) / nh) * 100}%`,
                            width: `${(finiteOr(b.w, 0) / nw) * 100}%`,
                            height: `${(finiteOr(b.h, 0) / nh) * 100}%`,
                          }}
                        >
                          <span className="absolute -top-6 left-0 max-w-[140px] truncate rounded bg-background/95 px-1 text-[10px] font-medium text-foreground shadow">
                            {String(p.label ?? "")}
                          </span>
                        </div>
                      )
                    })}
                    {trackOverlays.map(({ id, label, st }) => {
                      const nw = contentRect.natW
                      const nh = contentRect.natH
                      if (st.w != null && st.h != null) {
                        return (
                          <div
                            key={id}
                            className="absolute border-2 border-violet-400 bg-violet-400/15"
                            style={{
                              left: `${(st.x / nw) * 100}%`,
                              top: `${(st.y / nh) * 100}%`,
                              width: `${(st.w / nw) * 100}%`,
                              height: `${(st.h / nh) * 100}%`,
                            }}
                          >
                            <span className="absolute -top-6 left-0 max-w-[140px] truncate rounded bg-background/95 px-1 text-[10px] font-medium shadow">
                              {label}
                            </span>
                          </div>
                        )
                      }
                      const dot = 10
                      const px = (st.x / nw) * 100
                      const py = (st.y / nh) * 100
                      return (
                        <div
                          key={id}
                          className="absolute pointer-events-none"
                          style={{
                            left: `calc(${px}% - ${dot / 2}px)`,
                            top: `calc(${py}% - ${dot / 2}px)`,
                            width: dot,
                            height: dot,
                            borderRadius: 9999,
                            background: "rgb(167 139 250)",
                            boxShadow: "0 0 0 2px rgb(24 24 27)",
                          }}
                          title={label}
                        />
                      )
                    })}
                    {previewBbox && (
                        <div
                          className="absolute border-2 border-dashed border-amber-400/90 bg-amber-400/10"
                          style={{
                            left: `${(previewBbox.x / contentRect.natW) * 100}%`,
                            top: `${(previewBbox.y / contentRect.natH) * 100}%`,
                            width: `${(previewBbox.w / contentRect.natW) * 100}%`,
                            height: `${(previewBbox.h / contentRect.natH) * 100}%`,
                          }}
                        >
                          <span className="absolute -top-6 left-0 rounded bg-amber-500/90 px-1 text-[10px] font-medium text-amber-950">
                            {fbLabel || "Preview"}
                          </span>
                        </div>
                      )}
                    {dragPreview &&
                      dragPreview.w > 1 &&
                      dragPreview.h > 1 && (
                        <div
                          className="absolute border-2 border-primary bg-primary/20"
                          style={{
                            left: `${(dragPreview.x / contentRect.natW) * 100}%`,
                            top: `${(dragPreview.y / contentRect.natH) * 100}%`,
                            width: `${(dragPreview.w / contentRect.natW) * 100}%`,
                            height: `${(dragPreview.h / contentRect.natH) * 100}%`,
                          }}
                        />
                      )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No video URL.</p>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-2 max-h-[min(280px,40vh)] lg:max-h-none">
          <h3 className="text-sm font-semibold tracking-tight text-foreground shrink-0">
            Annotations List
          </h3>
          <ul className="min-h-0 flex-1 space-y-3 overflow-auto rounded-xl border border-border/80 bg-linear-to-b from-card/80 to-muted/20 p-3 shadow-inner">
            {rows.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">
                No annotations yet.
              </li>
            ) : (
              rows.map((r) => {
                const styles = annotationKindStyles(r.annotation_kind)
                const seg = annotationTimelineSegment(
                  r,
                  videoDuration,
                  asset,
                )
                const dur = videoDuration
                const playheadPct =
                  dur > 0
                    ? Math.min(
                        100,
                        Math.max(0, (currentVideoTime / dur) * 100),
                      )
                    : 0
                let leftPct = 0
                let widthPct = 100
                if (seg && dur > 0) {
                  leftPct = Math.min(
                    100,
                    Math.max(0, (seg.startSec / dur) * 100),
                  )
                  widthPct = Math.min(
                    100 - leftPct,
                    Math.max(
                      0.35,
                      ((seg.endSec - seg.startSec) / dur) * 100,
                    ),
                  )
                }
                const timeLabel =
                  seg && dur > 0
                    ? `${formatTimeMmSsMmm(seg.startSec)} → ${formatTimeMmSsMmm(seg.endSec)}`
                    : dur > 0
                      ? "Timeline unavailable for this type"
                      : "Set duration or load video for timeline"

                return (
                  <li
                    key={r.id}
                    className={cn(
                      "group rounded-xl border border-border/60 bg-card/90 p-3 shadow-sm backdrop-blur-sm transition-[box-shadow,transform] hover:shadow-md",
                      styles.glow,
                      (editingFrameBboxId === r.id ||
                        editingTrackId === r.id) &&
                        "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              styles.badge,
                            )}
                          >
                            {r.annotation_kind.replace(/_/g, " ")}
                          </span>
                          <span className="truncate text-sm font-medium text-foreground">
                            {annotationListTitle(r)}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] leading-relaxed text-muted-foreground break-all line-clamp-2">
                          {JSON.stringify(r.payload)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-0.5 opacity-90 group-hover:opacity-100">
                        {(r.annotation_kind === "video_frame_bbox" ||
                          r.annotation_kind === "video_track") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Edit annotation"
                            onClick={() => beginEditRow(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label="Delete annotation"
                          onClick={() => removeRow(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="uppercase tracking-wide">
                          Timeline
                        </span>
                        <span className="font-mono tabular-nums">{timeLabel}</span>
                      </div>
                      <div
                        className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/50"
                        title={
                          dur > 0
                            ? `Video ${formatTimeMmSsMmm(0)} – ${formatTimeMmSsMmm(dur)}`
                            : undefined
                        }
                      >
                        {seg && dur > 0 ? (
                          <div
                            className={cn(
                              "absolute top-0 h-full rounded-full bg-linear-to-r opacity-90",
                              styles.bar,
                            )}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              minWidth: 3,
                            }}
                          />
                        ) : (
                          <div className="pointer-events-none absolute inset-x-2 top-1/2 h-0 -translate-y-1/2 border-t border-dashed border-muted-foreground/35" />
                        )}
                        {dur > 0 && (
                          <div
                            className="pointer-events-none absolute top-0 z-1 h-full w-0.5 rounded-full bg-primary"
                            style={{
                              left: `${playheadPct}%`,
                              transform: "translateX(-50%)",
                            }}
                            aria-hidden
                          />
                        )}
                      </div>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      </div>
      <div className="space-y-8">
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">Frame bounding box</h3>
          <p className="text-xs text-muted-foreground">
            If <span className="font-medium text-foreground">From (s)</span> is
            set, the bbox is stored with a <span className="font-medium text-foreground">time window</span>{" "}
            (inclusive seconds) and shown only while playback is inside it;
            <span className="font-medium text-foreground"> Frame</span> is the
            reference index (range start). Leave From empty for a single-frame
            bbox (visible when the playhead frame matches).
            {editingFrameBboxId && (
              <>
                {" "}
                <span className="font-medium text-foreground">Editing</span>:
                clear From/To and save to remove the time window.
              </>
            )}
          </p>
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
              <Label className="text-xs">From (s)</Label>
              <SecondsClockInput
                value={fbFromSec}
                onChange={setFbFromSec}
                placeholder="optional"
                aria-label="From seconds"
              />
            </div>
            <div>
              <Label className="text-xs">To (s)</Label>
              <SecondsClockInput
                value={fbToSec}
                onChange={setFbToSec}
                placeholder="defaults to From"
                aria-label="To seconds"
              />
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                editingFrameBboxId
                  ? void saveFrameBboxEdit()
                  : void addFrameBox()
              }
            >
              {editingFrameBboxId ? (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save changes
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Add annotation
                </>
              )}
            </Button>
            {editingFrameBboxId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingFrameBboxId(null)}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">Moving object track</h3>
          {editingTrackId && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Editing selected track
              </span>
              — adjust fields and save, or cancel.
            </p>
          )}
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                editingTrackId ? void saveTrackEdit() : void addTrack()
              }
            >
              {editingTrackId ? (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save changes
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Add track annotation
                </>
              )}
            </Button>
            {editingTrackId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingTrackId(null)}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
