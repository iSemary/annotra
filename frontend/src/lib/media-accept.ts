/**
 * Allowed upload types for the file picker and client-side checks.
 * Mirrors backend defaults in `backend/core/config.py` (`MEDIA_ALLOWED_EXTENSIONS`)
 * and MIME rows in `backend/models/media_kind.py`. If the server uses a custom
 * `MEDIA_ALLOWED_EXTENSIONS`, keep this list in sync or add a config API later.
 */

export const MEDIA_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
  "bmp",
  "tiff",
  "tif",
] as const

export const MEDIA_VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "webm",
  "m4v",
  "3gp",
] as const

export const MEDIA_AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "flac",
  "ogg",
  "m4a",
  "aac",
  "opus",
  "aif",
  "aiff",
  "caf",
] as const

/** Mirrors `MODEL_FILE_EXTENSIONS` in `backend/models/media_kind.py`. */
export const MEDIA_MODEL_3D_EXTENSIONS = [
  "obj",
  "mtl",
  "stl",
  "ply",
  "fbx",
  "dae",
  "gltf",
  "glb",
  "blend",
  "3ds",
  "usdz",
  "x3d",
  "wrl",
  "abc",
  "step",
  "stp",
] as const

const IMAGE_EXT_SET = new Set<string>(MEDIA_IMAGE_EXTENSIONS)
const VIDEO_EXT_SET = new Set<string>(MEDIA_VIDEO_EXTENSIONS)
const AUDIO_EXT_SET = new Set<string>(MEDIA_AUDIO_EXTENSIONS)
const MODEL_3D_EXT_SET = new Set<string>(MEDIA_MODEL_3D_EXTENSIONS)

/** MIME types the backend maps to images (`media_kind._MEDIA_TYPE_ROWS`). */
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/tiff",
])

const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
])

const AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/opus",
  "audio/aiff",
  "audio/x-aiff",
  "audio/x-caf",
])

const MODEL_3D_MIMES = new Set([
  "model/gltf+json",
  "model/gltf-binary",
  "model/obj",
  "model/stl",
  "model/ply",
  "model/vnd.usdz+zip",
  "model/x3d+xml",
  "model/vrml",
  "application/x-blender",
])

const GENERIC_MIMES_FOR_MODEL = new Set([
  "application/octet-stream",
  "text/plain",
  "application/zip",
  // Chrome sometimes reports .obj (and similar) as this bogus type
  "application/x-tgif",
])

function extensionFromFilename(name: string): string | null {
  const t = name.trim()
  const i = t.lastIndexOf(".")
  if (i < 0 || i === t.length - 1) return null
  return t.slice(i + 1).toLowerCase()
}

/** Value for `<input type="file" accept={...} />` (images only). */
export const MEDIA_ACCEPT_IMAGE = [
  ...IMAGE_MIMES,
  ...MEDIA_IMAGE_EXTENSIONS.map((e) => `.${e}`),
].join(",")

/** Value for `<input type="file" accept={...} />` (video only). */
export const MEDIA_ACCEPT_VIDEO = [
  ...VIDEO_MIMES,
  ...MEDIA_VIDEO_EXTENSIONS.map((e) => `.${e}`),
].join(",")

/** Value for `<input type="file" accept={...} />` (audio only). */
export const MEDIA_ACCEPT_AUDIO = [
  ...AUDIO_MIMES,
  ...MEDIA_AUDIO_EXTENSIONS.map((e) => `.${e}`),
].join(",")

export const MEDIA_ACCEPT_MODEL_3D = [
  ...MODEL_3D_MIMES,
  ...GENERIC_MIMES_FOR_MODEL,
  ...MEDIA_MODEL_3D_EXTENSIONS.map((e) => `.${e}`),
].join(",")

export type MediaUploadKind = "image" | "video" | "audio" | "model_3d"

/** Comma-separated `.ext` list for image pickers (create annotation asset). */
export function mediaImageExtensionsLabel(): string {
  return MEDIA_IMAGE_EXTENSIONS.map((e) => `.${e}`).join(", ")
}

/** Comma-separated `.ext` list for UI labels (e.g. beside “Media file”). */
export function mediaExtensionsLabelForSingleFileKind(
  kind: "video" | "audio" | "model_3d",
): string {
  const exts =
    kind === "video"
      ? MEDIA_VIDEO_EXTENSIONS
      : kind === "audio"
        ? MEDIA_AUDIO_EXTENSIONS
        : MEDIA_MODEL_3D_EXTENSIONS
  return exts.map((e) => `.${e}`).join(", ")
}

export function isAllowedMediaFile(
  file: File,
  kind: MediaUploadKind,
): boolean {
  const ext = extensionFromFilename(file.name)
  const mime = (file.type || "").trim().toLowerCase()

  if (kind === "image") {
    if (ext && IMAGE_EXT_SET.has(ext)) return true
    if (mime && IMAGE_MIMES.has(mime)) return true
    return false
  }
  if (kind === "video") {
    if (ext && VIDEO_EXT_SET.has(ext)) return true
    if (mime && VIDEO_MIMES.has(mime)) return true
    return false
  }
  if (kind === "model_3d") {
    if (ext && MODEL_3D_EXT_SET.has(ext)) return true
    if (mime && MODEL_3D_MIMES.has(mime)) return true
    if (mime && GENERIC_MIMES_FOR_MODEL.has(mime) && ext && MODEL_3D_EXT_SET.has(ext))
      return true
    if (mime === "application/zip" && ext === "usdz") return true
    return false
  }
  if (ext && AUDIO_EXT_SET.has(ext)) return true
  if (mime && AUDIO_MIMES.has(mime)) return true
  return false
}
