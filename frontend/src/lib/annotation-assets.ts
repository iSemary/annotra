import api, { type PaginationMeta, readResponsePagination } from "./api"

export type AnnotationFileType = "image" | "video" | "audio" | "dataset"
export type AnnotationAssetStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "reviewed"

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
  frame_count: number | null
  duration_seconds: number | null
  annotations_count: number
  dataset_size: DatasetSize
  dataset_media_ids: string[]
  created_at: string
  updated_at: string
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
  search.set("per_page", String(params.per_page ?? 10))
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
  title: string
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
  }
  return m[ft]
}

export function annotationWritePermission(ft: AnnotationFileType): string {
  const m: Record<AnnotationFileType, string> = {
    image: "annotations:image:write",
    video: "annotations:video:write",
    audio: "annotations:audio:write",
    dataset: "annotations:dataset:write",
  }
  return m[ft]
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
