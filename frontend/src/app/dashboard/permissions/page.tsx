"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getPermissions,
  createPermission,
  updatePermission,
  deletePermission,
  type Permission,
  type StorePermissionRequest,
  type UpdatePermissionRequest,
} from "@/lib/permissions"
import { DEFAULT_PAGE_SIZE } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { TableActionButton } from "@/components/ui/table-action-button"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Plus, Edit, Trash2 } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"

const createSchema = z.object({
  code: z.string().min(1, "Code is required").max(128),
  description: z.string().max(2000).optional().or(z.literal("")),
})

const updateSchema = z.object({
  description: z.string().max(2000).optional().or(z.literal("")),
})

type CreateValues = z.infer<typeof createSchema>
type UpdateValues = z.infer<typeof updateSchema>

export default function PermissionsPage() {
  const { confirm } = useConfirm()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPermission, setEditingPermission] =
    useState<Permission | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: DEFAULT_PAGE_SIZE,
    total: 0,
  })

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { code: "", description: "" },
  })

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: { description: "" },
  })


  useEffect(() => {
    if (editingPermission) {
      updateForm.reset({
        description: editingPermission.description ?? "",
      })
    } else {
      createForm.reset({ code: "", description: "" })
    }
  }, [editingPermission, createForm, updateForm])

  const loadPermissions = useCallback(async () => {
    try {
      setLoading(true)
      const response = await getPermissions(currentPage, DEFAULT_PAGE_SIZE)
      setPermissions(response.data)
      setPagination({
        current_page: response.current_page,
        last_page: response.last_page,
        per_page: response.per_page,
        total: response.total,
      })
    } catch {
      toast.error("Failed to load permissions")
    } finally {
      setLoading(false)
    }
  }, [currentPage])

  useEffect(() => {
    void loadPermissions()
  }, [loadPermissions])

  const handleCreate = async (values: CreateValues) => {
    try {
      const payload: StorePermissionRequest = {
        code: values.code.trim(),
        description: values.description?.trim() || null,
      }
      await createPermission(payload)
      toast.success("Permission created successfully")
      setDialogOpen(false)
      setEditingPermission(null)
      createForm.reset()
      loadPermissions()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || "Failed to create permission")
    }
  }

  const handleUpdate = async (values: UpdateValues) => {
    if (!editingPermission) return
    try {
      const payload: UpdatePermissionRequest = {
        description: values.description?.trim() || null,
      }
      await updatePermission(editingPermission.id, payload)
      toast.success("Permission updated successfully")
      setDialogOpen(false)
      setEditingPermission(null)
      updateForm.reset()
      loadPermissions()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || "Failed to update permission")
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete this permission?",
      variant: "destructive",
      confirmLabel: "Delete",
    })
    if (!ok) return

    try {
      await deletePermission(id)
      toast.success("Permission deleted successfully")
      loadPermissions()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || "Failed to delete permission")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading permissions...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Permissions</h1>
          <p className="text-muted-foreground">
            Permission catalog (creating/deleting requires superuser)
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              setEditingPermission(null)
              createForm.reset()
              updateForm.reset()
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Permission
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPermission
                  ? "Edit Permission"
                  : "Create New Permission"}
              </DialogTitle>
              <DialogDescription>
                {editingPermission
                  ? "Update description (code is fixed)."
                  : "Define a stable permission code."}
              </DialogDescription>
            </DialogHeader>
            {editingPermission ? (
              <Form {...updateForm}>
                <form
                  onSubmit={updateForm.handleSubmit(handleUpdate)}
                  className="space-y-4"
                >
                  <p className="font-mono text-sm">{editingPermission.code}</p>
                  <FormField
                    control={updateForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false)
                        setEditingPermission(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Update</Button>
                  </DialogFooter>
                </form>
              </Form>
            ) : (
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit(handleCreate)}
                  className="space-y-4"
                >
                  <FormField
                    control={createForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. annotations:read"
                            className="font-mono"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false)
                        setEditingPermission(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Create</Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Permissions</CardTitle>
          <CardDescription>
            {permissions.length} permission
            {permissions.length !== 1 ? "s" : ""} on this page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((permission) => (
                  <TableRow key={permission.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {permission.code}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {permission.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <TableActionButton
                          label="Edit permission"
                          onClick={() => {
                            setEditingPermission(permission)
                            setDialogOpen(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </TableActionButton>
                        <TableActionButton
                          label="Delete permission"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(permission.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </TableActionButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                No permissions on this page.
              </p>
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={pagination.last_page}
            onPageChange={setCurrentPage}
            totalItems={pagination.total}
            pageSize={pagination.per_page}
          />
        </CardContent>
      </Card>
    </div>
  )
}
