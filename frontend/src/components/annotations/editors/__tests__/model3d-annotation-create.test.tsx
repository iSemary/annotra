import "./mock-annotation-api"
import "./mock-three-editor"

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Model3dAnnotationEditor } from "@/components/annotations/editors/Model3dAnnotationEditor"

import {
  asset,
  getAnnotationMocks,
  setupDefaultAnnotationMocks,
} from "./mock-annotation-api"

const annotationMocks = getAnnotationMocks()

afterEach(() => {
  vi.clearAllMocks()
})

describe("manual annotation create — 3D", () => {
  beforeEach(() => {
    setupDefaultAnnotationMocks()
  })

  it("Add box creates model_3d_oriented_box", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as unknown as typeof fetch

    annotationMocks.createAnnotation.mockResolvedValue({
      id: "box-1",
      annotation_kind: "model_3d_oriented_box",
      payload: {
        label: "Box",
        center: { x: 0, y: 0, z: 0 },
        half_extents: { x: 0.25, y: 0.25, z: 0.25 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      created_at: "",
      updated_at: "",
    })

    render(
      <Model3dAnnotationEditor
        asset={asset({
          file_type: "model_3d",
          primary_media_url: "https://cdn.example.com/models/sample.glb",
        })}
      />,
    )

    await waitFor(() => {
      expect(annotationMocks.listAnnotations).toHaveBeenCalled()
    })

    await user.click(await screen.findByRole("button", { name: /^Box$/i }))

    const addBox = await screen.findByRole("button", { name: /Add box/i })
    await waitFor(() => expect(addBox).not.toBeDisabled())
    await user.click(addBox)

    await waitFor(() => {
      expect(annotationMocks.createAnnotation).toHaveBeenCalledWith("asset-1", {
        annotation_kind: "model_3d_oriented_box",
        payload: {
          label: "Box",
          center: { x: 0, y: 0, z: 0 },
          half_extents: { x: 0.25, y: 0.25, z: 0.25 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      })
    })
  })
})
