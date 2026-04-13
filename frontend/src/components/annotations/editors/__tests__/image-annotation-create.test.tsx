import "./mock-annotation-api"
import "./mock-react-konva"

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { ImageAnnotationEditor } from "@/components/annotations/editors/ImageAnnotationEditor"

import {
  asset,
  getAnnotationMocks,
  setupDefaultAnnotationMocks,
} from "./mock-annotation-api"

const annotationMocks = getAnnotationMocks()

beforeAll(() => {
  class FakeImage {
    crossOrigin = ""
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_: string) {
      queueMicrotask(() => {
        Object.defineProperty(this, "naturalWidth", {
          value: 640,
          configurable: true,
        })
        Object.defineProperty(this, "naturalHeight", {
          value: 480,
          configurable: true,
        })
        this.onload?.()
      })
    }
  }
  vi.stubGlobal("Image", FakeImage)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("manual annotation create — image", () => {
  beforeEach(() => {
    setupDefaultAnnotationMocks()
  })

  it("Add annotation then Save calls createAnnotation with image_bbox", async () => {
    const user = userEvent.setup()
    annotationMocks.createAnnotation.mockResolvedValue({
      id: "new-ann",
      annotation_kind: "image_bbox",
      payload: { label: "object", bbox: { x: 1, y: 2, w: 80, h: 60 } },
      created_at: "",
      updated_at: "",
    })

    render(<ImageAnnotationEditor asset={asset({ file_type: "image" })} />)

    await screen.findByRole("button", { name: /Add annotation/i })

    await user.click(screen.getByRole("button", { name: /Add annotation/i }))
    await user.click(screen.getByRole("button", { name: /^Save$/i }))

    await waitFor(() => {
      expect(annotationMocks.createAnnotation).toHaveBeenCalledWith(
        "asset-1",
        expect.objectContaining({
          annotation_kind: "image_bbox",
          payload: expect.objectContaining({
            label: "object",
            bbox: expect.objectContaining({
              x: expect.any(Number),
              y: expect.any(Number),
              w: expect.any(Number),
              h: expect.any(Number),
            }),
          }),
        }),
      )
    })
  })
})
