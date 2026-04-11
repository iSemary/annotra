import api, {
  DEFAULT_PAGE_SIZE,
  type PaginationMeta,
  readResponsePagination,
} from "./api"

export type AnnotationFileType =
  | "image"
  | "video"
  | "audio"
  | "dataset"
  | "model_3d"
export type AnnotationAssetStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "reviewed"
  | "failed"

/** Tailwind classes for status pills (use with `Badge variant="outline"`). */
export function annotationStatusBadgeClassName(
  status: AnnotationAssetStatus | string,
): string {
  const map: Record<string, string> = {
    draft:
      "border-slate-400/90 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800/90 dark:text-slate-100",
    in_progress:
      "border-amber-500/90 bg-amber-100 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100",
    completed:
      "border-emerald-600/90 bg-emerald-100 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-100",
    reviewed:
      "border-violet-600/90 bg-violet-100 text-violet-950 dark:border-violet-600 dark:bg-violet-950/45 dark:text-violet-100",
    failed:
      "border-red-600/90 bg-red-100 text-red-950 dark:border-red-600 dark:bg-red-950/45 dark:text-red-100",
  }
  return (
    map[status] ??
    "border-border bg-muted text-foreground dark:bg-muted/80"
  )
}

export interface DatasetSize {
  value: number | null
  unit: string
}

export interface AnnotationAsset {
  id: string
  project_id: string
  project_name?: string | null
  file_type: AnnotationFileType
  title: string
  status: AnnotationAssetStatus
  primary_media_id: string | null
  primary_media_url: string | null
  /** Primary file size, or total bytes of dataset member files. */
  file_size_bytes?: number | null
  frame_count: number | null
  duration_seconds: number | null
  annotations_count: number
  dataset_size: DatasetSize
  dataset_media_ids: string[]
  created_at: string
  updated_at: string
}

/** Format stored byte size for tables (1 KiB = 1024 B). */
export function formatFileSizeKb(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "—"
  if (bytes === 0) return "0 KB"
  const kb = bytes / 1024
  if (kb < 100) {
    const s = kb.toFixed(1)
    return `${s.endsWith(".0") ? s.slice(0, -2) : s} KB`
  }
  return `${Math.round(kb)} KB`
}

export interface AnnotationRow {
  id: string
  annotation_kind: string
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ListAnnotationAssetsParams {
  /** Omit to list assets across all company projects. */
  project_id?: string
  page?: number
  per_page?: number
  search?: string
  status?: string
  file_type?: AnnotationFileType | ""
  sort_by?: "annotations_count" | "updated_at" | "progress"
  sort_dir?: "asc" | "desc"
}

export async function listAnnotationAssets(
  params: ListAnnotationAssetsParams,
): Promise<{ items: AnnotationAsset[]; pagination: PaginationMeta | null }> {
  const search = new URLSearchParams()
  if (params.project_id) search.set("project_id", params.project_id)
  search.set("page", String(params.page ?? 1))
  search.set("per_page", String(params.per_page ?? DEFAULT_PAGE_SIZE))
  if (params.search?.trim()) search.set("search", params.search.trim())
  if (params.status?.trim()) search.set("status", params.status.trim())
  if (params.file_type) search.set("file_type", params.file_type)
  if (params.sort_by) search.set("sort_by", params.sort_by)
  if (params.sort_dir) search.set("sort_dir", params.sort_dir)
  const r = await api.get<{ items: AnnotationAsset[] }>(
    `/annotation-assets?${search.toString()}`,
  )
  return {
    items: (r.data as { items: AnnotationAsset[] }).items ?? [],
    pagination: readResponsePagination(r),
  }
}

export interface CreateAnnotationAssetBody {
  project_id: string
  file_type: AnnotationFileType
  /** Omit or leave empty for a default like "Image #1". */
  title?: string
  status?: AnnotationAssetStatus
  primary_media_id?: string | null
  dataset_media_ids?: string[]
  frame_count?: number | null
  duration_seconds?: number | null
}

export async function createAnnotationAsset(
  body: CreateAnnotationAssetBody,
): Promise<AnnotationAsset> {
  const r = await api.post<AnnotationAsset>("/annotation-assets", body)
  return r.data as AnnotationAsset
}

export async function getAnnotationAsset(id: string): Promise<AnnotationAsset> {
  const r = await api.get<AnnotationAsset>(`/annotation-assets/${id}`)
  return r.data as AnnotationAsset
}

export async function patchAnnotationAsset(
  id: string,
  body: Partial<{
    title: string
    status: AnnotationAssetStatus
    frame_count: number | null
    duration_seconds: number | null
  }>,
): Promise<AnnotationAsset> {
  const r = await api.patch<AnnotationAsset>(`/annotation-assets/${id}`, body)
  return r.data as AnnotationAsset
}

export async function deleteAnnotationAsset(id: string): Promise<void> {
  await api.delete(`/annotation-assets/${id}`)
}

/** Stub: will run Hugging Face (or similar) re-annotation when integrated. */
export async function requestReannotate(assetId: string): Promise<AnnotationAsset> {
  const r = await api.post<AnnotationAsset>(
    `/annotation-assets/${assetId}/re-annotate`,
  )
  return r.data as AnnotationAsset
}

export async function listAnnotations(
  assetId: string,
): Promise<AnnotationRow[]> {
  const r = await api.get<{ items: AnnotationRow[] }>(
    `/annotation-assets/${assetId}/annotations`,
  )
  const d = r.data as { items: AnnotationRow[] }
  return d.items ?? []
}

export async function createAnnotation(
  assetId: string,
  body: { annotation_kind: string; payload: Record<string, unknown> },
): Promise<AnnotationRow> {
  const r = await api.post<AnnotationRow>(
    `/annotation-assets/${assetId}/annotations`,
    body,
  )
  return r.data as AnnotationRow
}

export async function patchAnnotation(
  assetId: string,
  annotationId: string,
  body: {
    annotation_kind?: string
    payload?: Record<string, unknown>
  },
): Promise<AnnotationRow> {
  const r = await api.patch<AnnotationRow>(
    `/annotation-assets/${assetId}/annotations/${annotationId}`,
    body,
  )
  return r.data as AnnotationRow
}

export async function deleteAnnotation(
  assetId: string,
  annotationId: string,
): Promise<void> {
  await api.delete(`/annotation-assets/${assetId}/annotations/${annotationId}`)
}

export function annotationReadPermission(ft: AnnotationFileType): string {
  const m: Record<AnnotationFileType, string> = {
    image: "annotations:image:read",
    video: "annotations:video:read",
    audio: "annotations:audio:read",
    dataset: "annotations:dataset:read",
    model_3d: "annotations:model_3d:read",
  }
  return m[ft]
}

export function annotationWritePermission(ft: AnnotationFileType): string {
  const m: Record<AnnotationFileType, string> = {
    image: "annotations:image:write",
    video: "annotations:video:write",
    audio: "annotations:audio:write",
    dataset: "annotations:dataset:write",
    model_3d: "annotations:model_3d:write",
  }
  return m[ft]
}

function safeDownloadFilenamePart(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "-").trim().slice(0, 120) || "asset"
}

function guessExtensionFromContentType(ct: string | null): string {
  if (!ct) return ".bin"
  const c = ct.split(";")[0]?.trim().toLowerCase() ?? ""
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/flac": ".flac",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "model/gltf+json": ".gltf",
    "model/gltf-binary": ".glb",
    "model/obj": ".obj",
    "model/stl": ".stl",
    "model/ply": ".ply",
    "model/vnd.usdz+zip": ".usdz",
    "model/x3d+xml": ".x3d",
    "model/vrml": ".wrl",
    "application/x-blender": ".blend",
  }
  return map[c] ?? ".bin"
}

/**
 * Download the primary media file (before annotations). Uses Bearer auth when available.
 */
export async function downloadOriginalMedia(asset: AnnotationAsset): Promise<void> {
  const url = asset.primary_media_url?.trim()
  if (!url) throw new Error("No media URL")

  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("auth_token")
      : null
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(url, { headers, credentials: "include" })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)

  const blob = await res.blob()
  let ext = ""
  try {
    const path = new URL(url, window.location.origin).pathname
    const last = path.split("/").pop() ?? ""
    const dot = last.lastIndexOf(".")
    if (dot > 0 && dot < last.length - 1) {
      ext = last.slice(dot).toLowerCase()
      if (!/^\.[a-z0-9]{1,8}$/i.test(ext)) ext = ""
    }
  } catch {
    /* ignore */
  }
  if (!ext) ext = guessExtensionFromContentType(res.headers.get("Content-Type"))

  const base = safeDownloadFilenamePart(asset.title || asset.id.slice(0, 8))
  const filename = `${base}${ext}`
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objUrl)
}

export async function downloadAnnotationExport(
  assetId: string,
  format: "json" | "csv" | "coco",
): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8006/api/v1"
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("auth_token")
      : null
  const res = await fetch(
    `${base}/annotation-assets/${assetId}/export?format=${format}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    },
  )
  if (!res.ok) throw new Error(`Export failed (${res.status})`)
  const blob = await res.blob()
  const cd = res.headers.get("Content-Disposition")
  let filename = `export.${format === "coco" ? "json" : format}`
  const m = cd?.match(/filename="([^"]+)"/)
  if (m) filename = m[1]
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
