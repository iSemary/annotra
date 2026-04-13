import "./mock-annotation-api"

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VideoAnnotationEditor } from "@/components/annotations/editors/VideoAnnotationEditor"

import {
  asset,
  getAnnotationMocks,
  setupDefaultAnnotationMocks,
} from "./mock-annotation-api"

const annotationMocks = getAnnotationMocks()

afterEach(() => {
  vi.clearAllMocks()
})

describe("manual annotation create — video", () => {
  beforeEach(() => {
    setupDefaultAnnotationMocks()
  })

  it("Add annotation creates video_frame_bbox", async () => {
    const user = userEvent.setup()
    annotationMocks.createAnnotation.mockResolvedValue({
      id: "v-1",
      annotation_kind: "video_frame_bbox",
      payload: {},
      created_at: "",
      updated_at: "",
    })

    render(<VideoAnnotationEditor asset={asset({ file_type: "video" })} />)

    await screen.findByRole("button", { name: /Add annotation/i })

    const framePanel = screen
      .getByRole("heading", { name: /Frame bounding box/i })
      .parentElement as HTMLElement
    const frameInputs = within(framePanel).getAllByRole("textbox")
    // Frame, Label, From (s), To (s), x, y, w, h
    const [, labelInput, , , xInput, yInput] = frameInputs
    await user.clear(labelInput)
    await user.type(labelInput, "person")
    await user.clear(xInput)
    await user.type(xInput, "5")
    await user.clear(yInput)
    await user.type(yInput, "10")

    await user.click(screen.getByRole("button", { name: /Add annotation/i }))

    await waitFor(() => {
      expect(annotationMocks.createAnnotation).toHaveBeenCalledWith("asset-1", {
        annotation_kind: "video_frame_bbox",
        payload: {
          frame: 0,
          label: "person",
          bbox: { x: 5, y: 10, w: 80, h: 60 },
        },
      })
    })
  })

  it("Add track annotation creates video_track", async () => {
    const user = userEvent.setup()
    annotationMocks.createAnnotation.mockResolvedValue({
      id: "v-track",
      annotation_kind: "video_track",
      payload: {},
      created_at: "",
      updated_at: "",
    })

    render(<VideoAnnotationEditor asset={asset({ file_type: "video" })} />)

    await screen.findByRole("button", { name: /Add track annotation/i })

    await user.click(screen.getByRole("button", { name: /Add track annotation/i }))

    await waitFor(() => {
      expect(annotationMocks.createAnnotation).toHaveBeenCalledWith(
        "asset-1",
        expect.objectContaining({
          annotation_kind: "video_track",
          payload: expect.objectContaining({
            object_id: "obj_1",
            label: "object",
            frames: [
              { frame: 0, x: 10, y: 20 },
              { frame: 1, x: 12, y: 22 },
            ],
          }),
        }),
      )
    })
  })
})
