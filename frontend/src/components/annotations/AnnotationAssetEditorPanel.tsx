"use client"

import type { AnnotationAsset } from "@/lib/annotation-assets"
import { AnnotationEditorDownloads } from "@/components/annotations/AnnotationEditorDownloads"
import { ImageAnnotationEditor } from "@/components/annotations/editors/ImageAnnotationEditor"
import { VideoAnnotationEditor } from "@/components/annotations/editors/VideoAnnotationEditor"
import { AudioAnnotationEditor } from "@/components/annotations/editors/AudioAnnotationEditor"
import { DatasetAnnotationEditor } from "@/components/annotations/editors/DatasetAnnotationEditor"

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
      default:
        return (
          <p className="text-sm text-muted-foreground">Unsupported asset type.</p>
        )
    }
  })()

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <AnnotationEditorDownloads asset={asset} />
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{inner}</div>
    </div>
  )
}
