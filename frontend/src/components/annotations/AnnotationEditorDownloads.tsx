"use client"

import { Download, FileJson } from "lucide-react"
import { toast } from "sonner"
import {
  downloadAnnotationExport,
  downloadOriginalMedia,
  type AnnotationAsset,
} from "@/lib/annotation-assets"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AnnotationEditorDownloads({ asset }: { asset: AnnotationAsset }) {
  const hasOriginal = Boolean(asset.primary_media_url?.trim())

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3 shrink-0">
      <span className="mr-1 text-xs font-medium text-muted-foreground">
        Download
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasOriginal}
            onClick={() =>
              downloadOriginalMedia(asset).catch(() => {
                toast.error("Could not download the original file")
              })
            }
          >
            <Download className="h-4 w-4 mr-1" />
            Before
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Original media file (no annotation data)
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadAnnotationExport(asset.id, "json").catch(() => {
                toast.error("Export failed")
              })
            }
          >
            <FileJson className="h-4 w-4 mr-1" />
            After
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          JSON export: asset metadata + annotations
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
