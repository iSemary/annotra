"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type StoreRoleRequest,
  type UpdateRoleRequest,
} from "@/lib/roles"
import {
  getAllPermissions,
  type Permission,
} from "@/lib/permissions"
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
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Plus, Edit, Trash2 } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"

const roleFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  hierarchy_level: z.number().int().min(0).max(1000),
  permission_ids: z.array(z.string()).optional(),
})

type RoleFormValues = z.infer<typeof roleFormSchema>

function permissionIdsForRole(role: Role, allPerms: Permission[]): string[] {
  const codes = new Set(role.permission_codes)
  return allPerms.filter((p) => codes.has(p.code)).map((p) => p.id)
}

export default function RolesPage() {
  const { confirm } = useConfirm()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: DEFAULT_PAGE_SIZE,
    total: 0,
  })

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: "",
      hierarchy_level: 50,
      permission_ids: [],
    },
  })

  const permList = useMemo(() => permissions, [permissions])

  useEffect(() => {
    let cancelled = false
    getAllPermissions()
      .then((list) => {
        if (!cancelled) setPermissions(list)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load permissions")
          setPermissions([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true)
      const rolesResponse = await getRoles(currentPage, DEFAULT_PAGE_SIZE)
      setRoles(rolesResponse.data)
      setPagination({
        current_page: rolesResponse.current_page,
        last_page: rolesResponse.last_page,
        per_page: rolesResponse.per_page,
        total: rolesResponse.total,
      })
    } catch {
      toast.error("Failed to load roles")
      setRoles([])
    } finally {
      setLoading(false)
    }
  }, [currentPage])

  useEffect(() => {
    void loadRoles()
  }, [loadRoles])

  useEffect(() => {
    if (editingRole) {
      form.reset({
        name: editingRole.name,
        hierarchy_level: editingRole.hierarchy_level,
        permission_ids: permissionIdsForRole(editingRole, permList),
      })
    } else {
      form.reset({
        name: "",
        hierarchy_level: 50,
        permission_ids: [],
      })
    }
  }, [editingRole, form, permList])

  const handleSubmit = async (values: RoleFormValues) => {
    try {
      const ids = values.permission_ids ?? []
      if (editingRole) {
        const payload: UpdateRoleRequest = {
          name: values.name,
          hierarchy_level: values.hierarchy_level,
          permission_ids: ids,
        }
        await updateRole(editingRole.id, payload)
        toast.success("Role updated successfully")
      } else {
        const payload: StoreRoleRequest = {
          name: values.name,
          hierarchy_level: values.hierarchy_level,
          permission_ids: ids,
        }
        await createRole(payload)
        toast.success("Role created successfully")
      }
      setDialogOpen(false)
      setEditingRole(null)
      form.reset()
      loadRoles()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(
        err.response?.data?.message ||
          `Failed to ${editingRole ? "update" : "create"} role`,
      )
    }
  }

  const handleDelete = async (id: string, isSystem: boolean) => {
    if (isSystem) {
      toast.error("System roles cannot be deleted")
      return
    }
    const ok = await confirm({
      title: "Delete this role?",
      variant: "destructive",
      confirmLabel: "Delete",
    })
    if (!ok) return

    try {
      await deleteRole(id)
      toast.success("Role deleted successfully")
      loadRoles()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || "Failed to delete role")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading roles...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Roles</h1>
          <p className="text-muted-foreground">
            Manage custom roles and permission codes
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              setEditingRole(null)
              form.reset()
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRole ? "Edit Role" : "Create New Role"}
              </DialogTitle>
              <DialogDescription>
                Assign permission IDs from the catalog. Hierarchy level controls
                rank (higher can manage lower).
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Role name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hierarchy_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hierarchy level (0–1000) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={1000}
                          value={field.value}
                          onChange={(e) => {
                            const v = e.target.value
                            field.onChange(
                              v === "" ? 0 : Number.parseInt(v, 10),
                            )
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="permission_ids"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel className="text-base">Permissions</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Toggle permissions for this role
                        </p>
                      </div>
                      {permList.length > 0 ? (
                        permList.map((permission) => (
                          <FormField
                            key={permission.id}
                            control={form.control}
                            name="permission_ids"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(permission.id)}
                                    onCheckedChange={(checked) =>
                                      checked
                                        ? field.onChange([
                                            ...(field.value ?? []),
                                            permission.id,
                                          ])
                                        : field.onChange(
                                            (field.value ?? []).filter(
                                              (v) => v !== permission.id,
                                            ),
                                          )
                                    }
                                  />
                                </FormControl>
                                <FormLabel className="font-normal leading-snug">
                                  <span className="font-mono text-xs">
                                    {permission.code}
                                  </span>
                                  {permission.description ? (
                                    <span className="mt-0.5 block text-muted-foreground text-xs">
                                      {permission.description}
                                    </span>
                                  ) : null}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No permissions available
                        </p>
                      )}
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
                      setEditingRole(null)
                      form.reset()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingRole ? "Update" : "Create"} Role
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Roles</CardTitle>
          <CardDescription>
            {roles.length} role{roles.length !== 1 ? "s" : ""} on this page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      {role.name}
                      {role.is_system ? (
                        <span className="ml-2 text-muted-foreground text-xs">
                          (system)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{role.hierarchy_level}</TableCell>
                    <TableCell>
                      {role.permission_codes.length > 0 ? (
                        <div className="flex max-w-md flex-wrap gap-1">
                          {role.permission_codes.map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingRole(role)
                            setDialogOpen(true)
                          }}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleDelete(role.id, role.is_system)
                          }
                          title="Delete"
                          className="text-red-600 hover:text-red-700"
                          disabled={role.is_system}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No roles on this page.</p>
            </div>
          )}
          {pagination.last_page > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                {pagination.total > 0
                  ? (currentPage - 1) * pagination.per_page + 1
                  : 0}{" "}
                to{" "}
                {Math.min(
                  currentPage * pagination.per_page,
                  pagination.total,
                )}{" "}
                of {pagination.total} roles
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={pagination.last_page}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
