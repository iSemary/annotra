"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileJson,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  createAnnotationAsset,
  deleteAnnotationAsset,
  downloadAnnotationExport,
  listAnnotationAssets,
  listAnnotations,
  type AnnotationAsset,
  type AnnotationFileType,
} from "@/lib/annotation-assets"
import { canWriteAnnotationModality } from "@/lib/annotation-nav"
import { getProjects, type Project } from "@/lib/projects"
import { DEFAULT_PAGE_SIZE } from "@/lib/api"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Badge } from "@/components/ui/badge"

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

function formatDatasetSize(a: AnnotationAsset): string {
  const v = a.dataset_size?.value
  const u = a.dataset_size?.unit ?? ""
  if (v === null || v === undefined) return "—"
  return `${v} ${u}`
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
  const projectId = typeof params.id === "string" ? params.id : ""
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
  } | null>(null)
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sortBy, setSortBy] = useState<"annotations_count" | "updated_at" | "progress">(
    "updated_at",
  )
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const [createTitle, setCreateTitle] = useState("")
  const [createStatus, setCreateStatus] = useState<string>("draft")
  const [createFileType, setCreateFileType] = useState<AnnotationFileType>("image")
  const [createPrimaryId, setCreatePrimaryId] = useState<string | null>(null)
  const [createDatasetIds, setCreateDatasetIds] = useState<string[]>([])
  const [createFrameCount, setCreateFrameCount] = useState("")
  const [createDuration, setCreateDuration] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [jsonDialog, setJsonDialog] = useState<unknown[] | null>(null)
  const [previewAsset, setPreviewAsset] = useState<AnnotationAsset | null>(null)

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
    getProjects({ page: 1, per_page: DEFAULT_PAGE_SIZE })
      .then((res) => {
        if (!cancelled) {
          setProjectsForCreate(res.data)
          setCreateProjectId((prev) => {
            if (prev) return prev
            return res.data[0]?.id ?? ""
          })
        }
      })
      .catch(() => {
        if (!cancelled) setProjectsForCreate([])
      })
    return () => {
      cancelled = true
    }
  }, [listScope])

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, openCreate ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [openCreate, storageKey])

  const effectiveFileType =
    fileTypeFilter === "all" ? "" : fileTypeFilter

  const load = useCallback(async () => {
    if (listScope === "project" && !projectId) return
    setLoading(true)
    try {
      const { items: rows, pagination: p } = await listAnnotationAssets({
        ...(listScope === "project" && projectId
          ? { project_id: projectId }
          : {}),
        page,
        per_page: 10,
        search: searchDebounced || undefined,
        status: statusFilter || undefined,
        file_type: effectiveFileType || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      })
      setItems(rows)
      setPagination(
        p
          ? { total_pages: p.total_pages, total: p.total }
          : { total_pages: 1, total: rows.length },
      )
    } catch {
      toast.error("Failed to load annotation assets")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [
    listScope,
    projectId,
    page,
    searchDebounced,
    statusFilter,
    effectiveFileType,
    sortBy,
    sortDir,
  ])

  useEffect(() => {
    load()
  }, [load])

  const createTypeLocked =
    fileTypeFilter !== "all" ? fileTypeFilter : createFileType

  const canSubmitCreate =
    canWriteMedia &&
    canWriteType(createTypeLocked) &&
    createTitle.trim().length > 0 &&
    (listScope === "global" ? !!createProjectId : true) &&
    (createTypeLocked === "dataset"
      ? createDatasetIds.length >= 2
      : !!createPrimaryId)

  async function onUploadSingle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!canWriteMedia) {
      toast.error("You need media:write to upload files")
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

  async function onUploadDataset(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    if (!canWriteMedia) {
      toast.error("You need media:write to upload files")
      return
    }
    setUploading(true)
    try {
      const ids: string[] = []
      for (const f of Array.from(files)) {
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
      const body: Parameters<typeof createAnnotationAsset>[0] = {
        project_id: targetProjectId,
        file_type: createTypeLocked,
        title: createTitle.trim(),
        status: createStatus as AnnotationAsset["status"],
      }
      if (createTypeLocked === "dataset") {
        body.dataset_media_ids = createDatasetIds
      } else {
        body.primary_media_id = createPrimaryId
      }
      if (createFrameCount.trim()) {
        body.frame_count = parseInt(createFrameCount, 10)
      }
      if (createDuration.trim()) {
        body.duration_seconds = parseFloat(createDuration)
      }
      await createAnnotationAsset(body)
      toast.success("Annotation asset created")
      setCreateTitle("")
      setCreatePrimaryId(null)
      setCreateDatasetIds([])
      setCreateFrameCount("")
      setCreateDuration("")
      setOpenCreate(false)
      setPage(1)
      await load()
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
      await load()
    } catch {
      toast.error("Delete failed")
    }
  }

  const sortOptions = useMemo(() => SORT_OPTS, [])

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
          <Button variant="outline" className="w-full justify-between sm:w-auto">
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
                    onChange={(v) => setCreateFileType(v as AnnotationFileType)}
                    aria-label="File type"
                  />
                </div>
              )}
              <div className="min-w-0 space-y-2">
                <Label htmlFor="ann-title">Title</Label>
                <Input
                  id="ann-title"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="Display name"
                  required
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label>Status</Label>
                <Select
                  options={STATUS_OPTS.filter((o) => o.value !== "")}
                  value={createStatus}
                  onChange={setCreateStatus}
                  aria-label="Status"
                />
              </div>
              {createTypeLocked === "dataset" ? (
                <div className="min-w-0 space-y-2 md:col-span-3">
                  <Label>Dataset images (min 2)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={!canWriteMedia || uploading}
                    onChange={onUploadDataset}
                  />
                  <p className="text-xs text-muted-foreground">
                    {createDatasetIds.length} file(s) linked
                  </p>
                </div>
              ) : (
                <div className="min-w-0 space-y-2 md:col-span-3">
                  <Label>Media file</Label>
                  <Input
                    type="file"
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
              <div className="min-w-0 space-y-2">
                <Label htmlFor="fc">Frame count (optional)</Label>
                <Input
                  id="fc"
                  inputMode="numeric"
                  value={createFrameCount}
                  onChange={(e) => setCreateFrameCount(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="dur">Duration sec (optional)</Label>
                <Input
                  id="dur"
                  inputMode="decimal"
                  value={createDuration}
                  onChange={(e) => setCreateDuration(e.target.value)}
                />
              </div>
              <div className="flex min-w-0 items-end pb-0.5">
                <Button type="submit" disabled={!canSubmitCreate || submitting}>
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create
                </Button>
              </div>
            </form>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1 flex-1 min-w-[180px]">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Title…"
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
                <TableHead className="text-right w-[200px]">Actions</TableHead>
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
                  <TableRow key={row.id}>
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
                      <TableCell>
                        <Badge variant="secondary">{row.file_type}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {row.title}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.annotations_count}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.updated_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDatasetSize(row)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View annotations JSON"
                          onClick={() => openJsonPreview(row)}
                        >
                          <FileJson className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Preview media"
                          onClick={() => setPreviewAsset(row)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Export JSON"
                          onClick={() =>
                            downloadAnnotationExport(row.id, "json").catch(() =>
                              toast.error("Export failed"),
                            )
                          }
                        >
                          J
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Export CSV"
                          onClick={() =>
                            downloadAnnotationExport(row.id, "csv").catch(() =>
                              toast.error("Export failed"),
                            )
                          }
                        >
                          C
                        </Button>
                        {(row.file_type === "image" ||
                          row.file_type === "dataset") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Export COCO"
                            onClick={() =>
                              downloadAnnotationExport(row.id, "coco").catch(
                                () => toast.error("Export failed"),
                              )
                            }
                          >
                            Co
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link
                            href={`/dashboard/projects/${row.project_id}/annotations/${row.id}/edit`}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        {canWriteType(row.file_type) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            title="Delete"
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {pagination && pagination.total_pages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={pagination.total_pages}
          onPageChange={setPage}
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
    </div>
  )
}
