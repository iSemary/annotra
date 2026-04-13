import type { AnnotationAsset } from "@/lib/annotation-assets"
import { vi } from "vitest"

const annotationMocks = vi.hoisted(() => ({
  listAnnotations: vi.fn(),
  createAnnotation: vi.fn(),
  patchAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
}))

vi.mock("@/lib/annotation-assets", () => ({
  listAnnotations: (...a: unknown[]) => annotationMocks.listAnnotations(...a),
  createAnnotation: (...a: unknown[]) => annotationMocks.createAnnotation(...a),
  patchAnnotation: (...a: unknown[]) => annotationMocks.patchAnnotation(...a),
  deleteAnnotation: (...a: unknown[]) => annotationMocks.deleteAnnotation(...a),
}))

/** Access spies after `import "./mock-annotation-api"`. Not exported: hoisted binding. */
export function getAnnotationMocks() {
  return annotationMocks
}

export function asset(overrides: Partial<AnnotationAsset> = {}): AnnotationAsset {
  return {
    id: "asset-1",
    project_id: "proj-1",
    file_type: "image",
    title: "Test asset",
    status: "draft",
    primary_media_id: "media-1",
    primary_media_url: "https://example.com/file.png",
    frame_count: null,
    duration_seconds: null,
    annotations_count: 0,
    dataset_size: { value: null, unit: "" },
    dataset_media_ids: [],
    created_at: "2020-01-01T00:00:00Z",
    updated_at: "2020-01-01T00:00:00Z",
    ...overrides,
  }
}

export function setupDefaultAnnotationMocks() {
  annotationMocks.listAnnotations.mockResolvedValue([])
  annotationMocks.patchAnnotation.mockImplementation(async (_id, annId, body) => ({
    id: annId,
    annotation_kind: body.annotation_kind ?? "image_bbox",
    payload: body.payload ?? {},
    created_at: "",
    updated_at: "",
  }))
  annotationMocks.deleteAnnotation.mockResolvedValue(undefined)
}
