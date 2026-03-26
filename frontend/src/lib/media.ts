import api, { type PaginationMeta, readResponsePagination } from "./api"

export type MediaKind = "image" | "video" | "audio" | "model_3d"

export interface MediaRecord {
  id: string
  kind: MediaKind
  storage_key: string
  mime_type: string
  size_bytes: number | null
  user_id: string | null
  created_at: string
  updated_at: string
  url: string
}

export interface ListMediaParams {
  page?: number
  per_page?: number
  kind?: MediaKind
}

export interface ListMediaResult {
  items: MediaRecord[]
  pagination: PaginationMeta | null
}

/**
 * Paginated list of the current user's uploads.
 */
export async function listMedia(
  params: ListMediaParams = {},
): Promise<ListMediaResult> {
  const { page = 1, per_page = 200, kind } = params
  const search = new URLSearchParams({
    page: String(page),
    per_page: String(per_page),
  })
  if (kind) search.set("kind", kind)
  const r = await api.get(`/media?${search.toString()}`)
  const body = r.data as { items: MediaRecord[] }
  return {
    items: body.items ?? [],
    pagination: readResponsePagination(r),
  }
}

/**
 * Upload a single file (multipart field `file`).
 */
export async function uploadFile(file: File): Promise<MediaRecord> {
  const formData = new FormData()
  formData.append("file", file)
  const r = await api.post<MediaRecord>("/media/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return r.data as MediaRecord
}

/**
 * Fetch one media row by id (must be owned by the current user).
 */
export async function getMedia(id: string): Promise<MediaRecord> {
  const r = await api.get<MediaRecord>(`/media/${id}`)
  return r.data as MediaRecord
}

/**
 * Delete a media record and its stored object.
 */
export async function deleteMedia(id: string): Promise<void> {
  await api.delete(`/media/${id}`)
}
