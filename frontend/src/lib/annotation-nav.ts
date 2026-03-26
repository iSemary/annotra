import type { AuthUser } from "@/lib/api"
import {
  annotationReadPermission,
  annotationWritePermission,
  type AnnotationFileType,
} from "@/lib/annotation-assets"

const MODALITIES: AnnotationFileType[] = ["image", "video", "audio", "dataset"]

const PROJECT_ID_IN_PATH =
  /^\/dashboard\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

const MODALITY_SEGMENT: Record<AnnotationFileType, string> = {
  image: "images",
  video: "videos",
  audio: "audios",
  dataset: "datasets",
}

/** Non-null when the current path is under `/dashboard/projects/{id}/...`. */
export function parseDashboardProjectId(pathname: string): string | null {
  const m = pathname.match(PROJECT_ID_IN_PATH)
  return m ? m[1] : null
}

/**
 * Active state for project annotation navbar links.
 * "All" stays active on `/annotations` and on `/annotations/{assetId}/edit`, not on modality list routes.
 */
export function projectAnnotationNavActive(
  pathname: string,
  projectId: string,
  segment: "all" | AnnotationFileType,
): boolean {
  const base = `/dashboard/projects/${projectId}/annotations`
  if (segment === "all") {
    if (pathname === base) return true
    const prefix = `${base}/`
    if (!pathname.startsWith(prefix)) return false
    const rest = pathname.slice(prefix.length)
    const first = rest.split("/")[0] ?? ""
    if (["images", "videos", "audios", "datasets"].includes(first)) return false
    return true
  }
  const sub = MODALITY_SEGMENT[segment]
  return (
    pathname === `${base}/${sub}` || pathname.startsWith(`${base}/${sub}/`)
  )
}

/** Top bar / hub: needs projects + some way to read annotations. */
export function canAccessAnnotationsHub(user: AuthUser | null): boolean {
  if (!user?.permissions?.includes("projects:read")) return false
  if (user.is_superuser) return true
  const p = user.permissions
  if (p.includes("annotations:read")) return true
  return MODALITIES.some((m) => p.includes(annotationReadPermission(m)))
}

export function canReadAnnotationModality(
  user: AuthUser | null,
  ft: AnnotationFileType,
): boolean {
  if (!user) return false
  if (user.is_superuser) return true
  const p = user.permissions ?? []
  if (p.includes("annotations:read")) return true
  return p.includes(annotationReadPermission(ft))
}

export function canReadAnyAnnotationModality(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.is_superuser) return true
  const p = user.permissions ?? []
  if (p.includes("annotations:read")) return true
  return MODALITIES.some((m) => p.includes(annotationReadPermission(m)))
}

export function canWriteAnnotationModality(
  user: AuthUser | null,
  ft: AnnotationFileType,
): boolean {
  if (!user) return false
  if (user.is_superuser) return true
  const p = user.permissions ?? []
  if (p.includes("annotations:write")) return true
  return p.includes(annotationWritePermission(ft))
}
