"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  type Project,
  type ProjectStatus,
  type StoreProjectRequest,
  type UpdateProjectRequest,
} from "@/lib/projects"
import { DEFAULT_PAGE_SIZE } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useAuth } from "@/context/auth-context"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, ExternalLink, FolderOpen, Loader2 } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"

export default function ProjectsPage() {
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const canManageProjects = user?.permissions?.includes("projects:manage") ?? false
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: DEFAULT_PAGE_SIZE,
    total: 0,
  })
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formStatus, setFormStatus] = useState<ProjectStatus>("active")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const params: {
        page: number
        per_page: number
        status?: string
        search?: string
      } = {
        page: currentPage,
        per_page: DEFAULT_PAGE_SIZE,
      }
      if (statusFilter) params.status = statusFilter
      if (searchQuery.trim()) params.search = searchQuery.trim()
      const res = await getProjects(params)
      setProjects(res.data)
      setPagination({
        current_page: res.current_page,
        last_page: res.last_page,
        per_page: res.per_page,
        total: res.total,
      })
    } catch {
      toast.error("Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [currentPage, statusFilter, searchQuery])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openCreateDialog = () => {
    setEditingProject(null)
    setFormName("")
    setFormDescription("")
    setFormStatus("active")
    setDialogOpen(true)
  }

  const openEditDialog = (project: Project) => {
    setEditingProject(project)
    setFormName(project.name)
    setFormDescription(project.description ?? "")
    setFormStatus(project.status)
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) {
      toast.error("Name is required")
      return
    }
    setFormSubmitting(true)
    try {
      if (editingProject) {
        const payload: UpdateProjectRequest = {
          name: formName.trim(),
          description: formDescription.trim() || null,
          status: formStatus,
        }
        await updateProject(editingProject.id, payload)
        toast.success("Project updated")
      } else {
        const payload: StoreProjectRequest = {
          name: formName.trim(),
          description: formDescription.trim() || null,
          status: formStatus,
        }
        await createProject(payload)
        toast.success("Project created")
      }
      setDialogOpen(false)
      loadData()
    } catch {
      toast.error(editingProject ? "Failed to update project" : "Failed to create project")
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete this project?",
      description: "This will permanently remove the project.",
      variant: "destructive",
      confirmLabel: "Delete",
    })
    if (!ok) return
    setDeletingId(id)
    try {
      await deleteProject(id)
      toast.success("Project deleted")
      loadData()
    } catch {
      toast.error("Failed to delete project")
    } finally {
      setDeletingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      active: "default",
      archived: "secondary",
    }
    return (
      <Badge variant={variants[status] ?? "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  if (loading && projects.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-background text-foreground">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-full space-y-6 bg-background text-foreground">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Manage your projects</p>
        </div>
        {canManageProjects && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>All Projects</CardTitle>
              <CardDescription>
                {pagination.total} project{pagination.total !== 1 ? "s" : ""} found
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search name or description…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9 w-48"
              />
              <Select
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
                value={statusFilter || "all"}
                onChange={(v) => {
                  setStatusFilter(v === "all" ? "" : v)
                  setCurrentPage(1)
                }}
                className="h-9 w-36"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">No projects yet</p>
              {canManageProjects && (
                <Button className="mt-4" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first project
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium">{project.name}</TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground">
                        {project.description || "—"}
                      </TableCell>
                      <TableCell>{getStatusBadge(project.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/dashboard/projects/${project.id}`}
                              title="Open project"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                          {canManageProjects && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(project)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(project.id)}
                                disabled={deletingId === project.id}
                              >
                                {deletingId === project.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pagination.last_page > 1 && (
                <Pagination
                  currentPage={pagination.current_page}
                  totalPages={pagination.last_page}
                  onPageChange={setCurrentPage}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "Edit project" : "New project"}
            </DialogTitle>
            <DialogDescription>
              {editingProject
                ? "Update project name, description, and status."
                : "Create a new project."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Project name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                options={[
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
                value={formStatus}
                onChange={(v) => setFormStatus(v as ProjectStatus)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={formSubmitting}>
                {formSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingProject ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
