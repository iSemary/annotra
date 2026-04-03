"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  patchUserRole,
  type User,
  type StoreUserRequest,
  type UpdateUserRequest,
} from "@/lib/users"
import { getAllRoles, type Role } from "@/lib/roles"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useConfirm } from "@/components/ui/confirm-dialog"
import * as z from "zod"
import { toast } from "sonner"
import { Plus, Edit, Trash2 } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"

const e164 = /^\+[1-9]\d{6,14}$/

const userFormSchema = z
  .object({
    full_name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    phone: z
      .string()
      .min(8)
      .refine((v) => e164.test(v), "Use E.164 format, e.g. +12025550199"),
    password: z.string().min(8).optional().or(z.literal("")),
    password_confirmation: z.string().optional().or(z.literal("")),
    role_id: z.string().min(1, "Role is required"),
  })
  .refine(
    (data) =>
      !data.password ||
      !data.password_confirmation ||
      data.password === data.password_confirmation,
    { path: ["password_confirmation"], message: "Passwords must match" },
  )

type UserFormValues = z.infer<typeof userFormSchema>

export default function UsersPage() {
  const { confirm } = useConfirm()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: DEFAULT_PAGE_SIZE,
    total: 0,
  })

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      password: "",
      password_confirmation: "",
      role_id: "",
    },
  })

  useEffect(() => {
    let cancelled = false
    getAllRoles()
      .then((list) => {
        if (!cancelled) setRoles(list)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load roles")
          setRoles([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (editingUser) {
      form.reset({
        full_name: editingUser.full_name,
        email: editingUser.email,
        phone: editingUser.phone,
        password: "",
        password_confirmation: "",
        role_id: editingUser.role_id,
      })
    } else {
      form.reset({
        full_name: "",
        email: "",
        phone: "",
        password: "",
        password_confirmation: "",
        role_id: roles[0]?.id ?? "",
      })
    }
  }, [editingUser, form, roles])

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const usersResponse = await getUsers(currentPage, DEFAULT_PAGE_SIZE)
      setUsers(usersResponse.data)
      setPagination({
        current_page: usersResponse.current_page,
        last_page: usersResponse.last_page,
        per_page: usersResponse.per_page,
        total: usersResponse.total,
      })
    } catch {
      toast.error("Failed to load users")
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [currentPage])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleSubmit = async (values: UserFormValues) => {
    try {
      if (editingUser) {
        const patch: UpdateUserRequest = {
          full_name: values.full_name,
          email: values.email,
          phone: values.phone,
        }
        await updateUser(editingUser.id, patch)
        if (values.role_id !== editingUser.role_id) {
          await patchUserRole(editingUser.id, values.role_id)
        }
        toast.success("User updated successfully")
      } else {
        if (!values.password) {
          toast.error("Password is required for new users")
          return
        }
        const payload: StoreUserRequest = {
          full_name: values.full_name,
          email: values.email,
          phone: values.phone,
          password: values.password,
          role_id: values.role_id,
        }
        await createUser(payload)
        toast.success("User created successfully")
      }
      setDialogOpen(false)
      setEditingUser(null)
      form.reset()
      loadUsers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(
        err.response?.data?.message ||
          `Failed to ${editingUser ? "update" : "create"} user`,
      )
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete this user?",
      variant: "destructive",
      confirmLabel: "Delete",
    })
    if (!ok) return

    try {
      await deleteUser(id)
      toast.success("User deleted successfully")
      loadUsers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || "Failed to delete user")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage users in your company
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              setEditingUser(null)
              form.reset()
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingUser ? "Edit User" : "Create New User"}
              </DialogTitle>
              <DialogDescription>
                {editingUser
                  ? "Update profile and role"
                  : "Add a user to your company"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="user@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (E.164) *</FormLabel>
                      <FormControl>
                        <Input placeholder="+12025550199" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role *</FormLabel>
                      <FormControl>
                        <Select
                          options={roles.map((r) => ({
                            value: r.id,
                            label: `${r.name}${r.is_system ? " (system)" : ""}`,
                          }))}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Select a role"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!editingUser && (
                  <>
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password *</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password_confirmation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm password *</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false)
                      setEditingUser(null)
                      form.reset()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingUser ? "Update" : "Create"} User
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {users.length} user{users.length !== 1 ? "s" : ""} on this page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {user.phone}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                        {user.role_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <TableActionButton
                          label="Edit user"
                          onClick={() => {
                            setEditingUser(user)
                            setDialogOpen(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </TableActionButton>
                        <TableActionButton
                          label="Delete user"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(user.id)}
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
              <p className="text-muted-foreground">No users on this page.</p>
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
