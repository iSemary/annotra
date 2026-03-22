import api from "./api"

export interface MediaItem {
  id: number
  url: string
  filename: string
  mime_type: string
  size: number
}

export interface UploadMediaResponse {
  data: MediaItem
}

/**
 * Upload a file. Optionally attach to an entity (e.g. card) via attachable_type/attachable_id.
 * Returns the created media with id, url, filename, mime_type, size.
 */
export async function uploadFile(
  file: File,
  options?: { attachableType?: string; attachableId?: number }
): Promise<MediaItem> {
  const formData = new FormData()
  formData.append("file", file)
  if (options?.attachableType) formData.append("attachable_type", options.attachableType)
  if (options?.attachableId != null) formData.append("attachable_id", String(options.attachableId))
  const { data } = await api.post<UploadMediaResponse>("/media/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data.data
}

/**
 * List attachments for a card.
 */
export async function getCardAttachments(cardId: number): Promise<MediaItem[]> {
  const { data } = await api.get<{ data: MediaItem[] }>(`/cards/${cardId}/attachments`)
  return data.data
}

/**
 * Delete a media record (and file on server).
 */
export async function deleteMedia(id: number): Promise<void> {
  await api.delete(`/media/${id}`)
}
