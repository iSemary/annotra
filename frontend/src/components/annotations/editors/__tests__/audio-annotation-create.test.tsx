import "./mock-annotation-api"
import "./mock-wavesurfer"

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog"
import { AudioAnnotationEditor } from "@/components/annotations/editors/AudioAnnotationEditor"

import {
  asset,
  getAnnotationMocks,
  setupDefaultAnnotationMocks,
} from "./mock-annotation-api"
import { getLastWaveSurfer, resetWaveSurferHarness } from "./mock-wavesurfer"

const annotationMocks = getAnnotationMocks()

afterEach(() => {
  vi.clearAllMocks()
  resetWaveSurferHarness()
})

describe("manual annotation create — audio", () => {
  beforeEach(() => {
    setupDefaultAnnotationMocks()
  })

  it("Add annotation flow saves audio_segment", async () => {
    const user = userEvent.setup()
    annotationMocks.createAnnotation.mockResolvedValue({
      id: "aud-1",
      annotation_kind: "audio_segment",
      payload: { start: 2.5, end: 3.5, label: "speech" },
      created_at: "",
      updated_at: "",
    })

    render(
      <ConfirmDialogProvider>
        <AudioAnnotationEditor
          asset={asset({
            file_type: "audio",
            primary_media_url: "https://example.com/a.mp3",
          })}
        />
      </ConfirmDialogProvider>,
    )

    const ws = getLastWaveSurfer()
    expect(ws).not.toBeNull()
    ws!.fire("ready")
    await waitFor(() => {
      expect(annotationMocks.listAnnotations).toHaveBeenCalled()
    })

    const addBtn = await screen.findByRole("button", { name: /Add annotation/i })
    await waitFor(() => expect(addBtn).not.toBeDisabled())
    await user.click(addBtn)

    const dialog = await screen.findByRole("dialog")
    const labelInput = within(dialog).getByLabelText(/Label/i)
    await user.type(labelInput, "speech")
    await user.click(within(dialog).getByRole("button", { name: /Save segment/i }))

    await waitFor(() => {
      expect(annotationMocks.createAnnotation).toHaveBeenCalledWith("asset-1", {
        annotation_kind: "audio_segment",
        payload: {
          start: 2.5,
          end: 3.5,
          label: "speech",
        },
      })
    })
  })
})
