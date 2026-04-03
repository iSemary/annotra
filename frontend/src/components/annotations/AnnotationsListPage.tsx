"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation"
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"
import {
  AudioWaveform,
  Boxes,
  ChevronDown,
  ChevronRight,
  Eye,
  FileDown,
  FileJson,
  Image,
  Layers,
  Loader2,
  Pencil,
  Sparkles,
  Table2,
  Trash2,
  Video,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  createAnnotationAsset,
  deleteAnnotationAsset,
  downloadAnnotationExport,
  getAnnotationAsset,
  listAnnotationAssets,
  listAnnotations,
  annotationStatusBadgeClassName,
  formatFileSizeKb,
  requestReannotate,
  type AnnotationAsset,
  type AnnotationFileType,
} from "@/lib/annotation-assets"
import { canWriteAnnotationModality } from "@/lib/annotation-nav"
import { getProjects, type Project } from "@/lib/projects"
import { DEFAULT_PAGE_SIZE } from "@/lib/api"
import {
  MEDIA_ACCEPT_AUDIO,
  MEDIA_ACCEPT_IMAGE,
  MEDIA_ACCEPT_VIDEO,
  isAllowedMediaFile,
} from "@/lib/media-accept"
import { uploadFile } from "@/lib/media"
import { useAuth } from "@/context/auth-context"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { TableActionButton } from "@/components/ui/table-action-button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { AnnotationAssetEditorPanel } from "@/components/annotations/AnnotationAssetEditorPanel"

const JsonView = dynamic(() => import("@uiw/react-json-view"), {
  ssr: false,
})

export type FileTypeFilter = "all" | AnnotationFileType

const STATUS_OPTS = [
  { value: "", label: "Any status" },
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "reviewed", label: "Reviewed" },
  { value: "failed", label: "Failed" },
]

const SORT_OPTS = [
  { value: "updated_at", label: "Last updated" },
  { value: "annotations_count", label: "Annotations count" },
  { value: "progress", label: "Progress" },
]

const FILE_TYPE_OPTS: { value: AnnotationFileType; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "dataset", label: "Dataset" },
]

const FILE_TYPE_ICON: Record<AnnotationFileType, LucideIcon> = {
  image: Image,
  video: Video,
  audio: AudioWaveform,
  dataset: Layers,
}

const COCO_EXPORT_FILE_TYPES: AnnotationFileType[] = [
  "image",
  "video",
  "audio",
  "dataset",
]

const MODEL_RERUN_FILE_TYPES: AnnotationFileType[] = [
  "image",
  "video",
  "audio",
  "dataset",
]

type CreateImageRow = {
  id: string
  file: File
  previewUrl: string
  mediaId: string | null
}

function AnnotationFileTypeCell({ fileType }: { fileType: AnnotationFileType }) {
  const Icon = FILE_TYPE_ICON[fileType]
  const name =
    FILE_TYPE_OPTS.find((o) => o.value === fileType)?.label ?? fileType
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground">
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{name}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{name}</TooltipContent>
    </Tooltip>
  )
}

/** Stable fingerprint for list rows + pagination — skip React updates when unchanged (silent refresh). */
function annotationTableFingerprint(
  rows: AnnotationAsset[],
  pagination: { total_pages: number; total: number; page_size: number },
): string {
  const pag = `${pagination.total_pages}\x1d${pagination.total}\x1d${pagination.page_size}`
  const rowsPart = rows
    .map((r) => {
      return [
        r.id,
        r.status,
        r.updated_at,
        r.annotations_count,
        r.title,
        r.file_type,
        r.project_id,
        r.project_name ?? "",
        r.primary_media_url ?? "",
        r.primary_media_id ?? "",
        r.file_size_bytes ?? "",
        r.dataset_media_ids.join(","),
        r.frame_count ?? "",
        r.duration_seconds ?? "",
      ].join("\x1e")
    })
    .join("\x1f")
  return `${pag}\x1c${rowsPart}`
}

export function AnnotationsListPage({
  fileTypeFilter,
  listScope = "project",
}: {
  fileTypeFilter: FileTypeFilter
  /** `global` = all company projects (dashboard /annotations routes). */
  listScope?: "project" | "global"
}) {
  const params = useParams()
  const pathname = usePathname() ?? "/dashboard/annotations"
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = typeof params.id === "string" ? params.id : ""
  const globalProjectFilter =
    listScope === "global"
      ? (searchParams.get("project")?.trim() ?? "")
      : ""
  const { user } = useAuth()
  const { confirm } = useConfirm()
  const perms = user?.permissions ?? []

  const canWriteMedia = user?.is_superuser || perms.includes("media:write")
  const canWriteType = (ft: AnnotationFileType) =>
    canWriteAnnotationModality(user, ft)

  const storageKey =
    listScope === "global"
      ? `annotra-ann-create-global-${fileTypeFilter}`
      : `annotra-ann-create-${projectId}-${fileTypeFilter}`

  const [openCreate, setOpenCreate] = useState(false)
  const [projectsForCreate, setProjectsForCreate] = useState<Project[]>([])
  const [createProjectId, setCreateProjectId] = useState("")
  const [items, setItems] = useState<AnnotationAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<{
    total_pages: number
    total: number
    page_size: number
  } | null>(null)
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sortBy, setSortBy] = useState<"annotations_count" | "updated_at" | "progress">(
    "updated_at",
  )
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const [createTitle, setCreateTitle] = useState("")
  const [createFileType, setCreateFileType] = useState<AnnotationFileType>("image")
  const [createPrimaryId, setCreatePrimaryId] = useState<string | null>(null)
  const [createImageRows, setCreateImageRows] = useState<CreateImageRow[]>([])
  const [createDatasetIds, setCreateDatasetIds] = useState<string[]>([])
  const [createFrameCount, setCreateFrameCount] = useState("")
  const [createDuration, setCreateDuration] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [jsonDialog, setJsonDialog] = useState<unknown[] | null>(null)
  const [previewAsset, setPreviewAsset] = useState<AnnotationAsset | null>(null)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editSheetAsset, setEditSheetAsset] = useState<AnnotationAsset | null>(
    null,
  )
  const [editSheetLoading, setEditSheetLoading] = useState(false)

  const pageRef = useRef(page)
  pageRef.current = page

  const createImageRowsRef = useRef(createImageRows)
  createImageRowsRef.current = createImageRows

  const lastTableFingerprintRef = useRef<string>("")
  const suppressListLoadEffectRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw === "1") setOpenCreate(true)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  useEffect(() => {
    if (listScope !== "global") return
    let cancelled = false
    getProjects({ page: 1, per_page: 100 })
      .then((res) => {
        if (!cancelled) setProjectsForCreate(res.data)
      })
      .catch(() => {
        if (!cancelled) setProjectsForCreate([])
      })
    return () => {
      cancelled = true
    }
  }, [listScope])

  useEffect(() => {
    if (listScope !== "global") return
    setCreateProjectId((prev) => {
      if (
        globalProjectFilter &&
        projectsForCreate.some((p) => p.id === globalProjectFilter)
      ) {
        return globalProjectFilter
      }
      if (prev && projectsForCreate.some((p) => p.id === prev)) return prev
      return projectsForCreate[0]?.id ?? ""
    })
  }, [listScope, globalProjectFilter, projectsForCreate])

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, openCreate ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [openCreate, storageKey])

  useEffect(() => {
    return () => {
      for (const r of createImageRowsRef.current) {
        URL.revokeObjectURL(r.previewUrl)
      }
    }
  }, [])

  const effectiveFileType =
    fileTypeFilter === "all" ? "" : fileTypeFilter

  const load = useCallback(
    async (opts?: { silent?: boolean; pageOverride?: number }) => {
      const silent = opts?.silent ?? false
      const pageNum = opts?.pageOverride ?? pageRef.current

      if (listScope === "project" && !projectId) return
      if (!silent) setLoading(true)
      try {
        const { items: rows, pagination: p } = await listAnnotationAssets({
          ...(listScope === "project" && projectId
            ? { project_id: projectId }
            : {}),
          ...(listScope === "global" && globalProjectFilter
            ? { project_id: globalProjectFilter }
            : {}),
          page: pageNum,
          per_page: DEFAULT_PAGE_SIZE,
          search: searchDebounced || undefined,
          status: statusFilter || undefined,
          file_type: effectiveFileType || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        })
        const meta = p
          ? {
              total_pages: p.total_pages,
              total: p.total,
              page_size: p.page_size,
            }
          : {
              total_pages: 1,
              total: rows.length,
              page_size: DEFAULT_PAGE_SIZE,
            }
        const fp = annotationTableFingerprint(rows, meta)

        if (silent && fp === lastTableFingerprintRef.current) {
          return
        }
        lastTableFingerprintRef.current = fp

        const apply = () => {
          setItems(rows)
          setPagination(meta)
        }
        if (silent) {
          startTransition(apply)
        } else {
          apply()
        }
      } catch {
        if (!silent) {
          toast.error("Failed to load annotation assets")
          setItems([])
          lastTableFingerprintRef.current = ""
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [
      listScope,
      projectId,
      globalProjectFilter,
      searchDebounced,
      statusFilter,
      effectiveFileType,
      sortBy,
      sortDir,
    ],
  )

  useEffect(() => {
    if (suppressListLoadEffectRef.current) {
      suppressListLoadEffectRef.current = false
      return
    }
    void load()
  }, [load, page])

  const hasInProgressAssets = useMemo(
    () => items.some((a) => a.status === "in_progress"),
    [items],
  )

  useEffect(() => {
    if (!hasInProgressAssets) return
    const t = setInterval(() => {
      void load({ silent: true })
    }, 2000)
    return () => clearInterval(t)
  }, [hasInProgressAssets, load])

  const openEditSheet = useCallback(
    (row: AnnotationAsset) => {
      setEditSheetOpen(true)
      setEditSheetAsset(null)
      setEditSheetLoading(true)
      getAnnotationAsset(row.id)
        .then((a) => {
          if (
            listScope === "project" &&
            projectId &&
            a.project_id !== projectId
          ) {
            toast.error("Asset does not belong to this project")
            setEditSheetOpen(false)
            return
          }
          if (
            listScope === "global" &&
            globalProjectFilter &&
            a.project_id !== globalProjectFilter
          ) {
            toast.error("Asset does not belong to the filtered project")
            setEditSheetOpen(false)
            return
          }
          setEditSheetAsset(a)
        })
        .catch(() => {
          toast.error("Failed to load asset")
          setEditSheetOpen(false)
        })
        .finally(() => setEditSheetLoading(false))
    },
    [listScope, projectId, globalProjectFilter],
  )

  const handleReannotate = useCallback(
    async (row: AnnotationAsset) => {
      if (
        !canWriteType(row.file_type) ||
        !MODEL_RERUN_FILE_TYPES.includes(row.file_type)
      ) {
        return
      }
      try {
        await requestReannotate(row.id)
        toast.success("Re-annotate accepted (model integration pending)")
        await load({ silent: true })
      } catch {
        toast.error("Re-annotate failed")
      }
    },
    [load],
  )

  const createTypeLocked =
    fileTypeFilter !== "all" ? fileTypeFilter : createFileType

  useEffect(() => {
    if (createTypeLocked === "image") return
    setCreateImageRows((prev) => {
      for (const r of prev) {
        URL.revokeObjectURL(r.previewUrl)
      }
      return []
    })
  }, [createTypeLocked])

  useEffect(() => {
    if (createTypeLocked === "video" || createTypeLocked === "audio") return
    setCreatePrimaryId(null)
  }, [createTypeLocked])

  const canSubmitCreate =
    canWriteMedia &&
    canWriteType(createTypeLocked) &&
    (listScope === "global" ? !!createProjectId : true) &&
    (createTypeLocked === "dataset"
      ? createDatasetIds.length >= 2
      : createTypeLocked === "image"
        ? createImageRows.length >= 1 &&
          createImageRows.every((r) => r.mediaId)
        : !!createPrimaryId)

  async function onUploadSingle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!canWriteMedia) {
      toast.error("You need media:write to upload files")
      return
    }
    const kind = createTypeLocked === "video" ? "video" : "audio"
    if (!isAllowedMediaFile(f, kind)) {
      toast.error(
        kind === "video"
          ? "Choose a video file the server allows (e.g. mp4, mov, webm, m4v, 3gp)"
          : "Choose an audio file the server allows (e.g. mp3, wav, flac, m4a, aac, …)",
      )
      e.target.value = ""
      return
    }
    setUploading(true)
    try {
      const m = await uploadFile(f)
      setCreatePrimaryId(m.id)
      toast.success("File uploaded")
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  function removeCreateImageRow(id: string) {
    setCreateImageRows((prev) => {
      const row = prev.find((r) => r.id === id)
      if (row) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((r) => r.id !== id)
    })
  }

  async function onUploadImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    if (!canWriteMedia) {
      toast.error("You need media:write to upload files")
      return
    }
    const picked = Array.from(files)
    const imageFiles = picked.filter((f) => isAllowedMediaFile(f, "image"))
    if (!imageFiles.length) {
      toast.error(
        "Choose image files the server allows (e.g. jpg, png, webp, gif, heic, bmp, tiff)",
      )
      e.target.value = ""
      return
    }
    if (imageFiles.length < picked.length) {
      toast.info(
        `${picked.length - imageFiles.length} file(s) skipped — not an allowed image type`,
      )
    }
    const newRows: CreateImageRow[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      mediaId: null,
    }))
    setCreateImageRows((prev) => [...prev, ...newRows])
    e.target.value = ""
    setUploading(true)
    try {
      for (const row of newRows) {
        const m = await uploadFile(row.file)
        setCreateImageRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, mediaId: m.id } : r)),
        )
      }
      toast.success(
        newRows.length > 1
          ? `Uploaded ${newRows.length} images`
          : "Image uploaded",
      )
    } catch {
      toast.error("Upload failed")
      setCreateImageRows((prev) =>
        prev.filter((r) => {
          const inBatch = newRows.some((n) => n.id === r.id)
          if (!inBatch) return true
          if (r.mediaId) return true
          URL.revokeObjectURL(r.previewUrl)
          return false
        }),
      )
    } finally {
      setUploading(false)
    }
  }

  async function onUploadDataset(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    if (!canWriteMedia) {
      toast.error("You need media:write to upload files")
      return
    }
    const picked = Array.from(files)
    const imageFiles = picked.filter((f) => isAllowedMediaFile(f, "image"))
    if (!imageFiles.length) {
      toast.error(
        "Choose image files the server allows (e.g. jpg, png, webp, gif, heic, bmp, tiff)",
      )
      e.target.value = ""
      return
    }
    if (imageFiles.length < picked.length) {
      toast.info(
        `${picked.length - imageFiles.length} file(s) skipped — not an allowed image type`,
      )
    }
    setUploading(true)
    try {
      const ids: string[] = []
      for (const f of imageFiles) {
        const m = await uploadFile(f)
        ids.push(m.id)
      }
      setCreateDatasetIds((prev) => [...prev, ...ids])
      toast.success(`Uploaded ${ids.length} file(s)`)
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmitCreate) return
    setSubmitting(true)
    try {
      const targetProjectId =
        listScope === "global" ? createProjectId : projectId
      const titleBase = createTitle.trim()

      if (createTypeLocked === "image") {
        const ready = createImageRows.filter((r) => r.mediaId)
        for (let i = 0; i < ready.length; i++) {
          const body: Parameters<typeof createAnnotationAsset>[0] = {
            project_id: targetProjectId,
            file_type: "image",
            primary_media_id: ready[i].mediaId!,
          }
          if (titleBase) {
            body.title =
              ready.length > 1 ? `${titleBase} (${i + 1})` : titleBase
          }
          await createAnnotationAsset(body)
        }
        toast.success(
          ready.length > 1
            ? `Created ${ready.length} annotation assets`
            : "Annotation asset created",
        )
        for (const r of createImageRows) {
          URL.revokeObjectURL(r.previewUrl)
        }
        setCreateImageRows([])
      } else {
        const body: Parameters<typeof createAnnotationAsset>[0] = {
          project_id: targetProjectId,
          file_type: createTypeLocked,
          ...(titleBase ? { title: titleBase } : {}),
        }
        if (createTypeLocked === "dataset") {
          body.dataset_media_ids = createDatasetIds
        } else {
          body.primary_media_id = createPrimaryId
        }
        if (createTypeLocked === "video" && createFrameCount.trim()) {
          body.frame_count = parseInt(createFrameCount, 10)
        }
        if (createTypeLocked === "audio" && createDuration.trim()) {
          body.duration_seconds = parseFloat(createDuration)
        }
        await createAnnotationAsset(body)
        toast.success("Annotation asset created")
      }
      setCreateTitle("")
      setCreatePrimaryId(null)
      setCreateDatasetIds([])
      setCreateFrameCount("")
      setCreateDuration("")
      setOpenCreate(false)
      if (page !== 1) {
        suppressListLoadEffectRef.current = true
        flushSync(() => setPage(1))
      }
      await load({ silent: true })
    } catch {
      toast.error("Could not create asset")
    } finally {
      setSubmitting(false)
    }
  }

  async function openJsonPreview(asset: AnnotationAsset) {
    try {
      const ann = await listAnnotations(asset.id)
      setJsonDialog(ann.map((a) => ({ ...a.payload, _kind: a.annotation_kind })))
    } catch {
      toast.error("Failed to load annotations")
    }
  }

  async function handleDelete(asset: AnnotationAsset) {
    if (!canWriteType(asset.file_type)) return
    const ok = await confirm({
      title: "Delete annotation asset?",
      description: "Annotations for this asset will be removed.",
      variant: "destructive",
      confirmLabel: "Delete",
    })
    if (!ok) return
    try {
      await deleteAnnotationAsset(asset.id)
      toast.success("Deleted")
      await load({ silent: true })
    } catch {
      toast.error("Delete failed")
    }
  }

  const sortOptions = useMemo(() => SORT_OPTS, [])

  const globalProjectFilterOptions = useMemo(() => {
    if (listScope !== "global") return []
    const opts = [
      { value: "", label: "All projects" },
      ...projectsForCreate.map((p) => ({ value: p.id, label: p.name })),
    ]
    if (
      globalProjectFilter &&
      !opts.some((o) => o.value === globalProjectFilter)
    ) {
      opts.splice(1, 0, {
        value: globalProjectFilter,
        label: `Project ${globalProjectFilter.slice(0, 8)}…`,
      })
    }
    return opts
  }, [listScope, projectsForCreate, globalProjectFilter])

  const setGlobalProjectFilter = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString())
      if (value) next.set("project", value)
      else next.delete("project")
      const q = next.toString()
      router.replace(q ? `${pathname}?${q}` : pathname)
      setPage(1)
    },
    [pathname, router, searchParams],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {fileTypeFilter === "all"
            ? "Annotations"
            : `${fileTypeFilter.charAt(0).toUpperCase()}${fileTypeFilter.slice(1)} annotations`}
        </h1>
      </div>

      <Collapsible open={openCreate} onOpenChange={setOpenCreate}>
        <CollapsibleTrigger asChild>
          <Button className="w-full justify-between sm:w-auto">
            New annotation asset
            {openCreate ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <div className="w-full rounded-lg border border-border bg-card p-4 text-card-foreground space-y-4">
            {!canWriteMedia && (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Upload requires <code className="text-xs">media:write</code>.
              </p>
            )}
            {!canWriteType(createTypeLocked) && (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                You do not have write access for this asset type.
              </p>
            )}
            <form
              onSubmit={handleCreate}
              className="grid grid-cols-1 gap-4 md:grid-cols-3"
            >
              {listScope === "global" && (
                <div className="min-w-0 space-y-2">
                  <Label>Project</Label>
                  <Select
                    options={projectsForCreate.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    value={createProjectId}
                    onChange={setCreateProjectId}
                    aria-label="Project"
                    placeholder="Select project"
                  />
                  {projectsForCreate.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No projects available. Create one under Projects first.
                    </p>
                  )}
                </div>
              )}
              {fileTypeFilter === "all" && (
                <div className="min-w-0 space-y-2">
                  <Label>File type</Label>
                  <Select
                    options={FILE_TYPE_OPTS}
                    value={createFileType}
                    onChange={(v) => {
                      setCreateFileType(v as AnnotationFileType)
                      setCreatePrimaryId(null)
                      setCreateDatasetIds([])
                    }}
                    aria-label="File type"
                  />
                </div>
              )}
              <div className="min-w-0 space-y-2">
                <Label htmlFor="ann-title">Title (optional)</Label>
                <Input
                  id="ann-title"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="e.g. Front view — empty uses Image #1, Video #2, …"
                />
              </div>
              {createTypeLocked === "dataset" ? (
                <div className="min-w-0 space-y-2 md:col-span-3">
                  <Label>Dataset images (min 2)</Label>
                  <Input
                    type="file"
                    accept={MEDIA_ACCEPT_IMAGE}
                    multiple
                    disabled={!canWriteMedia || uploading}
                    onChange={onUploadDataset}
                  />
                  <p className="text-xs text-muted-foreground">
                    {createDatasetIds.length} file(s) linked
                  </p>
                </div>
              ) : createTypeLocked === "image" ? (
                <div className="min-w-0 space-y-2 md:col-span-3">
                  <Label htmlFor="ann-images">Images</Label>
                  <Input
                    id="ann-images"
                    type="file"
                    accept={MEDIA_ACCEPT_IMAGE}
                    multiple
                    disabled={!canWriteMedia || uploading}
                    onChange={onUploadImages}
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose one or more images — previews appear below. You can
                    add another batch before creating.
                  </p>
                  {createImageRows.length > 0 && (
                    <ul className="flex flex-wrap gap-3 pt-1">
                      {createImageRows.map((row) => (
                        <li
                          key={row.id}
                          className="relative w-[100px] shrink-0"
                        >
                          <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                            <img
                              src={row.previewUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            {!row.mediaId && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            {row.file.name}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="absolute -right-1 -top-1 h-6 w-6 rounded-full shadow-md"
                            aria-label={`Remove ${row.file.name}`}
                            onClick={() => removeCreateImageRow(row.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="min-w-0 space-y-2 md:col-span-3">
                  <Label>Media file</Label>
                  <Input
                    type="file"
                    accept={
                      createTypeLocked === "video"
                        ? MEDIA_ACCEPT_VIDEO
                        : MEDIA_ACCEPT_AUDIO
                    }
                    disabled={!canWriteMedia || uploading}
                    onChange={onUploadSingle}
                  />
                  {createPrimaryId && (
                    <p className="text-xs text-muted-foreground">
                      Media id: {createPrimaryId}
                    </p>
                  )}
                </div>
              )}
              {createTypeLocked === "video" && (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="fc">Frame count (optional)</Label>
                  <Input
                    id="fc"
                    inputMode="numeric"
                    value={createFrameCount}
                    onChange={(e) => setCreateFrameCount(e.target.value)}
                  />
                </div>
              )}
              {createTypeLocked === "audio" && (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="dur">Duration sec (optional)</Label>
                  <Input
                    id="dur"
                    inputMode="decimal"
                    value={createDuration}
                    onChange={(e) => setCreateDuration(e.target.value)}
                  />
                </div>
              )}
              <div className="flex min-w-0 items-end pb-0.5">
                <Button type="submit" disabled={!canSubmitCreate || submitting}>
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {createTypeLocked === "image" && createImageRows.length > 1
                    ? `Create (${createImageRows.length})`
                    : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {listScope === "global" && (
          <div className="space-y-1 w-full min-w-[200px] sm:w-56">
            <Label className="text-xs">Project</Label>
            <Select
              options={globalProjectFilterOptions}
              value={globalProjectFilter}
              onChange={setGlobalProjectFilter}
              isSearchable
              placeholder="All projects"
              aria-label="Filter by project"
            />
          </div>
        )}
        <div className="space-y-1 flex-1 min-w-[180px]">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Search title or annotations…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="space-y-1 w-full sm:w-44">
          <Label className="text-xs">Status</Label>
          <Select
            options={STATUS_OPTS}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
            isClearable
            placeholder="Filter"
            aria-label="Status filter"
          />
        </div>
        <div className="space-y-1 w-full sm:w-44">
          <Label className="text-xs">Sort by</Label>
          <Select
            options={sortOptions}
            value={sortBy}
            onChange={(v) => {
              setSortBy(v as typeof sortBy)
              setPage(1)
            }}
            aria-label="Sort by"
          />
        </div>
        <div className="space-y-1 w-full sm:w-36">
          <Label className="text-xs">Direction</Label>
          <Select
            options={[
              { value: "desc", label: "Descending" },
              { value: "asc", label: "Ascending" },
            ]}
            value={sortDir}
            onChange={(v) => {
              setSortDir(v as "asc" | "desc")
              setPage(1)
            }}
            aria-label="Sort direction"
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card text-card-foreground">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Id</TableHead>
                {listScope === "global" && (
                  <TableHead className="min-w-[120px]">Project</TableHead>
                )}
                {fileTypeFilter === "all" && <TableHead>Type</TableHead>}
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Annotations</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="min-w-[280px] w-[30%] text-center align-middle">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={
                      7 +
                      (fileTypeFilter === "all" ? 1 : 0) +
                      (listScope === "global" ? 1 : 0)
                    }
                    className="text-center text-muted-foreground py-10"
                  >
                    No assets yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      const t = e.target as HTMLElement
                      if (
                        t.closest(
                          "a[href], button, [data-row-actions], input, textarea, select",
                        )
                      ) {
                        return
                      }
                      openEditSheet(row)
                    }}
                  >
                    <TableCell className="font-mono text-xs">
                      {row.id.slice(0, 8)}…
                    </TableCell>
                    {listScope === "global" && (
                      <TableCell className="text-sm max-w-[160px]">
                        {row.project_name ? (
                          <Link
                            href={`/dashboard/projects/${row.project_id}/annotations`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {row.project_name}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.project_id.slice(0, 8)}…
                          </span>
                        )}
                      </TableCell>
                    )}
                    {fileTypeFilter === "all" && (
                      <TableCell className="w-14">
                        <AnnotationFileTypeCell fileType={row.file_type} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {row.title}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.annotations_count}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={annotationStatusBadgeClassName(row.status)}
                      >
                        {row.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.updated_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatFileSizeKb(row.file_size_bytes)}
                    </TableCell>
                    <TableCell className="align-top min-w-[280px] w-[30%]">
                      <div
                        data-row-actions
                        className="grid w-full grid-cols-4 gap-x-2 gap-y-3 justify-items-center"
                        role="group"
                        aria-label="Row actions"
                      >
                        <TableActionButton
                          label="View annotations JSON"
                          caption="Inspect"
                          onClick={() => openJsonPreview(row)}
                        >
                          <FileJson className="h-4 w-4" />
                        </TableActionButton>
                        <TableActionButton
                          label="Preview media"
                          caption="Preview"
                          onClick={() => setPreviewAsset(row)}
                        >
                          <Eye className="h-4 w-4" />
                        </TableActionButton>
                        <TableActionButton
                          label="Export JSON"
                          caption="JSON"
                          onClick={() =>
                            downloadAnnotationExport(row.id, "json").catch(() =>
                              toast.error("Export failed"),
                            )
                          }
                        >
                          <FileDown className="h-4 w-4" />
                        </TableActionButton>
                        <TableActionButton
                          label="Export CSV"
                          caption="CSV"
                          onClick={() =>
                            downloadAnnotationExport(row.id, "csv").catch(() =>
                              toast.error("Export failed"),
                            )
                          }
                        >
                          <Table2 className="h-4 w-4" />
                        </TableActionButton>
                        {COCO_EXPORT_FILE_TYPES.includes(row.file_type) && (
                          <TableActionButton
                            label="Export COCO"
                            caption="COCO"
                            onClick={() =>
                              downloadAnnotationExport(row.id, "coco").catch(
                                () => toast.error("Export failed"),
                              )
                            }
                          >
                            <Boxes className="h-4 w-4" />
                          </TableActionButton>
                        )}
                        {MODEL_RERUN_FILE_TYPES.includes(row.file_type) &&
                          canWriteType(row.file_type) && (
                            <TableActionButton
                              label="Re-annotate with model"
                              caption="Re-run"
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleReannotate(row)
                              }}
                            >
                              <Sparkles className="h-4 w-4" />
                            </TableActionButton>
                          )}
                        <TableActionButton
                          label="Edit"
                          caption="Edit"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditSheet(row)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </TableActionButton>
                        {canWriteType(row.file_type) && (
                          <TableActionButton
                            label="Delete"
                            caption="Delete"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </TableActionButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {pagination !== null && (
        <Pagination
          currentPage={page}
          totalPages={pagination.total_pages}
          onPageChange={setPage}
          totalItems={pagination.total}
          pageSize={pagination.page_size}
        />
      )}

      <Dialog open={!!jsonDialog} onOpenChange={(o) => !o && setJsonDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Annotations (JSON)</DialogTitle>
          </DialogHeader>
          {jsonDialog && (
            <div className="text-sm">
              <JsonView value={jsonDialog as object} collapsed={1} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!previewAsset}
        onOpenChange={(o) => !o && setPreviewAsset(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          {previewAsset?.primary_media_url &&
            (previewAsset.file_type === "image" ||
              previewAsset.file_type === "dataset") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewAsset.primary_media_url}
                alt=""
                className="max-h-[70vh] w-auto mx-auto rounded-md border"
              />
            )}
          {previewAsset?.primary_media_url &&
            previewAsset.file_type === "video" && (
              <video
                src={previewAsset.primary_media_url}
                controls
                className="w-full max-h-[70vh] rounded-md border"
              />
            )}
          {previewAsset?.primary_media_url &&
            previewAsset.file_type === "audio" && (
              <audio
                src={previewAsset.primary_media_url}
                controls
                className="w-full"
              />
            )}
          {previewAsset?.file_type === "dataset" &&
            !previewAsset.primary_media_url && (
              <p className="text-sm text-muted-foreground">
                Dataset has no single preview. Open the editor to pick a member image.
              </p>
            )}
        </DialogContent>
      </Dialog>

      <Sheet
        open={editSheetOpen}
        onOpenChange={(open) => {
          setEditSheetOpen(open)
          if (!open) {
            setEditSheetAsset(null)
            void load({ silent: true })
          }
        }}
      >
        <SheetContent
          defaultWidthVw={50}
          className="flex flex-col p-0 sm:max-w-none"
        >
          <SheetHeader className="border-b pr-12">
            <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
              <SheetTitle className="pr-2 text-left">
                {editSheetLoading
                  ? "Loading…"
                  : (editSheetAsset?.title ?? "Annotation editor")}
              </SheetTitle>
              {editSheetAsset && (
                <Link
                  href={`/dashboard/projects/${editSheetAsset.project_id}/annotations/${editSheetAsset.id}/edit`}
                  className="text-sm font-normal text-primary underline-offset-4 hover:underline shrink-0"
                >
                  Full page
                </Link>
              )}
            </div>
            {editSheetAsset && (
              <p className="text-muted-foreground text-sm text-left capitalize">
                {editSheetAsset.file_type} ·{" "}
                {editSheetAsset.status.replace("_", " ")}
              </p>
            )}
          </SheetHeader>
          <SheetBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {editSheetLoading && (
              <div className="flex flex-1 justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {!editSheetLoading && editSheetAsset && (
              <div className="flex min-h-0 flex-1 flex-col">
                <AnnotationAssetEditorPanel asset={editSheetAsset} />
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}
