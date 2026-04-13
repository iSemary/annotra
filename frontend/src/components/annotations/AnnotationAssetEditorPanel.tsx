"use client"

import dynamic from "next/dynamic"
import type { AnnotationAsset } from "@/lib/annotation-assets"
import { AnnotationEditorDownloads } from "@/components/annotations/AnnotationEditorDownloads"
import { ImageAnnotationEditor } from "@/components/annotations/editors/ImageAnnotationEditor"
import { VideoAnnotationEditor } from "@/components/annotations/editors/VideoAnnotationEditor"
import { AudioAnnotationEditor } from "@/components/annotations/editors/AudioAnnotationEditor"
import { DatasetAnnotationEditor } from "@/components/annotations/editors/DatasetAnnotationEditor"

const Model3dAnnotationEditor = dynamic(
  () =>
    import("@/components/annotations/editors/Model3dAnnotationEditor").then(
      (m) => m.Model3dAnnotationEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading 3D viewer…</p>
    ),
  },
)

export function AnnotationAssetEditorPanel({ asset }: { asset: AnnotationAsset }) {
  const inner = (() => {
    switch (asset.file_type) {
      case "image":
        return <ImageAnnotationEditor asset={asset} />
      case "video":
        return <VideoAnnotationEditor asset={asset} />
      case "audio":
        return <AudioAnnotationEditor asset={asset} />
      case "dataset":
        return <DatasetAnnotationEditor asset={asset} />
      case "model_3d":
        return <Model3dAnnotationEditor asset={asset} />
      default:
        return (
          <p className="text-sm text-muted-foreground">Unsupported asset type.</p>
        )
    }
  })()

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-col gap-3">
      <AnnotationEditorDownloads asset={asset} />
      <div className="min-h-0 w-full min-w-0 flex flex-1 flex-col">{inner}</div>
    </div>
  )
}
